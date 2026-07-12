import { Router } from 'express';
import { prisma } from '../db.ts';

export const partsRouter = Router();

/** GET /api/parts — full price list, partNumber-sorted. */
partsRouter.get('/', async (_req, res) => {
  const parts = await prisma.part.findMany({ orderBy: { partNumber: 'asc' } });
  res.json(parts);
});

/** POST /api/parts — create or update one part (upsert by partNumber). */
partsRouter.post('/', async (req, res) => {
  const { partNumber, description = '', unitPrice = 0, category, lastUpdated } = req.body ?? {};
  if (!partNumber || typeof partNumber !== 'string') {
    res.status(400).json({ error: 'partNumber is required' });
    return;
  }
  const data = { description, unitPrice: Number(unitPrice) || 0, category: category ?? null, lastUpdated: lastUpdated ?? null };
  const part = await prisma.part.upsert({
    where: { partNumber },
    create: { partNumber, ...data },
    update: data,
  });
  res.json(part);
});

/** PATCH /api/parts/:partNumber — partial update. */
partsRouter.patch('/:partNumber', async (req, res) => {
  const { partNumber } = req.params;
  const patch = req.body ?? {};
  if (patch.unitPrice != null) patch.unitPrice = Number(patch.unitPrice) || 0;
  try {
    const part = await prisma.part.update({ where: { partNumber }, data: patch });
    res.json(part);
  } catch {
    res.status(404).json({ error: 'Part not found' });
  }
});

/** DELETE /api/parts/:partNumber */
partsRouter.delete('/:partNumber', async (req, res) => {
  try {
    await prisma.part.delete({ where: { partNumber: req.params.partNumber } });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: 'Part not found' });
  }
});

/**
 * POST /api/parts/bulk — merge a batch (from an Excel import).
 * Body: { entries: PriceListEntry[] }. Upserts by partNumber; returns counts.
 */
partsRouter.post('/bulk', async (req, res) => {
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
  let added = 0;
  let updated = 0;
  for (const e of entries) {
    const partNumber = String(e.partNumber ?? '').trim();
    if (!partNumber) continue;
    const data = {
      description: e.description ?? '',
      unitPrice: Number(e.unitPrice) || 0,
      category: e.category ?? null,
      lastUpdated: e.lastUpdated ?? null,
    };
    const existing = await prisma.part.findUnique({ where: { partNumber } });
    await prisma.part.upsert({ where: { partNumber }, create: { partNumber, ...data }, update: data });
    if (existing) updated++;
    else added++;
  }
  res.json({ added, updated, total: added + updated });
});

/**
 * PUT /api/parts — replace the whole list with `entries`, preserving row ids for
 * surviving part numbers (upsert) and deleting the rest. Single source-of-truth sync.
 */
partsRouter.put('/', async (req, res) => {
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
  const keep = new Set<string>();
  const ops = [];
  for (const e of entries) {
    const partNumber = String(e.partNumber ?? '').trim();
    if (!partNumber || keep.has(partNumber)) continue;
    keep.add(partNumber);
    const data = {
      description: e.description ?? '',
      unitPrice: Number(e.unitPrice) || 0,
      category: e.category ?? null,
      lastUpdated: e.lastUpdated ?? null,
    };
    ops.push(prisma.part.upsert({ where: { partNumber }, create: { partNumber, ...data }, update: data }));
  }
  const del =
    keep.size === 0
      ? prisma.part.deleteMany()
      : prisma.part.deleteMany({ where: { partNumber: { notIn: Array.from(keep) } } });
  await prisma.$transaction([del, ...ops]);
  const saved = await prisma.part.findMany({ orderBy: { partNumber: 'asc' } });
  res.json(saved);
});

/** DELETE /api/parts — clear the whole list. */
partsRouter.delete('/', async (_req, res) => {
  await prisma.part.deleteMany();
  res.status(204).end();
});
