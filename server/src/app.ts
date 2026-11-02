import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env';
import { errorHandler } from './middleware/error';
import { apiLimiter } from './middleware/limits';
import { authRouter } from './modules/auth';
import { adminRouter } from './modules/admin';
import { masterRouter } from './modules/master';
import { receptionRouter } from './modules/receptions';
import { productionRouter } from './modules/production';
import { inventoryRouter } from './modules/inventory';
import { shipmentRouter } from './modules/shipments';
import { traceRouter } from './modules/trace';
import { incidentRouter } from './modules/incidents';
import { publicRouter } from './modules/public';
import { dashboardRouter } from './modules/dashboard';
import { marketRouter } from './modules/market';
import { documentRouter } from './modules/documents';
import { companyRouter } from './modules/company';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  const origins = env.CLIENT_ORIGIN.split(',').map((s) => s.trim());
  app.use(cors({ origin: (o, cb) => (!o || origins.includes(o) ? cb(null, true) : cb(new Error('CORS: origin not allowed'))), credentials: false, allowedHeaders: ['Content-Type', 'Authorization', 'X-Company-Id'] }));
  app.use(express.json({ limit: '1mb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));
  app.use('/api/public', publicRouter);
  app.use('/api', apiLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  for (const r of [masterRouter, receptionRouter, productionRouter, inventoryRouter, shipmentRouter, traceRouter, incidentRouter, dashboardRouter, marketRouter, documentRouter, companyRouter]) app.use('/api', r);
  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown endpoint' } }));
  app.use(errorHandler);
  return app;
}
