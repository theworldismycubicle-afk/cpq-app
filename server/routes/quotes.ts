import { Router } from 'express';
import { prisma } from '../db.ts';
import type { Quote } from '../../shared/types.ts';

export const quotesRouter = Router();

/** GET /api/quotes — saved-quote library (metadata only), newest first. */
quotesRouter.get('/', async (_req, res) => {
  const rows = await prisma.quote.findMany({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, quoteNumber: true, customer: true, updatedAt: true },
  });
  res.json(rows);
});

/** GET /api/quotes/:id — full quote document. */
quotesRouter.get('/:id', async (req, res) => {
  const row = await prisma.quote.findUnique({ where: { id: req.params.id } });
  if (!row) {
    res.status(404).json({ error: 'Quote not found' });
    return;
  }
  res.json(row.data);
});

/** PUT /api/quotes/:id — save (upsert) a full quote document. */
quotesRouter.put('/:id', async (req, res) => {
  const quote = req.body as Quote;
  if (!quote || quote.id !== req.params.id) {
    res.status(400).json({ error: 'Quote id mismatch' });
    return;
  }
  const fields = {
    quoteNumber: quote.quoteNumber ?? '',
    customer: quote.customer ?? '',
    date: quote.date ?? '',
    data: quote as object,
  };
  const row = await prisma.quote.upsert({
    where: { id: quote.id },
    create: { id: quote.id, ...fields },
    update: fields,
  });
  res.json({ id: row.id, quoteNumber: row.quoteNumber, customer: row.customer, updatedAt: row.updatedAt });
});

/** DELETE /api/quotes/:id */
quotesRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.quote.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: 'Quote not found' });
  }
});
