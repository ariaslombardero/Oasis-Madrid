import type { Fountain, GreenSpace, RouteResult, ThermalPoint, UserProfile, WeatherStation, Alert } from '../types';

const BASE = '/api/v1';

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return (await r.json()) as T;
}
async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`POST ${path} → ${r.status} ${txt}`);
  }
  return (await r.json()) as T;
}

export interface ForecastHour { hour: number; tempC: number; icon: string; }
export interface DayForecast {
  date: string;
  maxTempC: number;
  minTempC: number;
  icon: string;
  precipPct: number;
  hours: ForecastHour[];
}
export interface GeocodeSuggestion { label: string; lat: number; lng: number; }

export interface HistoricalContext {
  currentAvgC: number;
  historicalAvgC: number;
  diffC: number;
  month: number;
}

export const api = {
  weather: () => get<{ stations: WeatherStation[]; freshness: Record<string, { fetchedAt: string; source: string }> }>('/weather/current'),
  forecast: () => get<DayForecast>('/weather/forecast'),
  historicalContext: () => get<HistoricalContext>('/weather/historical-context'),
  fountains: (type?: 'drink' | 'pet') => get<{ fountains: Fountain[] }>(`/fountains${type ? `?type=${type}` : ''}`),
  greenSpaces: () => get<{ greenSpaces: GreenSpace[] }>('/greenspaces'),
  thermalPoint: (lat: number, lng: number) => get<ThermalPoint>(`/thermal/point?lat=${lat}&lng=${lng}`),
  thermalCity: () => get<{ points: ThermalPoint[] }>('/thermal/city'),
  ranking: () => get<{ coolest: any[]; hottest: any[] }>('/thermal/ranking'),
  alerts: () => get<{ alerts: Alert[]; averageTempC: number }>('/alerts/active'),
  freshRoute: (origin: [number, number], destination: [number, number], profile: UserProfile, waypoints?: [number, number][]) =>
    post<RouteResult>('/route/fresh', { origin, destination, profile, ...(waypoints?.length ? { waypoints } : {}) }),
  geocode: (text: string) => get<{ results: GeocodeSuggestion[] }>(`/route/geocode?text=${encodeURIComponent(text)}`),
  walk: (origin: [number, number], durationMin: number, profile: UserProfile) =>
    post<{ route: import('../types').ScoredRoute; profile: UserProfile; targetDistanceM: number; orsConfigured: boolean }>(
      '/route/walk', { origin, durationMin, profile }),
};

// Geocodificación con Nominatim (OSM). Restringido a Madrid.
export async function geocodeMadrid(query: string): Promise<{ lat: number; lng: number; display: string } | null> {
  if (!query.trim()) return null;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', Madrid, España')}&format=json&limit=1`;
  const r = await fetch(url, { headers: { 'Accept-Language': 'es' } });
  if (!r.ok) return null;
  const data = (await r.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!data.length) return null;
  return { lat: Number(data[0].lat), lng: Number(data[0].lon), display: data[0].display_name };
}

// Geocodificación inversa con Nominatim (OSM)
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
  try {
    const r = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    if (!r.ok) return null;
    const data = await r.json();
    if (data && data.address) {
      const road = data.address.road || data.address.pedestrian || data.address.path || data.address.footway;
      const neighbourhood = data.address.neighbourhood || data.address.suburb;
      if (road && neighbourhood) return `${road}, ${neighbourhood}`;
      if (road) return road;
      if (neighbourhood) return neighbourhood;
      if (data.display_name) return data.display_name.split(',')[0];
    }
    return null;
  } catch (e) {
    console.error('Error reverse geocoding:', e);
    return null;
  }
}
