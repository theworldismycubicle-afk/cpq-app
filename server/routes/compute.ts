import { Router } from 'express';
import { computeQuote } from '../calc.ts';
import type { Quote } from '../../shared/types.ts';

export const computeRouter = Router();

/** POST /api/compute — body is a Quote; returns the computed pricing overlay. */
computeRouter.post('/', (req, res) => {
  const quote = req.body as Quote;
  if (!quote || !Array.isArray(quote.steps)) {
    res.status(400).json({ error: 'Expected a quote with a steps array' });
    return;
  }
  res.json(computeQuote(quote));
});
