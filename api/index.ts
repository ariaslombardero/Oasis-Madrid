// Vercel Serverless Function entry point
// Uses @vercel/node which compiles TS with esbuild (handles .js imports from .ts)

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

// Import directly from TS sources — @vercel/node resolves .js → .ts automatically
import { weatherRouter } from '../backend/src/routes/weather.js';
import { fountainsRouter } from '../backend/src/routes/fountains.js';
import { greenspacesRouter } from '../backend/src/routes/greenspaces.js';
import { thermalRouter } from '../backend/src/routes/thermal.js';
import { routeRouter } from '../backend/src/routes/route.js';
import { alertsRouter } from '../backend/src/routes/alerts.js';
import { warmupAll, getTreeIndexStats } from '../backend/src/services/madridData.js';

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

// Warmup middleware — runs once on cold start
let warmedUp = false;
app.use(async (_req: Request, _res: Response, next: NextFunction) => {
  if (!warmedUp) {
    warmedUp = true;
    try {
      await warmupAll();
    } catch (e) {
      console.error('[warmup]', e);
      warmedUp = false;
    }
  }
  next();
});

app.use('/api/v1/weather', weatherRouter);
app.use('/api/v1/fountains', fountainsRouter);
app.use('/api/v1/greenspaces', greenspacesRouter);
app.use('/api/v1/thermal', thermalRouter);
app.use('/api/v1/route', routeRouter);
app.use('/api/v1/alerts', alertsRouter);

app.get('/api/v1/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'oasismadrid-backend',
    runtime: 'vercel-serverless',
    ts: new Date().toISOString(),
    datasets: { trees_ds03: getTreeIndexStats() },
  });
});

export default app;
