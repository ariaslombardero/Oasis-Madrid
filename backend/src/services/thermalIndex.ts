import { joinedStationReadings, getGreenSpaces } from './madridData.js';

export type RiskLevel = 'comfort' | 'mild' | 'moderate' | 'high' | 'extreme';

export interface ThermalPoint {
  lat: number;
  lng: number;
  temperatureC: number;
  humidityPct: number;
  windSpeedMs: number;
  ict: number; // Índice de Confort Térmico (PET simplificado)
  riskLevel: RiskLevel;
  riskColor: string;
  contributingStations: number;
  aqi?: number;
}

const RISK_COLORS: Record<RiskLevel, string> = {
  comfort: '#4CAF50',
  mild: '#FFC107',
  moderate: '#FF7043',
  high: '#E53935',
  extreme: '#880E4F',
};

export function classifyRisk(ict: number): RiskLevel {
  if (ict < 23) return 'comfort';
  if (ict < 29) return 'mild';
  if (ict < 35) return 'moderate';
  if (ict < 41) return 'high';
  return 'extreme';
}

// Saturation vapor pressure (Magnus) en hPa
function svp(tC: number) {
  return 6.105 * Math.exp((17.27 * tC) / (237.3 + tC));
}

// Apparent temperature (versión simplificada de la fórmula PET):
// T_apparent = T + 0.33*(HR/100 * svp(T)) - 0.70*V - 4.0
export function computeIct(tC: number, hrPct: number, vMs: number): number {
  const e = (hrPct / 100) * svp(tC);
  return tC + 0.33 * e - 0.7 * vMs - 4.0;
}

// Distancia en metros (haversine, válida para distancias urbanas).
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Interpolación espacial IDW (Inverse Distance Weighting) sobre las
// estaciones meteorológicas del Ayuntamiento.
export function idwInterpolate(lat: number, lng: number, power = 2, kNearest = 6): {
  temp: number;
  hum: number;
  wind: number;
  contributing: number;
} {
  const stations = joinedStationReadings().filter((s) => s.reading?.temperatureC != null);
  if (stations.length === 0) {
    return { temp: 30, hum: 30, wind: 2, contributing: 0 };
  }
  const distances = stations.map((s) => ({ s, d: haversineM({ lat, lng }, { lat: s.lat, lng: s.lng }) }));
  distances.sort((a, b) => a.d - b.d);
  const top = distances.slice(0, kNearest);
  // Si caemos casi exactamente sobre una estación, usar su lectura directa.
  if (top[0].d < 5) {
    const r = top[0].s.reading!;
    return {
      temp: r.temperatureC ?? 30,
      hum: r.humidityPct ?? 30,
      wind: r.windSpeedMs ?? 2,
      contributing: 1,
    };
  }
  let wSum = 0;
  let tSum = 0;
  let hSum = 0;
  let vSum = 0;
  for (const { s, d } of top) {
    const w = 1 / Math.pow(d, power);
    wSum += w;
    tSum += w * (s.reading!.temperatureC ?? 30);
    hSum += w * (s.reading!.humidityPct ?? 30);
    vSum += w * (s.reading!.windSpeedMs ?? 2);
  }
  return { temp: tSum / wSum, hum: hSum / wSum, wind: vSum / wSum, contributing: top.length };
}

// Bonificación local por proximidad a parques: hasta -2°C en el centroide
// de un parque grande (>500.000 m²), decayendo con la distancia.
export function parkCoolingBonus(lat: number, lng: number): number {
  const greens = getGreenSpaces();
  let cooling = 0;
  for (const g of greens) {
    const d = haversineM({ lat, lng }, g.centroid);
    if (d > 1500) continue;
    const sizeFactor = Math.min(1, (g.area_m2 ?? 50000) / 500000);
    const proximity = Math.max(0, 1 - d / 1500);
    cooling = Math.max(cooling, 2 * sizeFactor * proximity);
  }
  return cooling;
}

export function thermalAtPoint(lat: number, lng: number): ThermalPoint {
  const { temp, hum, wind, contributing } = idwInterpolate(lat, lng);
  const tAdj = temp - parkCoolingBonus(lat, lng);
  const aqi = getAqiAtPoint(lat, lng);
  const finalTemp = tAdj + (aqi > 3 ? 1 : 0);
  const ict = computeIct(finalTemp, hum, wind);
  const risk = classifyRisk(ict);
  return {
    lat,
    lng,
    temperatureC: round1(finalTemp),
    humidityPct: round1(hum),
    windSpeedMs: round1(wind),
    ict: round1(ict),
    riskLevel: risk,
    riskColor: RISK_COLORS[risk],
    contributingStations: contributing,
    aqi: aqi,
  };
}

export function computeAqi(reading: any): number {
  let aqi = 1;
  const no2 = reading.no2 ?? 0;
  if (no2 > 230) aqi = Math.max(aqi, 5);
  else if (no2 > 120) aqi = Math.max(aqi, 4);
  else if (no2 > 90) aqi = Math.max(aqi, 3);
  else if (no2 > 40) aqi = Math.max(aqi, 2);

  const pm10 = reading.pm10 ?? 0;
  if (pm10 > 100) aqi = Math.max(aqi, 5);
  else if (pm10 > 50) aqi = Math.max(aqi, 4);
  else if (pm10 > 40) aqi = Math.max(aqi, 3);
  else if (pm10 > 20) aqi = Math.max(aqi, 2);

  const pm25 = reading.pm25 ?? 0;
  if (pm25 > 50) aqi = Math.max(aqi, 5);
  else if (pm25 > 25) aqi = Math.max(aqi, 4);
  else if (pm25 > 20) aqi = Math.max(aqi, 3);
  else if (pm25 > 10) aqi = Math.max(aqi, 2);

  const o3 = reading.o3 ?? 0;
  if (o3 > 240) aqi = Math.max(aqi, 5);
  else if (o3 > 130) aqi = Math.max(aqi, 4);
  else if (o3 > 100) aqi = Math.max(aqi, 3);
  else if (o3 > 50) aqi = Math.max(aqi, 2);

  return aqi;
}

export function getAqiAtPoint(lat: number, lng: number): number {
  const stations = joinedStationReadings().filter((s) => s.airQuality != null);
  if (stations.length === 0) return 1;
  let minD = Infinity;
  let nearest = stations[0];
  for (const s of stations) {
    const d = haversineM({ lat, lng }, { lat: s.lat, lng: s.lng });
    if (d < minD) {
      minD = d;
      nearest = s;
    }
  }
  return computeAqi(nearest.airQuality!);
}

function round1(x: number) {
  return Math.round(x * 10) / 10;
}
