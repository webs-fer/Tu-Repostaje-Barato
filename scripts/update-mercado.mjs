import { writeFile, mkdir } from 'node:fs/promises';

const MARKET_FILE = 'data/mercado.json';
const FRED_BRENT_CSV = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU';
const FRANKFURTER_RANGE = daysBack => `https://api.frankfurter.app/${isoDate(addDays(new Date(), -daysBack))}..?from=EUR&to=USD`;
const GDELT_URL = 'https://api.gdeltproject.org/api/v2/doc/doc';

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { accept: 'text/csv,text/plain,*/*' } });
  if (!response.ok) throw new Error(`Error HTTP ${response.status} en ${url}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Error HTTP ${response.status} en ${url}`);
  return response.json();
}

async function getBrentSignal() {
  const csv = await fetchText(FRED_BRENT_CSV);
  const rows = csv.trim().split(/\r?\n/).slice(1)
    .map(line => {
      const [date, rawValue] = line.split(',');
      const value = Number(rawValue);
      return date && Number.isFinite(value) ? { date, value } : null;
    })
    .filter(Boolean);

  if (rows.length < 2) throw new Error('FRED no devolvió suficientes datos de Brent');

  const latest = rows.at(-1);
  const targetDate = addDays(new Date(`${latest.date}T00:00:00Z`), -7);
  const previous = [...rows].reverse().find(row => new Date(`${row.date}T00:00:00Z`) <= targetDate) || rows.at(-2);
  const change = pctChange(latest.value, previous.value);

  // Aproximación conservadora: 1% semanal de Brent equivale a unos 0,003 €/l de señal a 3 días.
  const signal = clamp((change || 0) * 0.003, -0.03, 0.03);

  return {
    latest_date: latest.date,
    latest_usd_per_barrel: Number(latest.value.toFixed(2)),
    previous_date: previous.date,
    previous_usd_per_barrel: Number(previous.value.toFixed(2)),
    change_7d_pct: change,
    signal_eur_l_3d: Number(signal.toFixed(4)),
  };
}

async function getEurUsdSignal() {
  const data = await fetchJson(FRANKFURTER_RANGE(10));
  const entries = Object.entries(data.rates || {})
    .map(([date, rates]) => ({ date, value: Number(rates.USD) }))
    .filter(entry => entry.date && Number.isFinite(entry.value))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (entries.length < 2) throw new Error('Frankfurter no devolvió suficientes datos EUR/USD');

  const latest = entries.at(-1);
  const previous = entries[0];
  const change = pctChange(latest.value, previous.value);

  // Si el euro cae frente al dólar, el petróleo en dólares pesa más en Europa: impacto positivo en €/l.
  const signal = clamp(-(change || 0) * 0.0015, -0.015, 0.015);

  return {
    latest_date: latest.date,
    latest_rate: Number(latest.value.toFixed(5)),
    previous_date: previous.date,
    previous_rate: Number(previous.value.toFixed(5)),
    change_7d_pct: change,
    signal_eur_l_3d: Number(signal.toFixed(4)),
  };
}

async function getGeopoliticalSignal() {
  const query = '(oil OR brent OR crude OR petroleum) (war OR conflict OR sanctions OR opec OR russia OR iran OR "middle east" OR supply)';
  const params = new URLSearchParams({
    query,
    mode: 'ArtList',
    format: 'json',
    timespan: '7d',
    maxrecords: '50',
    sort: 'datedesc',
  });

  const data = await fetchJson(`${GDELT_URL}?${params.toString()}`);
  const articles = Array.isArray(data.articles) ? data.articles : Array.isArray(data.items) ? data.items : [];
  const titles = articles
    .map(article => String(article.title || article.seendate || article.url || '').trim())
    .filter(Boolean);

  const highRiskWords = ['war', 'attack', 'conflict', 'sanction', 'iran', 'russia', 'red sea', 'middle east', 'supply', 'opec', 'houthi', 'escalation'];
  const highRiskMatches = titles.filter(title => highRiskWords.some(word => title.toLowerCase().includes(word))).length;
  const score = Math.min(100, Math.round(articles.length * 1.2 + highRiskMatches * 6));
  const level = score >= 65 ? 'alto' : score >= 35 ? 'medio' : 'bajo';
  const signal = level === 'alto' ? 0.009 : level === 'medio' ? 0.004 : 0;

  return {
    level,
    score,
    articles_analyzed: articles.length,
    high_risk_matches: highRiskMatches,
    signal_eur_l_3d: signal,
    query,
    sample_titles: titles.slice(0, 5),
  };
}

async function safePart(label, fn, fallback) {
  try {
    return await fn();
  } catch (error) {
    console.warn(`No se pudo actualizar ${label}: ${error.message}`);
    return fallback;
  }
}

const market = {
  updated_at: new Date().toISOString(),
  status: 'actualizado',
  sources: {
    brent: 'FRED DCOILBRENTEU CSV (Brent Europe, USD/barril)',
    eurusd: 'Frankfurter API (EUR/USD, sin API key)',
    geopolitical: 'GDELT DOC 2.0 API (noticias globales, sin API key)',
  },
  brent: await safePart('Brent', getBrentSignal, {
    latest_date: null, latest_usd_per_barrel: null, previous_date: null, previous_usd_per_barrel: null,
    change_7d_pct: null, signal_eur_l_3d: 0,
  }),
  eurusd: await safePart('EUR/USD', getEurUsdSignal, {
    latest_date: null, latest_rate: null, previous_date: null, previous_rate: null,
    change_7d_pct: null, signal_eur_l_3d: 0,
  }),
  geopolitical: await safePart('riesgo geopolítico', getGeopoliticalSignal, {
    level: 'sin datos', score: 0, articles_analyzed: 0, high_risk_matches: 0, signal_eur_l_3d: 0, sample_titles: [],
  }),
  formula: 'Previsión final = 60% histórico carburantes + 25% Brent + 10% EUR/USD + 5% riesgo geopolítico.',
  warning: 'Estimación orientativa. No es una recomendación financiera ni garantiza precios futuros.',
};

await mkdir('data', { recursive: true });
await writeFile(MARKET_FILE, JSON.stringify(market, null, 2), 'utf8');
console.log(`Mercado actualizado: Brent=${market.brent.change_7d_pct ?? 'NA'}%, EUR/USD=${market.eurusd.change_7d_pct ?? 'NA'}%, riesgo=${market.geopolitical.level}`);
