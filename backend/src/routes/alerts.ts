import { Router } from 'express';
import { getAlerts, joinedStationReadings } from '../services/madridData.js';

export const alertsRouter = Router();

alertsRouter.get('/active', (_req, res) => {
  const aemet = getAlerts();
  // Alerta local: si la temperatura media municipal supera 38°C lanzamos
  // un aviso interno (umbral OMS para riesgo sanitario en zonas urbanas).
  const stations = joinedStationReadings().filter((s) => s.reading?.temperatureC != null);
  const avg = stations.length
    ? stations.reduce((a, s) => a + (s.reading!.temperatureC ?? 0), 0) / stations.length
    : 0;
  const local = avg > 38 ? [{
    id: 'local-heat-threshold',
    severity: avg > 40 ? 'red' : 'orange',
    title: 'Temperatura media en Madrid muy elevada',
    description: `Temperatura media actual de ${avg.toFixed(1)}°C en la red municipal. Evita exposición prolongada al sol entre las 12:00 y las 17:00.`,
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    source: 'OasisMadrid (umbral local)',
  }] : [];
  res.json({ alerts: [...aemet, ...local], averageTempC: Math.round(avg * 10) / 10 });
});
