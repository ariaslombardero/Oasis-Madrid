import { Router } from 'express';
import axios from 'axios';
import { planFreshRoute, planRoundTrip, type UserProfile } from '../services/routing.js';

export const routeRouter = Router();

const VALID_PROFILES: UserProfile[] = ['general', 'elderly', 'pet', 'pmr'];

// Geocoding autocomplete using ORS Pelias (falls back to Nominatim if no key)
routeRouter.get('/geocode', async (req, res) => {
  const text = String(req.query.text ?? '').trim();
  if (text.length < 2) return res.json({ features: [] });

  const apiKey = process.env.ORS_API_KEY;
  try {
    if (apiKey) {
      const params = new URLSearchParams({
        api_key: apiKey,
        text,
        'boundary.country': 'ES',
        'boundary.rect.min_lon': '-4.1',
        'boundary.rect.min_lat': '40.2',
        'boundary.rect.max_lon': '-3.5',
        'boundary.rect.max_lat': '40.65',
        size: '6',
        layers: 'address,venue,street',
        lang: 'es',
      });
      const r = await axios.get(`https://api.heigit.org/geocode/autocomplete?${params}`, { timeout: 5000 });
      const features = (r.data as any).features ?? [];
      return res.json({
        results: features.map((f: any) => ({
          label: f.properties.label ?? f.properties.name,
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
        })),
      });
    }
  } catch { /* fallback below */ }

  // Nominatim fallback (no key needed)
  try {
    const params = new URLSearchParams({
      q: `${text}, Madrid`,
      format: 'json',
      limit: '6',
      countrycodes: 'es',
      viewbox: '-4.1,40.65,-3.5,40.2',
      bounded: '1',
    });
    const r = await axios.get(`https://nominatim.openstreetmap.org/search?${params}`, {
      timeout: 5000,
      headers: { 'User-Agent': 'OasisMadrid/1.0 (oasismadrid.app)' },
    });
    const items = r.data as any[];
    return res.json({
      results: items.map((i) => ({
        label: i.display_name.split(',').slice(0, 3).join(',').trim(),
        lat: Number(i.lat),
        lng: Number(i.lon),
      })),
    });
  } catch (err) {
    return res.status(502).json({ results: [], error: (err as Error).message });
  }
});

// Round-trip walk by duration
routeRouter.post('/walk', async (req, res) => {
  try {
    const { origin, durationMin = 30, profile = 'general' } = req.body || {};
    if (!Array.isArray(origin) || origin.length !== 2) {
      return res.status(400).json({ error: 'origin must be [lng, lat]' });
    }
    if (!VALID_PROFILES.includes(profile)) {
      return res.status(400).json({ error: `profile must be one of ${VALID_PROFILES.join(', ')}` });
    }
    const result = await planRoundTrip(
      [Number(origin[0]), Number(origin[1])],
      Number(durationMin),
      profile as UserProfile,
    );
    res.json({ ...result, orsConfigured: Boolean(process.env.ORS_API_KEY) });
  } catch (err) {
    console.error('[route/walk]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

routeRouter.post('/fresh', async (req, res) => {
  try {
    const { origin, destination, profile = 'general' } = req.body || {};
    if (!Array.isArray(origin) || !Array.isArray(destination) || origin.length !== 2 || destination.length !== 2) {
      return res.status(400).json({
        error: 'origin and destination must be [lng, lat] arrays',
        example: { origin: [-3.7038, 40.4168], destination: [-3.6824, 40.4150], profile: 'general' },
      });
    }
    if (!VALID_PROFILES.includes(profile)) {
      return res.status(400).json({ error: `profile must be one of ${VALID_PROFILES.join(', ')}` });
    }
    const rawWps: unknown = req.body.waypoints;
    const waypoints: [number, number][] = Array.isArray(rawWps)
      ? rawWps.filter((w) => Array.isArray(w) && w.length === 2).map((w: any) => [Number(w[0]), Number(w[1])])
      : [];

    const result = await planFreshRoute(
      [Number(origin[0]), Number(origin[1])],
      [Number(destination[0]), Number(destination[1])],
      profile as UserProfile,
      waypoints.length ? waypoints : undefined,
    );
    const tempDiff = Math.round((result.standard.avgTempC - result.fresh.avgTempC) * 10) / 10;
    const timeDiffMin = Math.round((result.fresh.durationS - result.standard.durationS) / 60);
    res.json({
      ...result,
      comparison: {
        timeDiffMin,
        tempDiffC: tempDiff,
        fountainsExtra: result.fresh.fountainCount - result.standard.fountainCount,
      },
      orsConfigured: Boolean(process.env.ORS_API_KEY),
    });
  } catch (err) {
    console.error('[route/fresh]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});
