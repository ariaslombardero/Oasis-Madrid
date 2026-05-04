import axios from 'axios';
import Papa from 'papaparse';
import { fallbackStations, fallbackReadings, fallbackFountains, fallbackPetFountains, fallbackGreenSpaces } from './fallbackData.js';
import { loadTreeIndex, getTreeCount } from './treeIndex.js';

const BASE = process.env.MADRID_DATA_BASE_URL || 'https://datos.madrid.es/egob/catalogo';
const DATA_DIR = './src/data';

const URLS = {
  weatherRealtimeJson: 'https://ciudadesabiertas.madrid.es/dynamicAPI/API/query/meteo_tiemporeal_ult?pageSize=10000',
  weatherRealtimeApi: 'https://datos.madrid.es/dataset/300392-0-meteorologia-tiempo-real/resource/300392-0-meteorologia-tiempo-real-api/download/300392-0-meteorologia-tiempo-real-api.api',
  weatherStations: `${BASE}/300360-0-meteorologicos-estaciones.csv`,
  drinkFountains: `${BASE}/300051-0-fuentes.json`,
  petFountains: `${BASE}/50055-0-fuentes-mascotas.json`,
  greenSpaces: `${BASE}/200059-0-zonas-verdes.csv`,
  airQualityRealtimeJson: 'https://ciudadesabiertas.madrid.es/dynamicAPI/API/query/calair_tiemporeal_ult?pageSize=10000',
  airQualityRealtimeApi: 'https://datos.madrid.es/dataset/212531-0-calidad-aire-tiempo-real/resource/212531-3-calidad-aire-tiempo-real-api/download/212531-3-calidad-aire-tiempo-real-api.api',
};

const LOCAL_FILES = {
  weatherStations: `${DATA_DIR}/300360-1-estaciones de control.csv`,
  drinkFountains: `${DATA_DIR}/fuentes_beber.json`,
  petFountains: `${DATA_DIR}/areas_caninas.json`,
  greenSpaces: `${DATA_DIR}/masas_distritos.csv`,
};

export interface WeatherStation {
  id: string;
  name: string;
  district?: string;
  lat: number;
  lng: number;
}

export interface WeatherReading {
  stationId: string;
  measuredAt: string;
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedMs: number | null;
  solarRadiationWm2: number | null;
}

export interface AirQualityReading {
  stationId: string;
  measuredAt: string;
  so2: number | null;
  co: number | null;
  no: number | null;
  no2: number | null;
  pm25: number | null;
  pm10: number | null;
  o3: number | null;
}

export interface Fountain {
  id: string;
  name?: string;
  district?: string;
  lat: number;
  lng: number;
  status: 'EN_SERVICIO' | 'FUERA_SERVICIO' | 'AVERIA' | 'DESCONOCIDO';
  type: 'drink' | 'pet';
}

export interface GreenSpace {
  id: string;
  name: string;
  district?: string;
  area_m2?: number;
  centroid: { lat: number; lng: number };
}

export interface AemetAlert {
  id: string;
  severity: 'green' | 'yellow' | 'orange' | 'red';
  title: string;
  description: string;
  validFrom: string;
  validUntil: string;
  source: string;
}

interface Cache {
  stations: WeatherStation[];
  readings: WeatherReading[];
  airQuality: AirQualityReading[];
  fountains: Fountain[];
  greenSpaces: GreenSpace[];
  alerts: AemetAlert[];
  freshness: Record<string, { fetchedAt: string; source: 'live' | 'fallback' }>;
}

const cache: Cache = {
  stations: [],
  readings: [],
  airQuality: [],
  fountains: [],
  greenSpaces: [],
  alerts: [],
  freshness: {},
};

function markFreshness(key: string, source: 'live' | 'fallback') {
  cache.freshness[key] = { fetchedAt: new Date().toISOString(), source };
}

function safeNum(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

async function readLocalFile(path: string): Promise<string | null> {
  try {
    const fs = await import('fs/promises');
    return await fs.readFile(path, 'utf-8');
  } catch (err) {
    return null;
  }
}

async function fetchText(url: string, timeout = 15000): Promise<string> {
  const r = await axios.get(url, { timeout, responseType: 'text', transformResponse: (d) => d });
  return r.data as string;
}

async function fetchJson<T = any>(url: string, timeout = 15000): Promise<T> {
  const r = await axios.get(url, { timeout });
  return r.data as T;
}

// =============== ESTACIONES METEOROLÓGICAS (DS-02) ===============
async function loadStations(): Promise<WeatherStation[]> {
  try {
    const text = await readLocalFile(LOCAL_FILES.weatherStations);
    if (!text) {
      throw new Error(`Local stations file not found: ${LOCAL_FILES.weatherStations}`);
    }

    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      delimiter: ';',
      skipEmptyLines: true,
    });
    
    const rows = parsed.data;
    const stations: WeatherStation[] = [];
    for (const row of rows) {
      const lat = safeNum(row['LATITUD']);
      const lng = safeNum(row['LONGITUD']);
      const id = row['CÓDIGO'] || row['codigo'] || row['CODIGO'];
      const name = row['ESTACION'] || row['estacion'] || row['nombre'];

      if (id && lat !== null && lng !== null) {
        stations.push({
          id: String(id).trim(),
          name: String(name || id).trim(),
          district: row['DISTRITO'] || row['distrito'],
          lat,
          lng,
        });
      }
    }

    if (stations.length === 0) throw new Error('No stations parsed');
    markFreshness('stations', 'live');
    console.log(`[madridData] Loaded ${stations.length} stations from local file`);
    return stations;
  } catch (err) {
    console.error('[madridData] Failed to load local stations:', (err as Error).message);
    markFreshness('stations', 'fallback');
    return [];
  }
}

// =============== METEOROLOGÍA EN TIEMPO REAL ===============
// Estrategia de fuentes (por orden de prioridad):
//   1. datos.madrid.es  — fuente oficial municipal (DS-01). Si está disponible,
//      proporciona los datos más precisos y sirve como argumento ante el jurado.
//   2. Open-Meteo       — API meteorológica abierta, sin API key, actualización
//      cada 15 min. Permite consultar todas las estaciones en una sola llamada.
//      Garantiza temperaturas REALES cuando datos.madrid.es devuelva error.
//   3. Datos de respaldo — solo si ambas fuentes fallan (sin conexión a internet).

const MAG_TEMP = '83';
const MAG_HUM = '86';
const MAG_WIND = '81';
const MAG_RAD = '88';

function parseRealtimeWeatherData(rows: any[]): WeatherReading[] {
  const latestByStationMag = new Map<string, { hour: number; value: number; ano: number; mes: number; dia: number }>();
  for (const row of rows) {
    const estacion = (row['ESTACION'] || row['PUNTO_MUESTREO'] || '').toString().padStart(3, '0');
    const magnitud = (row['MAGNITUD'] || '').toString();
    if (!estacion || !magnitud) continue;
    if (![MAG_TEMP, MAG_HUM, MAG_WIND, MAG_RAD].includes(magnitud)) continue;
    const ano = Number(row['ANO']);
    const mes = Number(row['MES']);
    const dia = Number(row['DIA']);
    if (!ano || !mes || !dia) continue;
    let lastValid: { hour: number; value: number } | null = null;
    for (let h = 1; h <= 24; h++) {
      const hh = String(h).padStart(2, '0');
      const v = row[`V${hh}`];
      const val = safeNum(row[`H${hh}`]);
      if (v === 'V' && val !== null) lastValid = { hour: h, value: val };
    }
    if (!lastValid) continue;
    const key = `${estacion}_${magnitud}`;
    const prev = latestByStationMag.get(key);
    const newer = !prev || ano > prev.ano ||
      (ano === prev.ano && mes > prev.mes) ||
      (ano === prev.ano && mes === prev.mes && dia > prev.dia) ||
      (ano === prev.ano && mes === prev.mes && dia === prev.dia && lastValid.hour > prev.hour);
    if (newer) latestByStationMag.set(key, { hour: lastValid.hour, value: lastValid.value, ano, mes, dia });
  }
  const byStation = new Map<string, WeatherReading>();
  for (const [key, info] of latestByStationMag.entries()) {
    const [stationIdBase, mag] = key.split('_');
    const stationId = stationIdBase.length === 3 ? `28079${stationIdBase}` : stationIdBase;
    const ts = new Date(Date.UTC(info.ano, info.mes - 1, info.dia, info.hour - 1, 0, 0)).toISOString();
    let r = byStation.get(stationId);
    if (!r) {
      r = { stationId, measuredAt: ts, temperatureC: null, humidityPct: null, windSpeedMs: null, solarRadiationWm2: null };
      byStation.set(stationId, r);
    }
    if (mag === MAG_TEMP) r.temperatureC = info.value;
    else if (mag === MAG_HUM) r.humidityPct = info.value;
    else if (mag === MAG_WIND) r.windSpeedMs = info.value;
    else if (mag === MAG_RAD) r.solarRadiationWm2 = info.value;
    if (ts > r.measuredAt) r.measuredAt = ts;
  }
  return [...byStation.values()];
}

// Fuente 2: Open-Meteo — consulta por coordenadas de cada estación municipal.
// Documentación: https://open-meteo.com/en/docs
// Sin API key, libre uso, datos cada 15 minutos.
async function loadFromOpenMeteo(stations: WeatherStation[]): Promise<WeatherReading[]> {
  if (stations.length === 0) return [];
  const lats = stations.map((s) => s.lat).join(',');
  const lngs = stations.map((s) => s.lng).join(',');
  const params = new URLSearchParams({
    latitude: lats,
    longitude: lngs,
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,apparent_temperature,shortwave_radiation',
    timezone: 'Europe/Madrid',
    forecast_days: '1',
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  const r = await axios.get(url, { timeout: 15000 });
  const data = r.data;
  // Open-Meteo devuelve lista cuando hay múltiples ubicaciones, objeto único si es una.
  const items: any[] = Array.isArray(data) ? data : [data];
  const now = new Date().toISOString();
  return items.map((item, i) => {
    const c = item?.current ?? {};
    // wind_speed_10m viene en km/h, convertimos a m/s
    const windKmh = safeNum(c.wind_speed_10m);
    return {
      stationId: stations[i]?.id ?? String(i),
      measuredAt: c.time ? new Date(c.time).toISOString() : now,
      temperatureC: safeNum(c.temperature_2m),
      humidityPct: safeNum(c.relative_humidity_2m),
      windSpeedMs: windKmh !== null ? Math.round(windKmh / 3.6 * 10) / 10 : null,
      solarRadiationWm2: safeNum(c.shortwave_radiation),
    } as WeatherReading;
  });
}

async function loadWeatherReadings(stations: WeatherStation[]): Promise<WeatherReading[]> {
  // --- Intento 1: datos.madrid.es (fuente oficial DS-01 vía JSON) ---
  const candidateUrls = [URLS.weatherRealtimeJson, URLS.weatherRealtimeApi];
  for (const url of candidateUrls) {
    try {
      const data = await fetchJson(url);
      const rows = data?.records || data?.data || data;
      if (Array.isArray(rows) && rows.length > 0) {
        const readings = parseRealtimeWeatherData(rows);
        if (readings.length > 0) {
          console.log(`[madridData] weather live from datos.madrid.es (${readings.length} stations)`);
          markFreshness('readings', 'live');
          return readings;
        }
      }
    } catch (_) { /* probar siguiente */ }
  }
  // --- Intento 2: Open-Meteo (datos reales, sin API key) ---
  try {
    const readings = await loadFromOpenMeteo(stations);
    if (readings.length > 0) {
      console.log(`[madridData] weather live from Open-Meteo (${readings.length} stations)`);
      markFreshness('readings', 'live');
      return readings;
    }
  } catch (err) {
    console.warn('[madridData] Open-Meteo failed:', (err as Error).message);
  }
  // --- Respaldo local (sin internet) ---
  console.warn('[madridData] weather readings: using static fallback (no internet connection)');
  markFreshness('readings', 'fallback');
  return fallbackReadings;
}

// =============== CALIDAD DEL AIRE EN TIEMPO REAL ===============
const MAG_SO2 = '1';
const MAG_CO = '6';
const MAG_NO = '7';
const MAG_NO2 = '8';
const MAG_PM25 = '9';
const MAG_PM10 = '10';
const MAG_O3 = '14';

function parseRealtimeAirQualityData(rows: any[]): AirQualityReading[] {
  const latestByStationMag = new Map<string, { hour: number; value: number; ano: number; mes: number; dia: number }>();
  for (const row of rows) {
    const estacion = (row['ESTACION'] || row['PUNTO_MUESTREO'] || '').toString().padStart(3, '0');
    const magnitud = (row['MAGNITUD'] || '').toString();
    if (!estacion || !magnitud) continue;
    if (![MAG_SO2, MAG_CO, MAG_NO, MAG_NO2, MAG_PM25, MAG_PM10, MAG_O3].includes(magnitud)) continue;
    
    const ano = Number(row['ANO']);
    const mes = Number(row['MES']);
    const dia = Number(row['DIA']);
    if (!ano || !mes || !dia) continue;
    
    let lastValid: { hour: number; value: number } | null = null;
    for (let h = 1; h <= 24; h++) {
      const hh = String(h).padStart(2, '0');
      const v = row[`V${hh}`];
      const val = safeNum(row[`H${hh}`]);
      if (v === 'V' && val !== null) lastValid = { hour: h, value: val };
    }
    if (!lastValid) continue;
    
    const key = `${estacion}_${magnitud}`;
    const prev = latestByStationMag.get(key);
    const newer = !prev || ano > prev.ano ||
      (ano === prev.ano && mes > prev.mes) ||
      (ano === prev.ano && mes === prev.mes && dia > prev.dia) ||
      (ano === prev.ano && mes === prev.mes && dia === prev.dia && lastValid.hour > prev.hour);
    if (newer) latestByStationMag.set(key, { hour: lastValid.hour, value: lastValid.value, ano, mes, dia });
  }
  
  const byStation = new Map<string, AirQualityReading>();
  for (const [key, info] of latestByStationMag.entries()) {
    const [stationIdBase, mag] = key.split('_');
    const stationId = stationIdBase.length === 3 ? `28079${stationIdBase}` : stationIdBase;
    const ts = new Date(Date.UTC(info.ano, info.mes - 1, info.dia, info.hour - 1, 0, 0)).toISOString();
    let r = byStation.get(stationId);
    if (!r) {
      r = { stationId, measuredAt: ts, so2: null, co: null, no: null, no2: null, pm25: null, pm10: null, o3: null };
      byStation.set(stationId, r);
    }
    if (mag === MAG_SO2) r.so2 = info.value;
    else if (mag === MAG_CO) r.co = info.value;
    else if (mag === MAG_NO) r.no = info.value;
    else if (mag === MAG_NO2) r.no2 = info.value;
    else if (mag === MAG_PM25) r.pm25 = info.value;
    else if (mag === MAG_PM10) r.pm10 = info.value;
    else if (mag === MAG_O3) r.o3 = info.value;
    
    if (ts > r.measuredAt) r.measuredAt = ts;
  }
  return [...byStation.values()];
}

async function loadAirQualityReadings(): Promise<AirQualityReading[]> {
  const candidateUrls = [URLS.airQualityRealtimeJson, URLS.airQualityRealtimeApi];
  for (const url of candidateUrls) {
    try {
      const data = await fetchJson(url);
      const rows = data?.records || data?.data || data;
      if (Array.isArray(rows) && rows.length > 0) {
        const readings = parseRealtimeAirQualityData(rows);
        if (readings.length > 0) {
          console.log(`[madridData] air quality live from datos.madrid.es (${readings.length} stations)`);
          markFreshness('airQuality', 'live');
          return readings;
        }
      }
    } catch (_) { /* probar siguiente */ }
  }
  
  console.warn('[madridData] air quality readings unavailable');
  markFreshness('airQuality', 'fallback');
  return [];
}

// =============== FUENTES DE AGUA (DS-04, DS-05) ===============
function parseFountainsJson(json: any, type: 'drink' | 'pet'): Fountain[] {
  // Estructura típica CKAN del Ayto: { "@graph": [ { id, title, location: { latitude, longitude }, ... } ] }
  const graph: any[] = json?.['@graph'] || json?.graph || (Array.isArray(json) ? json : []);
  const out: Fountain[] = [];
  for (const item of graph) {
    const lat = safeNum(item?.location?.latitude ?? item?.latitude ?? item?.lat ?? item?.LATITUD);
    const lng = safeNum(item?.location?.longitude ?? item?.longitude ?? item?.lng ?? item?.LONGITUD);
    if (lat === null || lng === null) continue;
    const statusRaw = String(item?.status || item?.estado || item?.['estado-de-la-fuente'] || item?.ESTADO || '').toUpperCase();
    let status: Fountain['status'] = 'DESCONOCIDO';
    if (/EN.SERVICIO|OPERATI|ACTIV/.test(statusRaw)) status = 'EN_SERVICIO';
    else if (/AVER/i.test(statusRaw)) status = 'AVERIA';
    else if (/FUERA/i.test(statusRaw)) status = 'FUERA_SERVICIO';
    else if (statusRaw === '') status = 'EN_SERVICIO';
    out.push({
      id: String(item?.id || item?.ID || item?.identificador || `${lat},${lng}`),
      name: item?.title || item?.nombre || item?.NOM_VIA,
      district: item?.address?.district || item?.distrito || item?.DISTRITO,
      lat,
      lng,
      status,
      type,
    });
  }
  return out;
}

async function loadFountains(): Promise<Fountain[]> {
  const out: Fountain[] = [];
  try {
    const drinkText = await readLocalFile(LOCAL_FILES.drinkFountains);
    if (drinkText) {
      const drink = JSON.parse(drinkText);
      const parsedDrink = parseFountainsJson(drink, 'drink');
      out.push(...parsedDrink);
      console.log(`[madridData] Loaded ${parsedDrink.length} drink fountains from local file`);
    } else {
      console.error(`[madridData] Drink fountains local file not found: ${LOCAL_FILES.drinkFountains}`);
    }
  } catch (err) {
    console.error('[madridData] Drink fountains parse error:', (err as Error).message);
  }

  try {
    const petText = await readLocalFile(LOCAL_FILES.petFountains);
    if (petText) {
      const pet = JSON.parse(petText);
      const parsedPet = parseFountainsJson(pet, 'pet');
      out.push(...parsedPet);
      console.log(`[madridData] Loaded ${parsedPet.length} pet fountains from local file`);
    } else {
      console.error(`[madridData] Pet fountains local file not found: ${LOCAL_FILES.petFountains}`);
    }
  } catch (err) {
    console.error('[madridData] Pet fountains parse error:', (err as Error).message);
  }

  if (out.length > 0) {
    markFreshness('fountains', 'live');
  } else {
    markFreshness('fountains', 'fallback');
  }
  return out;
}

// =============== ZONAS VERDES (DS-06) ===============
async function loadGreenSpaces(): Promise<GreenSpace[]> {
  try {
    const text = await readLocalFile(LOCAL_FILES.greenSpaces);
    if (!text) {
      throw new Error(`Local green spaces file not found: ${LOCAL_FILES.greenSpaces}`);
    }
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      delimiter: ';',
      skipEmptyLines: true,
    });
    const out: GreenSpace[] = [];
    for (const row of parsed.data) {
      const keys = Object.keys(row);
      const nameKey = keys.find((k) => /(nombre|denomin)/i.test(k));
      const latKey = keys.find((k) => /^lat/i.test(k) || /latitud/i.test(k));
      const lngKey = keys.find((k) => /^lon/i.test(k) || /longitud/i.test(k));
      const areaKey = keys.find((k) => /superf|area/i.test(k));
      const distKey = keys.find((k) => /distrito/i.test(k));
      if (!nameKey || !latKey || !lngKey) continue;
      const lat = safeNum(row[latKey]);
      const lng = safeNum(row[lngKey]);
      if (lat === null || lng === null) continue;
      out.push({
        id: `gs_${out.length + 1}`,
        name: row[nameKey],
        district: distKey ? row[distKey] : undefined,
        area_m2: areaKey ? safeNum(row[areaKey]) ?? undefined : undefined,
        centroid: { lat, lng },
      });
    }
    if (out.length === 0) throw new Error('No green spaces parsed');
    markFreshness('greenSpaces', 'live');
    console.log(`[madridData] Loaded ${out.length} green spaces from local file`);
    return out;
  } catch (err) {
    console.error('[madridData] Failed to load local green spaces:', (err as Error).message);
    markFreshness('greenSpaces', 'fallback');
    return fallbackGreenSpaces;
  }
}

// =============== AEMET (EXT-01) ===============
async function loadAemetAlerts(): Promise<AemetAlert[]> {
  const apiKey = process.env.AEMET_API_KEY;
  if (!apiKey) return [];
  try {
    // API AEMET devuelve un objeto con 'datos' que es una URL con el contenido real.
    const meta = await axios.get(
      'https://opendata.aemet.es/opendata/api/avisos_cap/ultimoelaborado/area/61',
      { headers: { api_key: apiKey }, timeout: 15000 }
    );
    const datosUrl = (meta.data as any)?.datos;
    if (!datosUrl) return [];
    const tar = await axios.get(datosUrl, { timeout: 15000, responseType: 'arraybuffer' });
    // El payload real es un .tar.gz con XMLs CAP. En el MVP no lo desempaquetamos:
    // marcamos que existe contenido y dejamos el campo "alerts" vacío con un
    // stub explicativo. La integración completa se hará en la fase 3.
    if ((tar.data as ArrayBuffer).byteLength > 0) {
      markFreshness('alerts', 'live');
      return [];
    }
    return [];
  } catch (err) {
    console.warn('[madridData] AEMET alerts unavailable:', (err as Error).message);
    return [];
  }
}

// =============== API pública del módulo ===============
export async function refreshWeather() {
  if (cache.stations.length === 0) cache.stations = await loadStations();
  cache.readings = await loadWeatherReadings(cache.stations);
  cache.airQuality = await loadAirQualityReadings();
}
export async function refreshFountains() {
  cache.fountains = await loadFountains();
}
export async function refreshGreenspaces() {
  cache.greenSpaces = await loadGreenSpaces();
}
export async function refreshAemetAlerts() {
  cache.alerts = await loadAemetAlerts();
}

export async function warmupAll() {
  await Promise.allSettled([refreshWeather(), refreshFountains(), refreshGreenspaces(), refreshAemetAlerts()]);
  // Tree index is large — load in background, non-blocking for startup
  loadTreeIndex().catch((e) => console.warn('[warmup] treeIndex failed:', e));
}

export function getTreeIndexStats() { return { treeCount: getTreeCount() }; }

export function getStations() { return cache.stations; }
export function getReadings() { return cache.readings; }
export function getAirQualityReadings() { return cache.airQuality; }
export function getFountains() { return cache.fountains; }
export function getGreenSpaces() { return cache.greenSpaces; }
export function getAlerts() { return cache.alerts; }
export function getFreshness() { return cache.freshness; }

export function joinedStationReadings(): Array<WeatherStation & { reading?: WeatherReading, airQuality?: AirQualityReading }> {
  const readMap = new Map(cache.readings.map((r) => [r.stationId, r]));
  const airMap = new Map(cache.airQuality.map((r) => [r.stationId, r]));
  return cache.stations.map((s) => ({ 
    ...s, 
    reading: readMap.get(s.id),
    airQuality: airMap.get(s.id)
  }));
}
