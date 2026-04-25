import { readFile, writeFile, mkdir } from 'node:fs/promises';

const ENDPOINT = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';
const HISTORY_FILE = 'data/historico-precios.json';

function parseSpanishFloat(value) {
  if (value === null || value === undefined || value === '' || value === '0' || value === 0) return null;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  const parsed = Number(String(value).replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractIsoDate(value) {
  const text = String(value || '');
  const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return new Date().toISOString().slice(0, 10);
  const [, day, month, year] = match;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function percentile(sortedValues, percentileValue) {
  if (!sortedValues.length) return null;
  const index = (sortedValues.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function stats(values) {
  const clean = values.filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!clean.length) return { count: 0, min: null, avg: null, median: null, max: null, p25: null, p75: null };
  const sum = clean.reduce((total, value) => total + value, 0);
  const round = value => value === null ? null : Number(value.toFixed(3));
  return {
    count: clean.length,
    min: round(clean[0]),
    avg: round(sum / clean.length),
    median: round(percentile(clean, 0.5)),
    max: round(clean.at(-1)),
    p25: round(percentile(clean, 0.25)),
    p75: round(percentile(clean, 0.75)),
  };
}

function pickFuelPrice(station, fields) {
  for (const field of fields) {
    const value = parseSpanishFloat(station[field]);
    if (value !== null) return value;
  }
  return null;
}

async function loadExistingHistory() {
  try {
    return JSON.parse(await readFile(HISTORY_FILE, 'utf8'));
  } catch {
    return {
      updated_at: new Date().toISOString(),
      source: 'API oficial de precios de carburantes del Gobierno de España',
      scope: 'España',
      records: [],
    };
  }
}

const response = await fetch(ENDPOINT, { headers: { accept: 'application/json' } });
if (!response.ok) throw new Error(`Error HTTP ${response.status} al consultar la API oficial`);
const data = await response.json();
const stations = data.ListaEESSPrecio || [];

const gasolina95 = [];
const diesel = [];
for (const station of stations) {
  const gasolinaPrice = pickFuelPrice(station, ['Precio Gasolina 95 E5', 'Precio Gasolina 95 E10', 'Precio Gasolina 95']);
  const dieselPrice = pickFuelPrice(station, ['Precio Gasoleo A', 'Precio Gasóleo A']);
  if (gasolinaPrice !== null) gasolina95.push(gasolinaPrice);
  if (dieselPrice !== null) diesel.push(dieselPrice);
}

const date = extractIsoDate(data.Fecha);
const newRecord = {
  date,
  timestamp: data.Fecha || new Date().toISOString(),
  fuels: {
    gasolina95: stats(gasolina95),
    diesel: stats(diesel),
  },
};

const history = await loadExistingHistory();
const withoutToday = (history.records || []).filter(record => record.date !== date);
history.updated_at = new Date().toISOString();
history.source = 'API oficial de precios de carburantes del Gobierno de España';
history.scope = 'España';
history.note = 'Histórico diario para calcular tendencia orientativa en GitHub Pages.';
history.records = [...withoutToday, newRecord]
  .sort((a, b) => String(a.date).localeCompare(String(b.date)))
  .slice(-120);

await mkdir('data', { recursive: true });
await writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
console.log(`Histórico actualizado para ${date}: gasolina95=${newRecord.fuels.gasolina95.count}, diesel=${newRecord.fuels.diesel.count}`);
