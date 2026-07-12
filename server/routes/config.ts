import { Router } from 'express';
import { prisma } from '../db.ts';

export const configRouter = Router();

// Allowed config docs: the assembler rules, the H2S system rules, and the working draft.
const KEYS = new Set(['assembler', 'h2s', 'autosave']);

/** GET /api/config/:key — returns the stored JSON doc, or null if unset. */
configRouter.get('/:key', async (req, res) => {
  if (!KEYS.has(req.params.key)) {
    res.status(404).json({ error: 'Unknown config key' });
    return;
  }
  const row = await prisma.appConfig.findUnique({ where: { key: req.params.key } });
  res.json(row?.value ?? null);
});

/** PUT /api/config/:key — upsert the JSON doc. */
configRouter.put('/:key', async (req, res) => {
  if (!KEYS.has(req.params.key)) {
    res.status(404).json({ error: 'Unknown config key' });
    return;
  }
  const value = req.body ?? null;
  const row = await prisma.appConfig.upsert({
    where: { key: req.params.key },
    create: { key: req.params.key, value },
    update: { value },
  });
  res.json(row.value);
});
