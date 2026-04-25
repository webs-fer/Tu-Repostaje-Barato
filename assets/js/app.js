const ENDPOINTS = {
  fuelLive: 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/',
  fuelLocal: 'data/estaciones.json',
  fuelHistory: 'data/historico-precios.json',
  market: 'data/mercado.json',
  weather: 'https://api.open-meteo.com/v1/forecast',
  geocode: 'https://geocoding-api.open-meteo.com/v1/search',
  nominatimSearch: 'https://nominatim.openstreetmap.org/search',
  nominatimReverse: 'https://nominatim.openstreetmap.org/reverse',
  overpass: 'https://overpass-api.de/api/interpreter',
};

const state = {
  map: null,
  markers: [],
  userMarker: null,
  searchCircle: null,
  selectedMode: null,
  userCoords: null,
  activeCoords: null,
  activeLocationLabel: '',
  customModeEnabled: false,
  defaultRadiusKm: 10,
  fuelDataCache: null,
  fuelDataSource: '',
  fuelDataDate: '',
  fuelHistoryCache: null,
  marketCache: null,
  localHistoryKey: 'trb_price_history_v1',
};

const el = {
  dashboard: document.getElementById('dashboard'),
  modeButtons: document.querySelectorAll('.mode-btn'),
  selectedModeBadge: document.getElementById('selectedModeBadge'),
  locationQuery: document.getElementById('locationQuery'),
  customLocationWrap: document.getElementById('customLocationWrap'),
  customLocationInput: document.getElementById('customLocationInput'),
  toggleCustomBtn: document.getElementById('toggleCustomBtn'),
  refreshLocationBtn: document.getElementById('refreshLocationBtn'),
  searchBtn: document.getElementById('searchBtn'),
  stationsList: document.getElementById('stationsList'),
  forecastPanel: document.getElementById('forecastPanel'),
  forecastTitle: document.getElementById('forecastTitle'),
  forecastContent: document.getElementById('forecastContent'),
  forecastBadge: document.getElementById('forecastBadge'),
  weatherContent: document.getElementById('weatherContent'),
  mainTopTitle: document.getElementById('mainTopTitle'),
  kpiCountLabel: document.getElementById('kpiCountLabel'),
  kpiCount: document.getElementById('kpiCount'),
  kpiCountSub: document.getElementById('kpiCountSub'),
  kpiPriceLabel: document.getElementById('kpiPriceLabel'),
  kpiPrice: document.getElementById('kpiPrice'),
  kpiPriceSub: document.getElementById('kpiPriceSub'),
  kpiDistanceLabel: document.getElementById('kpiDistanceLabel'),
  kpiDistance: document.getElementById('kpiDistance'),
  kpiDistanceSub: document.getElementById('kpiDistanceSub'),
  kpiUpdate: document.getElementById('kpiUpdate'),
  toast: document.getElementById('toast'),
};

function showToast(message, isError = false) {
  el.toast.textContent = message;
  el.toast.className = `toast toast--visible ${isError ? 'toast--error' : ''}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    el.toast.className = 'toast';
  }, 3600);
}

function initMap() {
  state.map = L.map('map', { zoomControl: true }).setView([39.0, -1.86], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(state.map);
}

function resetMapLayers() {
  state.markers.forEach(marker => state.map.removeLayer(marker));
  state.markers = [];
  if (state.userMarker) {
    state.map.removeLayer(state.userMarker);
    state.userMarker = null;
  }
  if (state.searchCircle) {
    state.map.removeLayer(state.searchCircle);
    state.searchCircle = null;
  }
}

function directionsUrl(lat, lon) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lon}`)}`;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatPrice(value, withUnit = true) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  const text = Number(value).toFixed(3).replace('.', ',');
  return withUnit ? `${text} €/l` : text;
}

function formatDistance(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  return `${Number(value).toFixed(2).replace('.', ',')} km`;
}

function modeLabel(mode) {
  if (mode === 'diesel') return 'Diésel';
  if (mode === 'electrico') return 'Eléctrico';
  return 'Gasolina';
}

function modeTitle(mode) {
  if (mode === 'diesel') return 'Top de diésel más barato';
  if (mode === 'electrico') return 'Top de recarga eléctrica';
  return 'Top de gasolina más barata';
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status}`);
  }
  const data = await response.json();
  if (data?.error) {
    throw new Error(data.error);
  }
  return data;
}

function parseSpanishFloat(value) {
  if (value === null || value === undefined || value === '' || value === '0' || value === 0) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const cleaned = String(value).replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function extractDatasetDate(value) {
  if (!value) return '';
  const text = String(value);
  const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return '';
  const [, day, month, year] = match;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371;
  const toRad = degrees => degrees * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(a)));
}

function fuelFieldAliases(fuelType) {
  if (fuelType === 'gasolina98') return ['Precio Gasolina 98 E5', 'Precio Gasolina 98 E10', 'Precio Gasolina 98'];
  if (fuelType === 'diesel') return ['Precio Gasoleo A', 'Precio Gasóleo A'];
  if (fuelType === 'dieselpremium') return ['Precio Gasoleo Premium', 'Precio Gasóleo Premium', 'Precio Gasoleo A Premium', 'Precio Gasóleo A Premium'];
  return ['Precio Gasolina 95 E5', 'Precio Gasolina 95 E10', 'Precio Gasolina 95'];
}

function pickFuelPrice(station, fuelType) {
  for (const field of fuelFieldAliases(fuelType)) {
    if (Object.hasOwn(station, field)) {
      const parsed = parseSpanishFloat(station[field]);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

async function loadFuelData() {
  if (state.fuelDataCache) return state.fuelDataCache;

  try {
    state.fuelDataCache = await fetchJson(ENDPOINTS.fuelLive, { cache: 'no-store' });
    state.fuelDataSource = 'API oficial en directo';
    state.fuelDataDate = extractDatasetDate(state.fuelDataCache?.Fecha) || toIsoDate();
    return state.fuelDataCache;
  } catch (liveError) {
    state.fuelDataCache = await fetchJson(ENDPOINTS.fuelLocal);
    state.fuelDataSource = 'copia local incluida';
    state.fuelDataDate = extractDatasetDate(state.fuelDataCache?.Fecha) || toIsoDate();
    return state.fuelDataCache;
  }
}

async function getFuelStations(lat, lon, radiusKm, fuelType) {
  const data = await loadFuelData();
  const stations = [];

  for (const station of data.ListaEESSPrecio ?? []) {
    const stationLat = parseSpanishFloat(station.Latitud);
    const stationLon = parseSpanishFloat(station['Longitud (WGS84)']);
    if (stationLat === null || stationLon === null) continue;

    const price = pickFuelPrice(station, fuelType);
    if (price === null) continue;

    const distance = haversineKm(lat, lon, stationLat, stationLon);
    if (distance > radiusKm) continue;

    stations.push({
      id: station.IDEESS ?? null,
      name: station['Rótulo'] || 'Gasolinera',
      address: `${station['Dirección'] ?? ''} ${station['C.P.'] ?? ''}`.trim(),
      municipality: station.Municipio ?? '',
      province: station.Provincia ?? '',
      fuel_type: fuelType,
      price,
      distance_km: Math.round(distance * 100) / 100,
      latitude: stationLat,
      longitude: stationLon,
      schedule: station.Horario ?? '',
    });
  }

  stations.sort((a, b) => a.price - b.price || a.distance_km - b.distance_km);
  return { count: stations.length, items: stations.slice(0, 50) };
}

async function getWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '1',
  });
  const data = await fetchJson(`${ENDPOINTS.weather}?${params.toString()}`);
  return {
    current: data.current ?? {},
    daily: data.daily ?? {},
  };
}

async function geocode(query) {
  const openMeteoParams = new URLSearchParams({
    name: query,
    count: '5',
    language: 'es',
    format: 'json',
  });

  try {
    const data = await fetchJson(`${ENDPOINTS.geocode}?${openMeteoParams.toString()}`);
    const results = (data.results ?? []).map(item => ({
      name: item.name ?? '',
      country: item.country ?? '',
      admin1: item.admin1 ?? '',
      latitude: Number(item.latitude ?? 0),
      longitude: Number(item.longitude ?? 0),
    }));
    if (results.length) return results[0];
  } catch {
    // Si Open-Meteo falla, probamos con Nominatim.
  }

  const nominatimParams = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
    'accept-language': 'es',
  });
  const nominatimData = await fetchJson(`${ENDPOINTS.nominatimSearch}?${nominatimParams.toString()}`);
  if (!nominatimData.length) {
    throw new Error('No se ha encontrado esa ubicación');
  }

  const first = nominatimData[0];
  return {
    name: first.name || first.display_name || query,
    country: first.address?.country ?? '',
    admin1: first.address?.state ?? '',
    latitude: Number(first.lat),
    longitude: Number(first.lon),
  };
}

async function reverseGeocode(lat, lon) {
  try {
    const params = new URLSearchParams({
      lat,
      lon,
      format: 'jsonv2',
      'accept-language': 'es',
    });
    const data = await fetchJson(`${ENDPOINTS.nominatimReverse}?${params.toString()}`);
    const address = data.address ?? {};
    const parts = [
      address.city || address.town || address.village || address.municipality,
      address.state,
      address.country,
    ].filter(Boolean);
    return parts.length ? parts.join(', ') : (data.display_name || 'Tu ubicación actual');
  } catch {
    return `Lat ${Number(lat).toFixed(4)}, Lon ${Number(lon).toFixed(4)}`;
  }
}

function buildOverpassQuery(lat, lon, radiusKm) {
  const radiusMeters = radiusKm * 1000;
  return `[out:json][timeout:25];
(
  node["amenity"="charging_station"](around:${radiusMeters},${lat},${lon});
  way["amenity"="charging_station"](around:${radiusMeters},${lat},${lon});
  relation["amenity"="charging_station"](around:${radiusMeters},${lat},${lon});
);
out center tags;`;
}

function parseChargeValue(charge) {
  if (charge === null || charge === undefined) return null;
  const text = String(charge).trim();
  if (!text) return null;
  if (/\bfree\b|gratis/i.test(text)) return 0;
  const match = text.match(/-?\d+(?:[\.,]\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0].replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function socketLabel(tags) {
  const known = [];
  const map = {
    'socket:type2': 'Type 2',
    'socket:type2_combo': 'CCS Combo',
    'socket:ccs': 'CCS',
    'socket:chademo': 'CHAdeMO',
    'socket:tesla_supercharger': 'Tesla Supercharger',
    'socket:tesla_destination': 'Tesla Destination',
    'socket:schuko': 'Schuko',
  };

  for (const [key, label] of Object.entries(map)) {
    const value = tags[key];
    if (value && value !== '0' && String(value).toLowerCase() !== 'no') {
      known.push(label);
    }
  }

  return known.length ? known.join(', ') : 'Conector no indicado';
}

function evPricing(tags) {
  const chargeRaw = tags.charge ?? tags['charge:conditional'] ?? null;
  const fee = String(tags.fee ?? '').trim().toLowerCase();
  const parkingFee = String(tags['parking:fee'] ?? '').trim().toLowerCase();
  const numericCharge = parseChargeValue(chargeRaw);

  if (numericCharge !== null && numericCharge <= 0) {
    return { price_numeric: 0, price_display: 'Gratis', price_label: 'Sin coste indicado', sort_rank: 0 };
  }
  if (numericCharge !== null) {
    return { price_numeric: numericCharge, price_display: String(chargeRaw).trim(), price_label: 'Tarifa informada', sort_rank: 1 };
  }
  if (fee === 'no' && parkingFee !== 'yes') {
    return { price_numeric: 0, price_display: 'Gratis', price_label: 'Sin pago según OSM', sort_rank: 0 };
  }
  if (fee === 'yes' || parkingFee === 'yes') {
    return { price_numeric: null, price_display: 'De pago', price_label: 'Importe no indicado', sort_rank: 3 };
  }
  return { price_numeric: null, price_display: 'Consultar', price_label: 'Tarifa no indicada', sort_rank: 2 };
}

async function getChargingStations(lat, lon, radiusKm) {
  const query = buildOverpassQuery(lat, lon, radiusKm);
  const data = await fetchJson(ENDPOINTS.overpass, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: query,
  });

  const items = [];
  for (const element of data.elements ?? []) {
    const itemLat = element.lat ?? element.center?.lat ?? null;
    const itemLon = element.lon ?? element.center?.lon ?? null;
    if (itemLat === null || itemLon === null) continue;

    const tags = element.tags ?? {};
    const distance = haversineKm(lat, lon, Number(itemLat), Number(itemLon));
    const pricing = evPricing(tags);

    items.push({
      id: `${element.type ?? 'node'}-${element.id ?? crypto.randomUUID?.() ?? Math.random()}`,
      name: tags.name || 'Punto de carga',
      brand: tags.brand || '',
      operator: tags.operator || '',
      distance_km: Math.round(distance * 100) / 100,
      latitude: Number(itemLat),
      longitude: Number(itemLon),
      address: `${tags['addr:street'] ?? ''} ${tags['addr:housenumber'] ?? ''}`.trim(),
      opening_hours: tags.opening_hours || '',
      socket_label: socketLabel(tags),
      fee: tags.fee || '',
      charge: tags.charge ?? null,
      price_numeric: pricing.price_numeric,
      price_display: pricing.price_display,
      price_label: pricing.price_label,
      sort_rank: pricing.sort_rank,
    });
  }

  items.sort((a, b) => {
    const aPrice = a.price_numeric ?? 999999;
    const bPrice = b.price_numeric ?? 999999;
    return a.sort_rank - b.sort_rank || aPrice - bPrice || a.distance_km - b.distance_km;
  });

  return { count: items.length, items: items.slice(0, 30) };
}

function setSelectedMode(mode) {
  state.selectedMode = mode;
  el.modeButtons.forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('mode-btn--active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  el.dashboard.classList.remove('dashboard-grid--hidden');
  el.selectedModeBadge.textContent = modeLabel(mode);
  el.mainTopTitle.textContent = modeTitle(mode);

  if (mode === 'electrico') {
    resetForecast('La previsión de tendencia se calcula solo para gasolina y diésel.');
  } else {
    el.forecastTitle.textContent = `Previsión ${modeLabel(mode).toLowerCase()} próximos días`;
    el.forecastBadge.textContent = 'Calculando';
  }

  if (mode === 'electrico') {
    el.kpiCountLabel.textContent = 'Cargadores';
    el.kpiCountSub.textContent = 'dentro del radio';
    el.kpiPriceLabel.textContent = 'Tarifa desde';
    el.kpiPriceSub.textContent = 'si está publicada';
  } else {
    el.kpiCountLabel.textContent = 'Estaciones';
    el.kpiCountSub.textContent = `de ${modeLabel(mode).toLowerCase()}`;
    el.kpiPriceLabel.textContent = 'Precio mínimo';
    el.kpiPriceSub.textContent = '€/l';
  }
}

function renderEmptyTop(message) {
  el.stationsList.className = 'card-list empty-state';
  el.stationsList.textContent = message;
}

function renderResults(items, mode) {
  if (!items?.length) {
    renderEmptyTop('No se han encontrado resultados en esta zona.');
    return;
  }

  el.stationsList.className = 'card-list';
  el.stationsList.innerHTML = items.map((item, index) => {
    const navUrl = directionsUrl(item.latitude, item.longitude);
    const order = `<span class="rank-pill">#${index + 1}</span>`;

    if (mode === 'electrico') {
      return `
        <a class="result-card result-card--link" href="${navUrl}" target="_blank" rel="noopener">
          <div class="result-card__left">
            <div class="result-card__title-row">
              ${order}
              <h3>${escapeHtml(item.name)}</h3>
            </div>
            <p>${escapeHtml(item.brand || item.operator || item.address || 'Punto de carga')}</p>
            <small>${escapeHtml(item.socket_label || 'Conector no indicado')}</small>
            <div class="card-meta">
              <span class="meta-chip">${escapeHtml(item.price_label || 'Tarifa no indicada')}</span>
              <span class="meta-chip">GPS</span>
            </div>
          </div>
          <div class="result-card__right card-right">
            <strong class="card-right--ev">${escapeHtml(item.price_display || 'Consultar')}</strong>
            <small>${formatDistance(item.distance_km)}</small>
            <span class="nav-chip">Ir ahora ↗</span>
          </div>
        </a>
      `;
    }

    return `
      <a class="result-card result-card--link" href="${navUrl}" target="_blank" rel="noopener">
        <div class="result-card__left">
          <div class="result-card__title-row">
            ${order}
            <h3>${escapeHtml(item.name)}</h3>
          </div>
          <p>${escapeHtml(item.address || item.municipality || '')}</p>
          <small>${escapeHtml(item.schedule || 'Horario no disponible')}</small>
          <div class="card-meta">
            <span class="meta-chip">${escapeHtml(item.municipality || item.province || 'Estación')}</span>
            <span class="meta-chip">GPS</span>
          </div>
        </div>
        <div class="result-card__right card-right">
          <strong>${formatPrice(item.price)}</strong>
          <small>${formatDistance(item.distance_km)}</small>
          <span class="nav-chip">Ir ahora ↗</span>
        </div>
      </a>
    `;
  }).join('');
}

function updateKpis(items, mode) {
  const first = items?.[0] || null;
  el.kpiCount.textContent = items?.length || 0;
  el.kpiDistance.textContent = first ? formatDistance(first.distance_km) : '--';
  el.kpiUpdate.textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  if (mode === 'electrico') {
    el.kpiPrice.textContent = first?.price_display || 'Consultar';
  } else {
    el.kpiPrice.textContent = first ? formatPrice(first.price, false) : '--';
  }
}

function safeRound(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : '--';
}

function renderWeather(data) {
  const current = data?.current;
  const daily = data?.daily;
  if (!current || !Object.keys(current).length) {
    el.weatherContent.className = 'weather-box empty-state';
    el.weatherContent.textContent = 'No se ha podido cargar el tiempo.';
    return;
  }

  const max = daily?.temperature_2m_max?.[0];
  const min = daily?.temperature_2m_min?.[0];
  const rain = daily?.precipitation_probability_max?.[0];

  el.weatherContent.className = 'weather-box';
  el.weatherContent.innerHTML = `
    <div class="weather-main">
      <div>
        <strong>${safeRound(current.temperature_2m)}°</strong>
        <span>Sensación ${safeRound(current.apparent_temperature)}°</span>
      </div>
      <div class="weather-rain">
        <label>Lluvia</label>
        <b>${rain ?? '--'}%</b>
      </div>
    </div>

    <div class="weather-meta">
      <div><label>Viento</label><span>${current.wind_speed_10m ?? '--'} km/h</span></div>
      <div><label>Humedad</label><span>${current.relative_humidity_2m ?? '--'}%</span></div>
      <div><label>Máxima</label><span>${safeRound(max)}°</span></div>
      <div><label>Mínima</label><span>${safeRound(min)}°</span></div>
    </div>
  `;
}

function resetForecast(message = 'Elige gasolina o diésel para calcular la tendencia estimada.') {
  if (!el.forecastPanel) return;
  el.forecastPanel.classList.add('forecast-card--hidden');
  el.forecastTitle.textContent = 'Tendencia próximos días';
  el.forecastBadge.textContent = 'Datos';
  el.forecastContent.textContent = message;
}

async function loadFuelHistory() {
  if (state.fuelHistoryCache) return state.fuelHistoryCache;
  try {
    state.fuelHistoryCache = await fetchJson(ENDPOINTS.fuelHistory, { cache: 'no-store' });
  } catch {
    state.fuelHistoryCache = { records: [] };
  }
  return state.fuelHistoryCache;
}

function localHistoryLocationKey(label) {
  return String(label || 'sin-ubicacion')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'sin-ubicacion';
}

function readLocalHistory() {
  try {
    return JSON.parse(localStorage.getItem(state.localHistoryKey) || '{}');
  } catch {
    return {};
  }
}

function writeLocalHistory(history) {
  try {
    localStorage.setItem(state.localHistoryKey, JSON.stringify(history));
  } catch {
    // Si el navegador bloquea localStorage, seguimos con el histórico del repositorio.
  }
}

function computeCurrentFuelStats(items) {
  const prices = (items || [])
    .map(item => Number(item.price))
    .filter(value => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  if (!prices.length) return null;

  const avg = prices.reduce((sum, value) => sum + value, 0) / prices.length;
  const median = prices.length % 2
    ? prices[Math.floor(prices.length / 2)]
    : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2;

  return {
    date: state.fuelDataDate || toIsoDate(),
    min: Number(prices[0].toFixed(3)),
    avg: Number(avg.toFixed(3)),
    median: Number(median.toFixed(3)),
    count: prices.length,
  };
}

function upsertLocalObservation(mode, locationLabel, stats) {
  if (!stats || !stats.date || mode === 'electrico') return [];
  const allHistory = readLocalHistory();
  const locationKey = localHistoryLocationKey(locationLabel);
  const key = `${mode}__${locationKey}`;
  const existing = Array.isArray(allHistory[key]) ? allHistory[key] : [];
  const withoutSameDay = existing.filter(entry => entry.date !== stats.date);
  const next = [...withoutSameDay, stats]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-30);
  allHistory[key] = next;
  writeLocalHistory(allHistory);
  return next;
}

function officialHistorySeries(history, mode) {
  return (history.records || [])
    .map(record => {
      const fuel = record.fuels?.[mode];
      const value = Number(fuel?.min ?? fuel?.avg ?? fuel?.median);
      if (!record.date || !Number.isFinite(value) || value <= 0) return null;
      return {
        date: record.date,
        value,
        source: 'Histórico nacional',
        count: Number(fuel?.count || 0),
      };
    })
    .filter(Boolean);
}

function mergeSeriesByDate(series) {
  const map = new Map();
  for (const point of series) {
    if (!point?.date || !Number.isFinite(Number(point.value))) continue;
    map.set(point.date, { ...point, value: Number(point.value) });
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function dateDiffDays(firstDate, secondDate) {
  const first = new Date(`${firstDate}T00:00:00`);
  const second = new Date(`${secondDate}T00:00:00`);
  const diff = (second.getTime() - first.getTime()) / 86400000;
  return Number.isFinite(diff) ? Math.max(diff, 0) : 0;
}

function calculateTrend(series) {
  const clean = mergeSeriesByDate(series).slice(-14);
  if (clean.length < 2) return null;

  const firstDate = clean[0].date;
  const xs = clean.map(point => dateDiffDays(firstDate, point.date));
  const ys = clean.map(point => point.value);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;

  let numerator = 0;
  let denominator = 0;
  xs.forEach((x, index) => {
    numerator += (x - meanX) * (ys[index] - meanY);
    denominator += (x - meanX) ** 2;
  });

  const slope = denominator > 0 ? numerator / denominator : 0;
  const latest = clean.at(-1);
  const projectedChange3Days = slope * 3;
  const projectedPrice = latest.value + projectedChange3Days;

  let direction = 'Estable';
  let tone = 'No hay una señal clara de subida o bajada. Revisa el precio antes de salir.';
  if (projectedChange3Days >= 0.015) {
    direction = 'Subida moderada';
    tone = 'Puede compensar repostar pronto si lo necesitas.';
  } else if (projectedChange3Days >= 0.004) {
    direction = 'Subida leve';
    tone = 'Si tienes que repostar, quizá no convenga esperar demasiado.';
  } else if (projectedChange3Days <= -0.015) {
    direction = 'Bajada moderada';
    tone = 'Si no tienes urgencia, podrías esperar y revisar mañana.';
  } else if (projectedChange3Days <= -0.004) {
    direction = 'Bajada leve';
    tone = 'Podría bajar un poco; revisa antes de repostar.';
  }

  const confidence = clean.length >= 7 ? 'Alta' : clean.length >= 4 ? 'Media' : 'Baja';

  return {
    points: clean.length,
    latest,
    slope,
    projectedChange3Days,
    projectedPrice,
    direction,
    tone,
    confidence,
    firstDate: clean[0].date,
    lastDate: latest.date,
  };
}

function signedEuro(value) {
  if (!Number.isFinite(Number(value))) return '--';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '±';
  return `${sign}${Math.abs(value).toFixed(3).replace('.', ',')} €/l`;
}

function formatPlainPrice(value) {
  if (!Number.isFinite(Number(value))) return '--';
  return `${Number(value).toFixed(3).replace('.', ',')} €/l`;
}

function formatSignedPercent(value) {
  if (!Number.isFinite(Number(value))) return '--';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '±';
  return `${sign}${Math.abs(value).toFixed(2).replace('.', ',')} %`;
}

function formatMarketDate(value) {
  if (!value) return 'sin fecha';
  return String(value).slice(0, 10);
}

async function loadMarketData() {
  if (state.marketCache !== null) return state.marketCache;
  try {
    state.marketCache = await fetchJson(ENDPOINTS.market, { cache: 'no-store' });
    return state.marketCache;
  } catch {
    state.marketCache = null;
    return null;
  }
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(max, Math.max(min, number));
}

function classifyTrend(change3Days) {
  let direction = 'Estable';
  let tone = 'No hay una señal clara de subida o bajada. Revisa el precio antes de salir.';

  if (change3Days >= 0.018) {
    direction = 'Subida probable';
    tone = 'La combinación de histórico, Brent y contexto de mercado apunta a posible subida. Si necesitas repostar, puede compensar hacerlo pronto.';
  } else if (change3Days >= 0.006) {
    direction = 'Subida leve';
    tone = 'Hay señales suaves de subida. Si vas justo de combustible, quizá no convenga esperar demasiado.';
  } else if (change3Days <= -0.018) {
    direction = 'Bajada probable';
    tone = 'La señal combinada apunta a bajada. Si no tienes urgencia, podrías esperar y volver a revisar mañana.';
  } else if (change3Days <= -0.006) {
    direction = 'Bajada leve';
    tone = 'Podría bajar algo, aunque la señal no es fuerte. Revisa la app antes de repostar.';
  }

  return { direction, tone };
}

function signalFromMarket(market, key) {
  const signal = Number(market?.[key]?.signal_eur_l_3d);
  return Number.isFinite(signal) ? signal : 0;
}

function enhanceTrendWithMarket(trend, market) {
  if (!trend) return null;

  const historicSignal = Number(trend.projectedChange3Days) || 0;
  const brentSignal = signalFromMarket(market, 'brent');
  const eurUsdSignal = signalFromMarket(market, 'eurusd');
  const geoSignal = signalFromMarket(market, 'geopolitical');

  // Fórmula visible para el usuario:
  // 60% tendencia real de gasolineras + 25% Brent + 10% EUR/USD + 5% riesgo geopolítico.
  const combinedChange = clampNumber(
    historicSignal * 0.60 + brentSignal * 0.25 + eurUsdSignal * 0.10 + geoSignal * 0.05,
    -0.06,
    0.06
  );

  const classification = classifyTrend(combinedChange);
  const marketAvailable = Boolean(market?.updated_at);
  const confidence = trend.points >= 7 && marketAvailable ? 'Alta' : trend.points >= 4 || marketAvailable ? 'Media' : 'Baja';

  return {
    ...trend,
    projectedChange3Days: combinedChange,
    projectedPrice: Number(trend.latest?.value || 0) + combinedChange,
    direction: classification.direction,
    tone: classification.tone,
    confidence,
    marketUpdatedAt: market?.updated_at || '',
    marketFactors: [
      {
        label: 'Histórico gasolineras',
        value: signedEuro(historicSignal),
        detail: `${trend.points} registros usados`,
      },
      {
        label: 'Brent',
        value: market?.brent?.change_7d_pct !== undefined && market?.brent?.change_7d_pct !== null ? formatSignedPercent(market.brent.change_7d_pct) : '--',
        detail: market?.brent?.latest_usd_per_barrel ? `${Number(market.brent.latest_usd_per_barrel).toFixed(2).replace('.', ',')} $/barril` : 'pendiente de actualizar',
      },
      {
        label: 'EUR/USD',
        value: market?.eurusd?.change_7d_pct !== undefined && market?.eurusd?.change_7d_pct !== null ? formatSignedPercent(market.eurusd.change_7d_pct) : '--',
        detail: market?.eurusd?.latest_rate ? `1 € = ${Number(market.eurusd.latest_rate).toFixed(4).replace('.', ',')} $` : 'pendiente de actualizar',
      },
      {
        label: 'Riesgo geopolítico',
        value: market?.geopolitical?.level ? String(market.geopolitical.level).toUpperCase() : '--',
        detail: market?.geopolitical?.articles_analyzed ? `${market.geopolitical.articles_analyzed} noticias analizadas` : 'GDELT pendiente',
      },
    ],
  };
}

function renderMarketFactors(trend) {
  const factors = trend?.marketFactors || [];
  if (!factors.length) return '';

  return `
    <div class="forecast-factors">
      ${factors.map(factor => `
        <div class="factor-card">
          <label>${escapeHtml(factor.label)}</label>
          <b>${escapeHtml(factor.value)}</b>
          <small>${escapeHtml(factor.detail)}</small>
        </div>
      `).join('')}
    </div>
  `;
}

function renderForecastUnavailable(mode, stats) {
  el.forecastPanel.classList.remove('forecast-card--hidden');
  el.forecastTitle.textContent = `Previsión ${modeLabel(mode).toLowerCase()} próximos días`;
  el.forecastBadge.textContent = 'Acumulando';
  el.forecastContent.innerHTML = `
    <div class="forecast-warning">
      Todavía no hay suficiente histórico para estimar una tendencia fiable. La web guardará observaciones en este navegador y el workflow de GitHub Actions añadirá datos diarios al archivo <strong>data/historico-precios.json</strong>.
    </div>
    <div class="forecast-grid">
      <div class="forecast-metric"><label>Precio mínimo actual</label><b>${formatPlainPrice(stats?.min)}</b></div>
      <div class="forecast-metric"><label>Precio medio zona</label><b>${formatPlainPrice(stats?.avg)}</b></div>
      <div class="forecast-metric"><label>Datos usados</label><b>${stats?.count || 0} estaciones</b></div>
    </div>
    <p class="forecast-note">La previsión aparecerá cuando haya al menos dos registros de fechas distintas. Es orientativa, no una garantía de precio.</p>
  `;
}

async function renderForecast(items, mode) {
  if (!el.forecastPanel) return;
  if (mode === 'electrico') {
    resetForecast('La previsión de tendencia se calcula solo para gasolina y diésel.');
    return;
  }

  const stats = computeCurrentFuelStats(items);
  if (!stats) {
    renderForecastUnavailable(mode, null);
    return;
  }

  const localSeries = upsertLocalObservation(mode, state.activeLocationLabel, stats)
    .map(entry => ({ date: entry.date, value: Number(entry.min ?? entry.avg), source: 'Histórico local' }))
    .filter(entry => Number.isFinite(entry.value));

  const history = await loadFuelHistory();
  const nationalSeries = officialHistorySeries(history, mode);
  const currentPoint = { date: stats.date, value: stats.min, source: 'Consulta actual', count: stats.count };

  const localTrend = calculateTrend([...localSeries, currentPoint]);
  const nationalTrend = calculateTrend([...nationalSeries, currentPoint]);
  const trend = localTrend || nationalTrend;
  const sourceLabel = localTrend ? 'Histórico de tu zona' : 'Histórico nacional';

  if (!trend) {
    renderForecastUnavailable(mode, stats);
    return;
  }

  const market = await loadMarketData();
  const finalTrend = enhanceTrendWithMarket(trend, market);

  el.forecastPanel.classList.remove('forecast-card--hidden');
  el.forecastTitle.textContent = `Previsión ${modeLabel(mode).toLowerCase()} próximos días`;
  el.forecastBadge.textContent = `Confianza ${finalTrend.confidence}`;

  el.forecastContent.innerHTML = `
    <div class="forecast-main">
      <div class="forecast-direction">
        <span>Tendencia combinada</span>
        <strong>${escapeHtml(finalTrend.direction)}</strong>
      </div>
      <div class="forecast-projection">
        <span>Estimación a 3 días</span>
        <strong>${signedEuro(finalTrend.projectedChange3Days)}</strong>
      </div>
    </div>

    <div class="forecast-grid">
      <div class="forecast-metric"><label>Precio actual</label><b>${formatPlainPrice(stats.min)}</b></div>
      <div class="forecast-metric"><label>Precio estimado</label><b>${formatPlainPrice(finalTrend.projectedPrice)}</b></div>
      <div class="forecast-metric"><label>Histórico usado</label><b>${finalTrend.points} registros</b></div>
    </div>

    ${renderMarketFactors(finalTrend)}

    <p class="forecast-advice"><strong>Consejo:</strong> ${escapeHtml(finalTrend.tone)}</p>
    <p class="forecast-note">Fórmula: 60% histórico de gasolineras, 25% Brent, 10% EUR/USD y 5% riesgo geopolítico. Base histórica: ${escapeHtml(sourceLabel)} entre ${escapeHtml(finalTrend.firstDate)} y ${escapeHtml(finalTrend.lastDate)}. Mercado actualizado: ${escapeHtml(formatMarketDate(finalTrend.marketUpdatedAt))}. Es orientativa, no garantía de precio.</p>
  `;
}

function markerIconClass(mode) {
  if (mode === 'diesel') return 'map-pin--diesel';
  if (mode === 'electrico') return 'map-pin--electric';
  return 'map-pin--gasoline';
}

function addResultMarker(item, mode) {
  const icon = L.divIcon({
    className: `map-pin ${markerIconClass(mode)}`,
    html: '<span></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

  const popupLabel = mode === 'electrico'
    ? `<strong>${escapeHtml(item.name)}</strong><br>${escapeHtml(item.price_display || 'Consultar')} · ${formatDistance(item.distance_km)}`
    : `<strong>${escapeHtml(item.name)}</strong><br>${formatPrice(item.price)} · ${formatDistance(item.distance_km)}`;

  const marker = L.marker([item.latitude, item.longitude], { icon }).addTo(state.map);
  marker.bindPopup(popupLabel);
  marker.on('click', () => {
    window.open(directionsUrl(item.latitude, item.longitude), '_blank', 'noopener');
  });
  state.markers.push(marker);
}

function drawUserLocation(locationLabel, lat, lon) {
  const userIcon = L.divIcon({
    className: 'map-pin map-pin--user',
    html: '<span></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

  state.userMarker = L.marker([lat, lon], { icon: userIcon }).addTo(state.map);
  state.userMarker.bindPopup(`<strong>${escapeHtml(locationLabel)}</strong>`).openPopup();

  state.searchCircle = L.circle([lat, lon], {
    radius: state.defaultRadiusKm * 1000,
    color: '#29f0a2',
    weight: 1,
    fillColor: '#29f0a2',
    fillOpacity: 0.06,
  }).addTo(state.map);
}

function fitMap(lat, lon, items = []) {
  const points = [[lat, lon], ...items.map(item => [item.latitude, item.longitude])];
  const bounds = L.latLngBounds(points);
  state.map.fitBounds(bounds, { padding: [30, 30] });
}

async function detectCurrentLocation() {
  el.locationQuery.value = 'Detectando ubicación...';
  el.searchBtn.disabled = true;

  if (!navigator.geolocation) {
    state.userCoords = null;
    el.locationQuery.value = '';
    el.locationQuery.readOnly = false;
    el.locationQuery.placeholder = 'Escribe tu ciudad o dirección';
    el.searchBtn.disabled = false;
    return;
  }

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      });
    });

    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    const label = await reverseGeocode(lat, lon);
    state.userCoords = { latitude: lat, longitude: lon, label };
    state.activeCoords = { latitude: lat, longitude: lon };
    state.activeLocationLabel = label;
    el.locationQuery.value = label;
    el.locationQuery.readOnly = true;
    el.searchBtn.disabled = !state.selectedMode;
  } catch {
    state.userCoords = null;
    state.activeCoords = null;
    state.activeLocationLabel = '';
    el.locationQuery.value = '';
    el.locationQuery.readOnly = false;
    el.locationQuery.placeholder = 'Escribe tu ciudad o dirección';
    el.searchBtn.disabled = !state.selectedMode;
    showToast('No se ha podido detectar tu ubicación. Puedes escribir otra zona.', true);
  }
}

async function resolveActiveLocation() {
  if (state.customModeEnabled) {
    const query = el.customLocationInput.value.trim();
    if (!query) {
      throw new Error('Escribe una ubicación para buscar en otra zona');
    }
    const result = await geocode(query);
    state.activeCoords = { latitude: result.latitude, longitude: result.longitude };
    state.activeLocationLabel = [result.name, result.admin1, result.country].filter(Boolean).join(', ');
    el.locationQuery.value = state.activeLocationLabel;
    return;
  }

  if (state.userCoords) {
    state.activeCoords = { latitude: state.userCoords.latitude, longitude: state.userCoords.longitude };
    state.activeLocationLabel = state.userCoords.label;
    return;
  }

  const query = el.locationQuery.value.trim();
  if (!query) {
    throw new Error('Debes indicar una ubicación');
  }
  const result = await geocode(query);
  state.activeCoords = { latitude: result.latitude, longitude: result.longitude };
  state.activeLocationLabel = [result.name, result.admin1, result.country].filter(Boolean).join(', ');
}

async function runSearch() {
  if (!state.selectedMode) {
    showToast('Primero elige gasolina, diésel o eléctrico.', true);
    return;
  }

  try {
    el.searchBtn.disabled = true;
    el.searchBtn.textContent = 'Buscando...';
    renderEmptyTop('Buscando mejores opciones...');
    resetForecast('Calculando tendencia cuando lleguen los precios...');
    await resolveActiveLocation();

    const { latitude, longitude } = state.activeCoords;
    const weatherPromise = getWeather(latitude, longitude);
    const dataPromise = state.selectedMode === 'electrico'
      ? getChargingStations(latitude, longitude, state.defaultRadiusKm)
      : getFuelStations(latitude, longitude, state.defaultRadiusKm, state.selectedMode);

    const [weatherData, resultData] = await Promise.all([weatherPromise, dataPromise]);

    resetMapLayers();
    drawUserLocation(state.activeLocationLabel, latitude, longitude);

    const items = resultData.items || [];
    items.forEach(item => addResultMarker(item, state.selectedMode));
    fitMap(latitude, longitude, items);
    renderResults(items, state.selectedMode);
    updateKpis(items, state.selectedMode);
    await renderForecast(items, state.selectedMode);
    renderWeather(weatherData);

    const suffix = state.selectedMode !== 'electrico' && state.fuelDataSource
      ? ` (${state.fuelDataSource})`
      : '';
    showToast(`Resultados actualizados para ${modeLabel(state.selectedMode).toLowerCase()}${suffix}.`);
  } catch (error) {
    renderEmptyTop(error.message || 'No se ha podido realizar la búsqueda.');
    resetForecast('No se puede calcular la previsión hasta obtener resultados de precios.');
    showToast(error.message || 'No se ha podido realizar la búsqueda.', true);
  } finally {
    el.searchBtn.disabled = false;
    el.searchBtn.textContent = 'Ver mejores opciones';
  }
}

function toggleCustomLocation() {
  state.customModeEnabled = !state.customModeEnabled;
  el.customLocationWrap.classList.toggle('custom-location--hidden', !state.customModeEnabled);
  el.toggleCustomBtn.textContent = state.customModeEnabled ? 'Usar mi ubicación actual' : 'Usar otra ubicación';

  if (state.customModeEnabled) {
    el.customLocationInput.focus();
  } else if (state.userCoords) {
    el.locationQuery.value = state.userCoords.label;
  }
}

function bindEvents() {
  el.modeButtons.forEach(button => {
    button.addEventListener('click', async () => {
      setSelectedMode(button.dataset.mode);
      el.searchBtn.disabled = false;
      if (!state.userCoords && !state.activeCoords) {
        await detectCurrentLocation();
      }
      runSearch();
    });
  });

  el.toggleCustomBtn.addEventListener('click', toggleCustomLocation);
  el.refreshLocationBtn.addEventListener('click', async () => {
    state.customModeEnabled = false;
    el.customLocationWrap.classList.add('custom-location--hidden');
    el.toggleCustomBtn.textContent = 'Usar otra ubicación';
    await detectCurrentLocation();
    if (state.selectedMode) runSearch();
  });

  el.searchBtn.addEventListener('click', runSearch);
  el.customLocationInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runSearch();
    }
  });
}

async function init() {
  initMap();
  bindEvents();
  await detectCurrentLocation();
}

init();
