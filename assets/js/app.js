const ENDPOINTS = {
  fuelLive: 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/',
  fuelLocal: 'data/estaciones.json',
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
    return state.fuelDataCache;
  } catch (liveError) {
    state.fuelDataCache = await fetchJson(ENDPOINTS.fuelLocal);
    state.fuelDataSource = 'copia local incluida';
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
    renderWeather(weatherData);

    const suffix = state.selectedMode !== 'electrico' && state.fuelDataSource
      ? ` (${state.fuelDataSource})`
      : '';
    showToast(`Resultados actualizados para ${modeLabel(state.selectedMode).toLowerCase()}${suffix}.`);
  } catch (error) {
    renderEmptyTop(error.message || 'No se ha podido realizar la búsqueda.');
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
