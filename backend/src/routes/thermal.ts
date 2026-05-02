import { Router } from 'express';
import { thermalAtPoint } from '../services/thermalIndex.js';
import { joinedStationReadings } from '../services/madridData.js';

export const thermalRouter = Router();

thermalRouter.get('/point', (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat & lng required' });
  }
  res.json(thermalAtPoint(lat, lng));
});

thermalRouter.get('/city', (_req, res) => {
  // Devuelve un punto térmico por estación (útil para el mapa de calor base).
  const stations = joinedStationReadings();
  const points = stations
    .filter((s) => s.reading?.temperatureC != null)
    .map((s) => thermalAtPoint(s.lat, s.lng));
  res.json({ points });
});

thermalRouter.get('/ranking', (_req, res) => {
  const stations = joinedStationReadings()
    .filter((s) => s.reading?.temperatureC != null)
    .map((s) => ({
      id: s.id,
      name: s.name,
      district: s.district,
      temperatureC: s.reading!.temperatureC,
      ict: thermalAtPoint(s.lat, s.lng).ict,
    }))
    .sort((a, b) => (a.temperatureC ?? 99) - (b.temperatureC ?? 99));
  res.json({
    coolest: stations.slice(0, 5),
    hottest: stations.slice(-5).reverse(),
  });
});
