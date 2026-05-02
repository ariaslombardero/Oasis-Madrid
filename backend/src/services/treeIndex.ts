/**
 * treeIndex.ts — Spatial shade index from DS-03 (Arbolado en parques)
 *
 * Loads Madrid's tree inventory CSV (~200k trees), builds a spatial grid
 * index for fast "is this point shaded?" queries used by the route scorer.
 *
 * Grid: 0.001° cells ≈ 100 m. For any query point we check the 3×3
 * neighbourhood (9 cells), enough to catch trees up to ~150 m away.
 */

import axios from 'axios';
import Papa from 'papaparse';

const BASE = process.env.MADRID_DATA_BASE_URL || 'https://datos.madrid.es/egob/catalogo';
const TREE_URL = `${BASE}/300264-0-arbolado-parques-historico.csv`;

const CELL_DEG = 0.001;          // ≈100 m
const DEFAULT_CROWN_RADIUS_M = 4; // 8 m diameter — conservative average
const MIN_CROWN_RADIUS_M = 1;
const MAX_CROWN_RADIUS_M = 25;

interface TreePoint {
  lat: number;
  lng: number;
  crownRadiusM: number;
}

const grid = new Map<string, TreePoint[]>();
let loaded = false;
let treeCount = 0;

function cellKey(lat: number, lng: number): string {
  return `${Math.floor(lat / CELL_DEG)},${Math.floor(lng / CELL_DEG)}`;
}

function addTree(tree: TreePoint) {
  const key = cellKey(tree.lat, tree.lng);
  const cell = grid.get(key);
  if (cell) cell.push(tree);
  else grid.set(key, [tree]);
  treeCount++;
}

function safeNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

/** Parse a CSV row into a TreePoint. Returns null if coordinates are missing. */
function parseRow(row: Record<string, string>): TreePoint | null {
  const keys = Object.keys(row);

  const latKey = keys.find((k) => /latitud|^lat$/i.test(k));
  const lngKey = keys.find((k) => /longitud|^lon$|^lng$/i.test(k));
  if (!latKey || !lngKey) return null;

  const lat = safeNum(row[latKey]);
  const lng = safeNum(row[lngKey]);
  if (lat === null || lng === null) return null;
  // Filter out-of-Madrid points
  if (lat < 40.2 || lat > 40.65 || lng < -4.0 || lng > -3.4) return null;

  const diaKey = keys.find((k) => /diametro.*copa|copa.*diam/i.test(k));
  const rawDia = diaKey ? safeNum(row[diaKey]) : null;
  let crownRadiusM = rawDia !== null && rawDia > 0
    ? Math.min(MAX_CROWN_RADIUS_M, Math.max(MIN_CROWN_RADIUS_M, rawDia / 2))
    : DEFAULT_CROWN_RADIUS_M;

  return { lat, lng, crownRadiusM };
}

/** Load tree CSV from datos.madrid.es and build the spatial index. */
export async function loadTreeIndex(): Promise<void> {
  try {
    const resp = await axios.get(TREE_URL, {
      timeout: 90_000,
      responseType: 'text',
      transformResponse: (d) => d,
    });
    const text = resp.data as string;
    // Detect delimiter: ; or ,
    const firstLine = text.split('\n')[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';

    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      delimiter,
      skipEmptyLines: true,
    });

    for (const row of parsed.data) {
      const tree = parseRow(row);
      if (tree) addTree(tree);
    }

    loaded = true;
    console.log(`[treeIndex] Loaded ${treeCount} trees from DS-03 into spatial grid (${grid.size} cells)`);
  } catch (err) {
    console.warn('[treeIndex] Could not load DS-03, using park fallback:', (err as Error).message);
    loadFallbackClusters();
    loaded = true;
  }
}

/**
 * Fallback: approximate tree density in Madrid's major parks using clusters.
 * Each cluster is a centre + radius representing a dense tree canopy zone.
 * Adds synthetic tree points on a regular grid inside the zone.
 */
function loadFallbackClusters() {
  const parks = [
    { lat: 40.4153, lng: -3.6840, radiusM: 800 },  // El Retiro
    { lat: 40.4180, lng: -3.7477, radiusM: 1400 },  // Casa de Campo (SE corner)
    { lat: 40.4680, lng: -3.7500, radiusM: 500 },   // Monte del Pardo
    { lat: 40.4500, lng: -3.6900, radiusM: 300 },   // Parque Juan Carlos I
    { lat: 40.4420, lng: -3.7050, radiusM: 250 },   // Parque del Oeste
    { lat: 40.3980, lng: -3.7100, radiusM: 200 },   // Parque Pradolongo
    { lat: 40.4370, lng: -3.6730, radiusM: 180 },   // Jardín Botánico
  ];
  const TREE_SPACING_M = 12; // one synthetic tree every 12 m
  const DEG_PER_M_LAT = 1 / 111_000;
  const DEG_PER_M_LNG = 1 / 85_000; // at 40°N

  for (const p of parks) {
    const stepsLat = Math.ceil(p.radiusM * 2 / TREE_SPACING_M);
    const stepsLng = Math.ceil(p.radiusM * 2 / TREE_SPACING_M);
    for (let i = -stepsLat / 2; i <= stepsLat / 2; i++) {
      for (let j = -stepsLng / 2; j <= stepsLng / 2; j++) {
        const dlat = i * TREE_SPACING_M * DEG_PER_M_LAT;
        const dlng = j * TREE_SPACING_M * DEG_PER_M_LNG;
        // Only add if inside the park radius
        const distM = Math.sqrt((i * TREE_SPACING_M) ** 2 + (j * TREE_SPACING_M) ** 2);
        if (distM > p.radiusM) continue;
        addTree({ lat: p.lat + dlat, lng: p.lng + dlng, crownRadiusM: 5 });
      }
    }
  }
  console.log(`[treeIndex] Fallback clusters: ${treeCount} synthetic tree points`);
}

/**
 * Returns true if the given point falls under any tree crown in the index.
 * Falls back to false if the index hasn't been loaded yet.
 */
export function isShaded(lat: number, lng: number): boolean {
  if (!loaded || treeCount === 0) return false;

  const la = Math.floor(lat / CELL_DEG);
  const lo = Math.floor(lng / CELL_DEG);

  for (let dla = -1; dla <= 1; dla++) {
    for (let dlo = -1; dlo <= 1; dlo++) {
      const trees = grid.get(`${la + dla},${lo + dlo}`);
      if (!trees) continue;
      for (const t of trees) {
        const dlat = (lat - t.lat) * 111_000;
        const dlng = (lng - t.lng) * 85_000;
        if (Math.sqrt(dlat * dlat + dlng * dlng) <= t.crownRadiusM) return true;
      }
    }
  }
  return false;
}

export function getTreeCount() { return treeCount; }
export function isTreeIndexLoaded() { return loaded; }
