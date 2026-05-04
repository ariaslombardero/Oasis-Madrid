import axios from 'axios';
import { getFountains, getGreenSpaces, type Fountain } from './madridData.js';
import { haversineM, thermalAtPoint } from './thermalIndex.js';
import { isShaded } from './treeIndex.js';

export type UserProfile = 'general' | 'elderly' | 'pet' | 'pmr';

export interface ProfileWeights {
  shadow_bonus: number;
  fountain_bonus: number;
  temp_penalty: number;
  slope_penalty: number;
  distance_weight: number;
}

export const PROFILE_WEIGHTS: Record<UserProfile, ProfileWeights> = {
  general: { shadow_bonus: 0.5, fountain_bonus: 0.6, temp_penalty: 0.3, slope_penalty: 0.1, distance_weight: 0.4 },
  elderly: { shadow_bonus: 0.6, fountain_bonus: 0.5, temp_penalty: 0.5, slope_penalty: 0.4, distance_weight: 0.2 },
  pet:     { shadow_bonus: 0.5, fountain_bonus: 0.7, temp_penalty: 0.4, slope_penalty: 0.1, distance_weight: 0.3 },
  pmr:     { shadow_bonus: 0.4, fountain_bonus: 0.4, temp_penalty: 0.4, slope_penalty: 0.8, distance_weight: 0.2 },
};

/** Máximo desvío temporal aceptable para la ruta fresca respecto a la estándar (30 %). */
const MAX_DETOUR_FACTOR = 1.30;
/** Radio en metros para buscar fuentes candidatas a waypoint cerca de la ruta. */
const FOUNTAIN_SEARCH_BUFFER_M = 500;
/** Radio en metros para considerar que una fuente ya está cubierta por la ruta. */
const FOUNTAIN_ON_ROUTE_M = 100;

export interface RouteGeometry {
  coordinates: [number, number][]; // [lng, lat]
  distanceM: number;
  durationS: number;
}

export interface ScoredRoute extends RouteGeometry {
  shadeScore: number;        // 0..1 (mayor = mejor cobertura de sombra)
  fountainCount: number;     // fuentes operativas a < 100 m
  parkOverlapPct: number;    // % de la ruta que cae dentro de zonas verdes
  avgTempC: number;          // temperatura media a lo largo de la ruta
  avgAqi: number;            // Índice de calidad del aire medio
  costScore: number;         // coste compuesto (menor = mejor para el perfil)
  label?: 'standard' | 'fresh';
}

interface OrsResponse {
  features: Array<{
    geometry: { coordinates: [number, number][] };
    properties: { summary: { distance: number; duration: number } };
  }>;
}

async function callOrs(
  origin: [number, number],
  destination: [number, number],
  profile: UserProfile,
  waypoints?: [number, number][],
): Promise<RouteGeometry[]> {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    const straight: RouteGeometry = {
      coordinates: [origin, destination],
      distanceM: haversineM({ lat: origin[1], lng: origin[0] }, { lat: destination[1], lng: destination[0] }),
      durationS: 0,
    };
    straight.durationS = (straight.distanceM / 1.3);
    return [straight];
  }
  const orsProfile = profile === 'pmr' ? 'wheelchair' : 'foot-walking';
  const hasWaypoints = waypoints && waypoints.length > 0;
  const coordinates = hasWaypoints ? [origin, ...waypoints, destination] : [origin, destination];
  
  const avoid_features = [];
  if (profile === 'pmr' || profile === 'elderly') {
    avoid_features.push('steps');
  }

  const body: Record<string, unknown> = {
    coordinates,
    ...(hasWaypoints ? {} : { alternative_routes: { target_count: 3, share_factor: 0.6, weight_factor: 1.6 } }),
    instructions: false,
    geometry_simplify: false,
  };

  if (avoid_features.length > 0) {
    body.options = { avoid_features };
  }
  try {
    const r = await axios.post(
      `https://api.openrouteservice.org/v2/directions/${orsProfile}/geojson`,
      body,
      { headers: { Authorization: apiKey, 'Content-Type': 'application/json' }, timeout: 20000 }
    );
    const data = r.data as OrsResponse;
    return data.features.map((f) => ({
      coordinates: f.geometry.coordinates,
      distanceM: f.properties.summary.distance,
      durationS: f.properties.summary.duration,
    }));
  } catch (err) {
    console.warn('[routing] ORS unreachable, fallback to straight line:', (err as Error).message);
    const straight: RouteGeometry = {
      coordinates: [origin, destination],
      distanceM: haversineM({ lat: origin[1], lng: origin[0] }, { lat: destination[1], lng: destination[0] }),
      durationS: 0,
    };
    straight.durationS = straight.distanceM / 1.3;
    return [straight];
  }
}

// Muestrea la ruta cada ~50 m para puntuar sombra/fuentes/temperatura.
function sampleRoute(coords: [number, number][], stepM = 50): { lat: number; lng: number }[] {
  const out: { lat: number; lng: number }[] = [];
  if (coords.length === 0) return out;
  out.push({ lat: coords[0][1], lng: coords[0][0] });
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = { lat: coords[i - 1][1], lng: coords[i - 1][0] };
    const b = { lat: coords[i][1], lng: coords[i][0] };
    const segM = haversineM(a, b);
    if (segM === 0) continue;
    let traveled = 0;
    while (acc + (segM - traveled) >= stepM) {
      const need = stepM - acc;
      const frac = (traveled + need) / segM;
      out.push({
        lat: a.lat + (b.lat - a.lat) * frac,
        lng: a.lng + (b.lng - a.lng) * frac,
      });
      traveled += need;
      acc = 0;
    }
    acc += segM - traveled;
  }
  out.push({ lat: coords[coords.length - 1][1], lng: coords[coords.length - 1][0] });
  return out;
}

function pointInGreenSpace(p: { lat: number; lng: number }): boolean {
  // Aproximación: punto está "en parque" si está dentro de un radio
  // proporcional a sqrt(área) del centroide. Suficiente para el MVP;
  // la versión PostGIS usará el polígono real.
  const greens = getGreenSpaces();
  for (const g of greens) {
    const radius = Math.sqrt((g.area_m2 ?? 50000) / Math.PI);
    const d = haversineM(p, g.centroid);
    if (d <= radius) return true;
  }
  return false;
}

function getFountainScore(p: { lat: number; lng: number }, profile: UserProfile): number {
  const fts = getFountains().filter((f) => f.status === 'EN_SERVICIO');
  let score = 0;
  for (const f of fts) {
    const d = haversineM(p, { lat: f.lat, lng: f.lng });
    if (d < 100) {
      if (profile === 'pet') {
        score += f.type === 'pet' ? 2 : 1;
      } else {
        if (f.type === 'drink') score += 1;
      }
    }
  }
  return score;
}

export function scoreRoute(geom: RouteGeometry, profile: UserProfile): ScoredRoute {
  const samples = sampleRoute(geom.coordinates, 50);
  let shadeHits = 0;
  let fountainHits = 0;
  let parkHits = 0;
  let tempSum = 0;
  let aqiSum = 0;
  
  for (const p of samples) {
    const inPark = pointInGreenSpace(p);
    if (inPark) parkHits++;
    // Shade: real tree canopy (DS-03) with park fallback if index not yet loaded
    if (isShaded(p.lat, p.lng) || inPark) shadeHits++;
    
    fountainHits += getFountainScore(p, profile);
    const thermal = thermalAtPoint(p.lat, p.lng);
    tempSum += thermal.temperatureC;
    aqiSum += thermal.aqi || 1;
  }
  const n = Math.max(1, samples.length);
  const shadeScore = shadeHits / n;
  const parkOverlapPct = (parkHits / n) * 100;
  const avgTempC = tempSum / n;
  const avgAqi = aqiSum / n;

  const w = PROFILE_WEIGHTS[profile];
  // Coste compuesto: menor es mejor.
  const distanceFactor = geom.distanceM / 1000; // km
  const tempExcess = Math.max(0, avgTempC - 28); // por encima de 28°C empieza a penalizar
  const aqiPenalty = Math.max(0, avgAqi - 2) * 0.5; // Penaliza si ICA medio > 2 (Regular o peor)
  
  const costScore =
    distanceFactor * w.distance_weight +
    tempExcess * w.temp_penalty -
    shadeScore * 5 * w.shadow_bonus -
    Math.min(fountainHits, 15) * w.fountain_bonus +
    aqiPenalty;

  return {
    ...geom,
    shadeScore: round2(shadeScore),
    fountainCount: fountainHits,
    parkOverlapPct: round1(parkOverlapPct),
    avgTempC: round1(avgTempC),
    avgAqi: round2(avgAqi),
    costScore: round2(costScore),
  };
}

// ─── Hybrid fresh-route helpers ─────────────────────────────────────────────
// Busca fuentes operativas que estén dentro de un buffer alrededor de la ruta
// pero que NO están ya cubiertas (a <100 m de algún punto muestreado).
// Devuelve hasta `maxResults` fuentes ordenadas por proximidad al eje de la ruta.



interface FountainCandidate {
  fountain: Fountain;
  /** Distancia mínima del eje de la ruta a esta fuente (en metros). */
  minDistToRoute: number;
}

function findFountainWaypoints(
  routeSamples: { lat: number; lng: number }[],
  profile: UserProfile,
  bufferM: number = FOUNTAIN_SEARCH_BUFFER_M,
  maxResults: number = 3,
): FountainCandidate[] {
  const fountainType = profile === 'pet' ? 'any' : 'drink';
  const allFountains = getFountains().filter(
    (f) => f.status === 'EN_SERVICIO' && (fountainType === 'any' || f.type === fountainType),
  );

  const candidates: FountainCandidate[] = [];

  for (const f of allFountains) {
    const fp = { lat: f.lat, lng: f.lng };
    let minDist = Infinity;
    let alreadyCovered = false;

    for (const sp of routeSamples) {
      const d = haversineM(sp, fp);
      if (d < minDist) minDist = d;
      // Si ya está a <100 m de la ruta, la ruta ya la "cubre" — no sirve como desvío.
      if (d < FOUNTAIN_ON_ROUTE_M) {
        alreadyCovered = true;
        break;
      }
    }

    if (!alreadyCovered && minDist <= bufferM) {
      candidates.push({ fountain: f, minDistToRoute: minDist });
    }
  }

  // Ordenar: si es perfil mascota, priorizar fuentes de mascota ('pet') incluso si están un poco más lejos.
  // Luego, ordenar por cercanía al eje de la ruta (las más cercanas = desvío menor).
  candidates.sort((a, b) => {
    if (profile === 'pet') {
      const aIsPet = a.fountain.type === 'pet';
      const bIsPet = b.fountain.type === 'pet';
      if (aIsPet && !bIsPet) return -1;
      if (!aIsPet && bIsPet) return 1;
    }
    return a.minDistToRoute - b.minDistToRoute;
  });

  return candidates.slice(0, maxResults);
}

export async function planFreshRoute(
  origin: [number, number],
  destination: [number, number],
  profile: UserProfile,
  waypoints?: [number, number][],
): Promise<{ standard: ScoredRoute; fresh: ScoredRoute; profile: UserProfile }> {
  // ── Paso 1: obtener alternativas estándar de ORS ──────────────────────────
  const geoms = await callOrs(origin, destination, profile, waypoints);
  const scored = geoms.map((g) => scoreRoute(g, profile));

  // Estándar = la de menor duración de las devueltas por ORS.
  let standard: ScoredRoute = { ...scored.reduce((best, cur) => cur.durationS < best.durationS ? cur : best, scored[0]), label: 'standard' };

  // Fresca inicial = la de menor costScore entre las alternativas de ORS.
  let fresh: ScoredRoute = scored.reduce(
    (best, cur) => (cur.costScore < best.costScore ? cur : best),
    scored[0],
  );

  // ── Paso 2: inyección de waypoint por fuente (si no hay waypoints del usuario) ──
  // Solo intentamos la inyección cuando el usuario NO proporcionó paradas intermedias
  // (en ese caso ORS ya devuelve una ruta con waypoints fijos).
  const hasUserWaypoints = waypoints && waypoints.length > 0;

  if (!hasUserWaypoints) {
    const standardSamples = sampleRoute(standard.coordinates, 50);
    const candidates = findFountainWaypoints(standardSamples, profile);

    // Intentar con las mejores fuentes candidatas (hasta 3) — nos quedamos con
    // la primera cuyo desvío sea ≤ MAX_DETOUR_FACTOR del tiempo estándar.
    for (const c of candidates) {
      try {
        const wp: [number, number] = [c.fountain.lng, c.fountain.lat];
        const detourGeoms = await callOrs(origin, destination, profile, [wp]);
        if (detourGeoms.length === 0) continue;

        const detourScored = scoreRoute(detourGeoms[0], profile);

        // Si por alguna razón el desvío es más rápido que la estándar, actualizamos la estándar.
        if (detourScored.durationS < standard.durationS) {
          standard = { ...detourScored, label: 'standard' };
        }

        // Aceptar solo si el desvío temporal es razonable respecto al (posiblemente nuevo) estándar.
        if (detourScored.durationS <= standard.durationS * MAX_DETOUR_FACTOR) {
          // Compararemos por costScore: el desvío debe ser *mejor* que la mejor alternativa ORS.
          if (detourScored.costScore < fresh.costScore) {
            fresh = detourScored;
            console.log(
              `[routing] fresh route via fountain waypoint ${c.fountain.id} ` +
              `(+${Math.round(detourScored.durationS - standard.durationS)}s, ` +
              `${detourScored.fountainCount} fountains vs ${standard.fountainCount})`,
            );
            break; // Encontramos un desvío válido, no seguimos probando.
          }
        }
      } catch (err) {
        // Si la llamada ORS con waypoint falla, seguir con la siguiente fuente.
        console.warn(`[routing] fountain waypoint ${c.fountain.id} failed:`, (err as Error).message);
      }
    }
  }

  fresh = { ...fresh, label: 'fresh' };
  return { standard, fresh, profile };
}

export async function planRoundTrip(
  origin: [number, number],
  durationMin: number,
  profile: UserProfile,
): Promise<{ route: ScoredRoute; profile: UserProfile; targetDistanceM: number }> {
  const WALK_MS = 1.3; // m/s
  const targetDistanceM = Math.round(durationMin * 60 * WALK_MS);
  const apiKey = process.env.ORS_API_KEY;

  let geom: RouteGeometry;

  if (apiKey) {
    try {
      const orsProfile = profile === 'pmr' ? 'wheelchair' : 'foot-walking';
      const avoid_features = (profile === 'pmr' || profile === 'elderly') ? ['steps'] : undefined;
      const body: any = {
        coordinates: [origin],
        options: {
          round_trip: { length: targetDistanceM, points: 5, seed: 0 },
        },
        instructions: false,
      };
      if (avoid_features) body.options.avoid_features = avoid_features;
      
      const r = await axios.post(
        `https://api.openrouteservice.org/v2/directions/${orsProfile}/geojson`,
        body,
        { headers: { Authorization: apiKey, 'Content-Type': 'application/json' }, timeout: 20000 },
      );
      const data = r.data as OrsResponse;
      const f = data.features[0];
      geom = {
        coordinates: f.geometry.coordinates,
        distanceM: f.properties.summary.distance,
        durationS: f.properties.summary.duration,
      };
    } catch (err) {
      console.warn('[routing] round_trip ORS failed, using fallback circle:', (err as Error).message);
      geom = makeFallbackCircle(origin, targetDistanceM);
    }
  } else {
    geom = makeFallbackCircle(origin, targetDistanceM);
  }

  const route: ScoredRoute = { ...scoreRoute(geom, profile), label: 'fresh' };
  return { route, profile, targetDistanceM };
}

function makeFallbackCircle(origin: [number, number], distanceM: number): RouteGeometry {
  const R_EARTH = 6371000;
  const radius = distanceM / (2 * Math.PI);
  const points = 32;
  const coords: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dlat = (radius * Math.cos(angle)) / R_EARTH * (180 / Math.PI);
    const dlng = (radius * Math.sin(angle)) / (R_EARTH * Math.cos(origin[1] * Math.PI / 180)) * (180 / Math.PI);
    coords.push([origin[0] + dlng, origin[1] + dlat]);
  }
  return { coordinates: coords, distanceM, durationS: distanceM / 1.3 };
}

function round1(x: number) { return Math.round(x * 10) / 10; }
function round2(x: number) { return Math.round(x * 100) / 100; }
