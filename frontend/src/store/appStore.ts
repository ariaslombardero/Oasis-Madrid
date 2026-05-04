import { create } from 'zustand';
import type { Fountain, GreenSpace, RouteResult, ThermalPoint, UserProfile, WeatherStation, Alert } from '../types';

export interface Waypoint { lat: number; lng: number; label?: string; }

interface AppState {
  stations: WeatherStation[];
  fountains: Fountain[];
  greenSpaces: GreenSpace[];
  alerts: Alert[];
  averageTempC: number;
  origin: { lat: number; lng: number; label?: string } | null;
  destination: { lat: number; lng: number; label?: string } | null;
  profile: UserProfile;
  route: RouteResult | null;
  pointThermal: ThermalPoint | null;
  // Capas
  showDrinkFountains: boolean;
  showPetFountains: boolean;
  showGreenSpaces: boolean;
  showTreeShade: boolean;
  // Visibilidad de rutas
  showFreshRoute: boolean;
  showStandardRoute: boolean;
  // Waypoints intermedios
  waypoints: Waypoint[];
  // A11y
  largeText: boolean;
  highContrast: boolean;
  darkMode: boolean;
  loadingRoute: boolean;
  // Actions
  setStations: (s: WeatherStation[]) => void;
  setFountains: (f: Fountain[]) => void;
  setGreenSpaces: (g: GreenSpace[]) => void;
  setAlerts: (a: Alert[], avg: number) => void;
  setOrigin: (p: AppState['origin']) => void;
  setDestination: (p: AppState['destination']) => void;
  setProfile: (p: UserProfile) => void;
  setRoute: (r: RouteResult | null) => void;
  setPointThermal: (t: ThermalPoint | null) => void;
  toggleLayer: (l: 'drink' | 'pet' | 'green' | 'tree') => void;
  toggleRouteVisibility: (kind: 'fresh' | 'standard') => void;
  addWaypoint: () => void;
  removeWaypoint: (idx: number) => void;
  setWaypoint: (idx: number, wp: Waypoint) => void;
  toggleA11y: (l: 'largeText' | 'highContrast' | 'darkMode') => void;
  setLoadingRoute: (b: boolean) => void;
  clearAll: () => void;
}

export const useStore = create<AppState>((set) => ({
  stations: [],
  fountains: [],
  greenSpaces: [],
  alerts: [],
  averageTempC: 0,
  origin: null,
  destination: null,
  profile: 'general',
  route: null,
  pointThermal: null,
  showDrinkFountains: false,
  showPetFountains: false,
  showGreenSpaces: false,
  showTreeShade: false,
  showFreshRoute: true,
  showStandardRoute: false,
  waypoints: [],
  largeText: false,
  highContrast: false,
  darkMode: false,
  loadingRoute: false,
  setStations: (s) => set({ stations: s }),
  setFountains: (f) => set({ fountains: f }),
  setGreenSpaces: (g) => set({ greenSpaces: g }),
  setAlerts: (a, avg) => set({ alerts: a, averageTempC: avg }),
  setOrigin: (p) => set({ origin: p }),
  setDestination: (p) => set({ destination: p }),
  setProfile: (p) => set({ profile: p }),
  setRoute: (r) => set({ 
    route: r,
    showDrinkFountains: true,
    showPetFountains: true,
    showGreenSpaces: true,
    showTreeShade: true,
  }),
  setPointThermal: (t) => set({ pointThermal: t }),
  toggleLayer: (l) =>
    set((s) => ({
      ...(l === 'drink' ? { showDrinkFountains: !s.showDrinkFountains } : {}),
      ...(l === 'pet'   ? { showPetFountains:   !s.showPetFountains   } : {}),
      ...(l === 'green' ? { showGreenSpaces:     !s.showGreenSpaces    } : {}),
      ...(l === 'tree'  ? { showTreeShade:       !s.showTreeShade      } : {}),
    })),
  toggleRouteVisibility: (kind) =>
    set((s) => kind === 'fresh'
      ? { showFreshRoute: !s.showFreshRoute }
      : { showStandardRoute: !s.showStandardRoute }
    ),
  addWaypoint: () =>
    set((s) => ({ waypoints: [...s.waypoints, { lat: 0, lng: 0 }] })),
  removeWaypoint: (idx) =>
    set((s) => ({ waypoints: s.waypoints.filter((_, i) => i !== idx) })),
  setWaypoint: (idx, wp) =>
    set((s) => ({ waypoints: s.waypoints.map((w, i) => (i === idx ? wp : w)) })),
  toggleA11y: (l) =>
    set((s) => ({
      ...(l === 'largeText'    ? { largeText:    !s.largeText    } : {}),
      ...(l === 'highContrast' ? { highContrast: !s.highContrast } : {}),
      ...(l === 'darkMode'     ? { darkMode:     !s.darkMode     } : {}),
    })),
  setLoadingRoute: (b) => set({ loadingRoute: b }),
  clearAll: () => set({ origin: null, destination: null, route: null, waypoints: [] }),
}));
