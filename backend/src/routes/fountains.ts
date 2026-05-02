import { Router } from 'express';
import { getFountains, getFreshness } from '../services/madridData.js';
import { haversineM } from '../services/thermalIndex.js';

export const fountainsRouter = Router();

fountainsRouter.get('/', (req, res) => {
  const type = req.query.type as 'drink' | 'pet' | undefined;
  const lat = req.query.lat ? Number(req.query.lat) : null;
  const lng = req.query.lng ? Number(req.query.lng) : null;
  const radius = req.query.radius ? Number(req.query.radius) : null;
  let items = getFountains();
  if (type) items = items.filter((f) => f.type === type);
  if (lat !== null && lng !== null && radius !== null) {
    items = items.filter((f) => haversineM({ lat, lng }, { lat: f.lat, lng: f.lng }) <= radius);
  }
  res.json({ count: items.length, fountains: items, freshness: getFreshness().fountains });
});

fountainsRouter.get('/nearest', (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const type = req.query.type as 'drink' | 'pet' | undefined;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat & lng required' });
  }
  let items = getFountains().filter((f) => f.status === 'EN_SERVICIO');
  if (type) items = items.filter((f) => f.type === type);
  const ranked = items
    .map((f) => ({ ...f, distanceM: Math.round(haversineM({ lat, lng }, { lat: f.lat, lng: f.lng })) }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 10);
  res.json({ fountains: ranked });
});
