import { Router } from 'express';
import { partsRouter } from './parts.ts';
import { laborRatesRouter } from './laborRates.ts';
import { quotesRouter } from './quotes.ts';
import { configRouter } from './config.ts';
import { computeRouter } from './compute.ts';

export const api = Router();

api.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'cpq-api', time: new Date().toISOString() });
});

api.use('/parts', partsRouter);
api.use('/labor-rates', laborRatesRouter);
api.use('/quotes', quotesRouter);
api.use('/config', configRouter);
api.use('/compute', computeRouter);
