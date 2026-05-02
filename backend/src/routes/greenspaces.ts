import { Router } from 'express';
import { getGreenSpaces, getFreshness } from '../services/madridData.js';
import { haversineM } from '../services/thermalIndex.js';

export const greenspacesRouter = Router();

greenspacesRouter.get('/', (_req, res) => {
  res.json({ greenSpaces: getGreenSpaces(), freshness: getFreshness().greenSpaces });
});

greenspacesRouter.get('/nearest', (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat & lng required' });
  }
  const ranked = getGreenSpaces()
    .map((g) => ({ ...g, distanceM: Math.round(haversineM({ lat, lng }, g.centroid)) }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 5);
  res.json({ greenSpaces: ranked });
});
