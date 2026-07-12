import { Router } from 'express';
import { prisma } from '../db.ts';

export const laborRatesRouter = Router();

/** GET /api/labor-rates — all rates, code-sorted. */
laborRatesRouter.get('/', async (_req, res) => {
  const rates = await prisma.laborRate.findMany({ orderBy: { code: 'asc' } });
  res.json(rates);
});

/** POST /api/labor-rates — upsert one rate by code. */
laborRatesRouter.post('/', async (req, res) => {
  const { code, description = '', rate = 0 } = req.body ?? {};
  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'code is required' });
    return;
  }
  const data = { description, rate: Number(rate) || 0 };
  const saved = await prisma.laborRate.upsert({
    where: { code },
    create: { code, ...data },
    update: data,
  });
  res.json(saved);
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
      .map((r: { code: string; description?: string; rate?: number }) =>
        prisma.laborRate.create({
          data: { code: r.code, description: r.description ?? '', rate: Number(r.rate) || 0 },
        }),
      ),
  ]);
  const saved = await prisma.laborRate.findMany({ orderBy: { code: 'asc' } });
  res.json(saved);
});
