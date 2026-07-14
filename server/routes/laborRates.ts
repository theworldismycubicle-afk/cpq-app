import { Router } from 'express';
import { prisma } from '../db.ts';

export const laborRatesRouter = Router();

// The DB column is `description`; the app calls it `activity`. Map at the API boundary.
const toApi = (r: { code: string; description: string; rate: number }) => ({ code: r.code, activity: r.description, rate: r.rate });

/** GET /api/labor-rates — all rates, code-sorted. */
laborRatesRouter.get('/', async (_req, res) => {
  const rates = await prisma.laborRate.findMany({ orderBy: { code: 'asc' } });
  res.json(rates.map(toApi));
});

/** POST /api/labor-rates — upsert one rate by code. */
laborRatesRouter.post('/', async (req, res) => {
  const { code, activity = '', rate = 0 } = req.body ?? {};
  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'code is required' });
    return;
  }
  const data = { description: activity, rate: Number(rate) || 0 };
  const saved = await prisma.laborRate.upsert({
    where: { code },
    create: { code, ...data },
    update: data,
  });
  res.json(toApi(saved));
});

/** DELETE /api/labor-rates/:code */
laborRatesRouter.delete('/:code', async (req, res) => {
  try {
    await prisma.laborRate.delete({ where: { code: req.params.code } });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: 'Rate not found' });
  }
});

/**
 * PUT /api/labor-rates — replace the whole set (used by "set rates" / merge / reset).
 * Body: { rates: LaborRateEntry[] }.
 */
laborRatesRouter.put('/', async (req, res) => {
  const rates = Array.isArray(req.body?.rates) ? req.body.rates : [];
  await prisma.$transaction([
    prisma.laborRate.deleteMany(),
    ...rates
      .filter((r: { code?: string }) => String(r.code ?? '').trim())
      .map((r: { code: string; activity?: string; rate?: number }) =>
        prisma.laborRate.create({
          data: { code: r.code, description: r.activity ?? '', rate: Number(r.rate) || 0 },
        }),
      ),
  ]);
  const saved = await prisma.laborRate.findMany({ orderBy: { code: 'asc' } });
  res.json(saved.map(toApi));
});
