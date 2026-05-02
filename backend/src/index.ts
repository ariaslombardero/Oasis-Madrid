import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';

import { weatherRouter } from './routes/weather.js';
import { fountainsRouter } from './routes/fountains.js';
import { greenspacesRouter } from './routes/greenspaces.js';
import { thermalRouter } from './routes/thermal.js';
import { routeRouter } from './routes/route.js';
import { alertsRouter } from './routes/alerts.js';
import { refreshWeather, refreshFountains, refreshGreenspaces, refreshAemetAlerts, warmupAll, getTreeIndexStats } from './services/madridData.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(cors({ origin: [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'] }));
app.use(express.json());

app.use('/api/v1/weather', weatherRouter);
app.use('/api/v1/fountains', fountainsRouter);
app.use('/api/v1/greenspaces', greenspacesRouter);
app.use('/api/v1/thermal', thermalRouter);
app.use('/api/v1/route', routeRouter);
app.use('/api/v1/alerts', alertsRouter);

app.get('/api/v1/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'oasismadrid-backend',
    ts: new Date().toISOString(),
    datasets: {
      trees_ds03: getTreeIndexStats(),
    },
  });
});

app.get('/', (_req, res) => {
  res.json({
    name: 'OasisMadrid API',
    version: '0.1.0',
    endpoints: [
      'GET /api/v1/health',
      'GET /api/v1/weather/current',
      'GET /api/v1/fountains?type=drink|pet',
      'GET /api/v1/greenspaces',
      'GET /api/v1/thermal/point?lat=&lng=',
      'GET /api/v1/thermal/city',
      'GET /api/v1/weather/forecast',
      'POST /api/v1/route/fresh',
      'GET /api/v1/route/geocode?text=',
      'POST /api/v1/route/walk',
      'GET /api/v1/alerts/active',
    ],
  });
});

app.listen(PORT, async () => {
  console.log(`[oasismadrid] backend listening on http://localhost:${PORT}`);
  console.log('[oasismadrid] warming up data caches...');
  await warmupAll();
  console.log('[oasismadrid] ready.');
});

// Cron jobs — ingestión periódica de datos abiertos
cron.schedule('*/20 * * * *', () => {
  console.log('[cron] refreshing weather (20 min)');
  refreshWeather().catch((e) => console.error('[cron weather]', e));
});
cron.schedule('0 6 * * *', () => {
  console.log('[cron] refreshing fountains (daily 06:00)');
  refreshFountains().catch((e) => console.error('[cron fountains]', e));
});
cron.schedule('0 3 * * 0', () => {
  console.log('[cron] refreshing green spaces (weekly)');
  refreshGreenspaces().catch((e) => console.error('[cron greenspaces]', e));
});
cron.schedule('0 * * * *', () => {
  console.log('[cron] refreshing AEMET alerts (hourly)');
  refreshAemetAlerts().catch((e) => console.error('[cron aemet]', e));
});
