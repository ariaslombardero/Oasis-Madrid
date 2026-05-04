export type RiskLevel = 'comfort' | 'mild' | 'moderate' | 'high' | 'extreme';
export type UserProfile = 'general' | 'elderly' | 'pet' | 'pmr';

export interface WeatherStation {
  id: string;
  name: string;
  district?: string;
  lat: number;
  lng: number;
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedMs: number | null;
  ict: number | null;
  riskLevel: RiskLevel | null;
  measuredAt: string | null;
  aqi?: number;
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

export interface ThermalPoint {
  lat: number;
  lng: number;
  temperatureC: number;
  humidityPct: number;
  windSpeedMs: number;
  ict: number;
  riskLevel: RiskLevel;
  riskColor: string;
  contributingStations: number;
  address?: string;
  aqi?: number;
}

export interface ScoredRoute {
  coordinates: [number, number][];
  distanceM: number;
  durationS: number;
  shadeScore: number;
  fountainCount: number;
  parkOverlapPct: number;
  avgTempC: number;
  costScore: number;
  avgAqi?: number;
  label?: 'standard' | 'fresh';
}

export interface RouteResult {
  standard: ScoredRoute;
  fresh: ScoredRoute;
  profile: UserProfile;
  comparison: {
    timeDiffMin: number;
    tempDiffC: number;
    fountainsExtra: number;
  };
  orsConfigured: boolean;
}

export interface Alert {
  id: string;
  severity: 'green' | 'yellow' | 'orange' | 'red';
  title: string;
  description: string;
  validFrom: string;
  validUntil: string;
  source: string;
}
