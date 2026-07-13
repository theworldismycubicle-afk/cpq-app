import ExcelJS from 'exceljs';
import { newQuote, newStep, newSubcomponent, newPartLine, type Quote, type EquipmentStep, type Subcomponent, type PartLine } from '../../shared/types';
import { formatTicketNo, type ComputedQuote } from '../../shared/computed';

/**
 * Flat BOM layout — ONE ROW PER PART. Grouping columns (Work Ticket #, Step #)
 * repeat on every row; the step-level fields (name, activity, labor, markup) are
 * written once on a step's first row. Import groups by Work Ticket # + Step #.
 */
const FLAT_HEADERS = [
  'Work Ticket #', 'Work Ticket Name', 'Step #', 'Step Name', 'Activity Code',
  'Labor Hours', 'Labor Code', 'Labor Rate', 'Markup %',
  'Part Number', 'P&ID Ref', 'Description', 'Qty', 'Unit Price', 'Ext Price',
];

// One row per Step (subcomponent), matching the ERP budget-import template.
const STEP_SUMMARY_HEADERS = ['WORK TICKET', 'STEP', 'DESCRIPTION', 'ACTIVITY CODE', 'BUDGET LABOR', 'BUDGET MATERIAL', 'LABOR HOURS'];

/** Which price to display for a line (manual override vs list) — not a secret formula. */
function effUnitPrice(p: PartLine): number {
  return p.priceSource === 'manual' && p.manualPriceOverride !== undefined ? p.manualPriceOverride : p.unitPrice;
}

/** Lookup used to price parts on import (from the price list). */
export type PriceLookup = (partNumber: string) => { unitPrice: number; description?: string; lastUpdated?: string } | undefined;

/** Exports a Step-level summary (one row per Step/subcomponent) for the ERP budget import. */
export async function writeStepSummaryBuffer(steps: EquipmentStep[], computed: ComputedQuote): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Step Summary');
  sheet.addRow(STEP_SUMMARY_HEADERS);
  sheet.getRow(1).font = { bold: true };

  for (const wt of steps) {
    for (const sub of wt.subcomponents) {
      const m = computed.subs[sub.id];
      const activity = sub.activityCode || (sub.laborHours > 0 ? sub.laborCode : 'DFLT');
      sheet.addRow([
        formatTicketNo(wt.stepNumber),
        sub.number,
        sub.name,
        activity,
        m?.labor ?? 0,
        m?.material ?? 0,
        sub.laborHours,
      ]);
    }
  }

  [10, 10, 30, 14, 14, 14, 12].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function writeBomWorkbookBuffer(quote: Quote, computed: ComputedQuote): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();

  // Quote Info sheet: header fields so a re-imported BOM restores the quote header.
  const info = wb.addWorksheet('Quote Info');
  info.addRow(['Field', 'Value']);
  info.getRow(1).font = { bold: true };
  info.addRow(['Quote #', quote.quoteNumber]);
  info.addRow(['Customer', quote.customer]);
  info.addRow(['Date', quote.date]);
  info.addRow(['Default Markup %', quote.defaultMarkupPct]);
  const t = quote.template;
  info.addRow(['Template: Company Name', t.companyName]);
  info.addRow(['Template: Company Subtitle', t.companySubtitle]);
  info.addRow(['Template: Header Title', t.headerTitle]);
  info.addRow(['Template: Terms Text', t.termsText]);
  info.addRow(['Template: Valid Days', t.validDays]);
  info.addRow(['Template: Show Material Column', t.showMaterialColumn ? 'Yes' : 'No']);
  info.addRow(['Template: Show Labor Column', t.showLaborColumn ? 'Yes' : 'No']);
  info.addRow(['Template: Show Markup Column', t.showMarkupColumn ? 'Yes' : 'No']);
  info.addRow(['Template: Accent Color', t.accentColorHex]);
  info.getColumn(1).width = 26;
  info.getColumn(2).width = 40;

  writeBomSheet(wb, quote.steps, computed);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** Workbook containing just the flat BOM sheet for the given work tickets. */
export async function writeStepsBuffer(steps: EquipmentStep[], computed: ComputedQuote): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  writeBomSheet(wb, steps, computed);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

function writeBomSheet(wb: ExcelJS.Workbook, steps: EquipmentStep[], computed: ComputedQuote): void {
  const sheet = wb.addWorksheet('BOM');
  sheet.addRow(FLAT_HEADERS);
  sheet.getRow(1).font = { bold: true };

  for (const wt of steps) {
    const wtNo = formatTicketNo(wt.stepNumber);
    let wtNameWritten = false;
    const emitWtName = () => (wtNameWritten ? '' : ((wtNameWritten = true), wt.name));

    if (wt.subcomponents.length === 0) {
      sheet.addRow([wtNo, wt.name, '', '', '', '', '', '', '', '', '', '', '', '', '']);
      continue;
    }

    for (const sub of wt.subcomponents) {
      const m = computed.subs[sub.id];
      let subHeadWritten = false;
      const stepFields = () =>
        subHeadWritten
          ? ['', '', '', '', '']
          : ((subHeadWritten = true), [sub.name, sub.activityCode ?? '', sub.laborHours, sub.laborCode, sub.laborRate]);
      const markupCell = () => (subHeadWritten && m ? '' : m?.markupPct ?? '');

      if (sub.parts.length === 0) {
        const [sName, act, lh, lc, lr] = stepFields();
        sheet.addRow([wtNo, emitWtName(), sub.number, sName, act, lh, lc, lr, m?.markupPct ?? '', '', '', '', '', '', '']);
        continue;
      }
      for (const part of sub.parts) {
        const mk = markupCell();
        const [sName, act, lh, lc, lr] = stepFields();
        sheet.addRow([
          wtNo, emitWtName(), sub.number, sName, act, lh, lc, lr, mk,
          part.partNumber, part.pidRef ?? '', part.description, part.qty,
          effUnitPrice(part), computed.lines[part.id] ?? 0,
        ]);
      }
    }
  }

  [10, 24, 8, 24, 12, 10, 10, 10, 9, 16, 12, 34, 8, 12, 12].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
}

/** Reads just the work tickets/steps from a BOM workbook (ignores any Quote Info header). */
export async function readStepsFromBuffer(buffer: ArrayBuffer, priceLookup?: PriceLookup): Promise<EquipmentStep[]> {
  return (await readBomWorkbookFromBuffer(buffer, priceLookup)).steps;
}

export async function readBomWorkbookFromBuffer(buffer: ArrayBuffer, priceLookup?: PriceLookup): Promise<Quote> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const quote = newQuote();

  const infoSheet = wb.getWorksheet('Quote Info');
  if (infoSheet) readQuoteInfo(infoSheet, quote);

  const sheet = wb.getWorksheet('BOM') ?? firstDataSheet(wb);
  if (!sheet) return quote;

  // Detect layout from the header row: original file has "Step #" in col 2 and a
  // "Work Ticket Name" (really the step name) in col 3; the flat format has
  // "Work Ticket Name" in col 2 and "Step #" in col 3.
  const h2 = headerText(sheet, 2);
  const h3 = headerText(sheet, 3);
  const isOriginal = h2.includes('step') && h3.includes('name');

  quote.steps = isOriginal ? parseOriginalLayout(sheet) : parseFlatLayout(sheet);
  if (priceLookup) applyPrices(quote, priceLookup);
  return quote;
}

// ---- Flat layout parser ----
function parseFlatLayout(sheet: ExcelJS.Worksheet): EquipmentStep[] {
  const steps: EquipmentStep[] = [];
  let currentWt: EquipmentStep | null = null;
  let subMap = new Map<string, Subcomponent>();

  sheet.eachRow((row, i) => {
    if (i === 1) return;
    const wtNo = str(row.getCell(1).value);
    const wtName = str(row.getCell(2).value);
    const stepNo = str(row.getCell(3).value);
    if (!wtNo && !stepNo) return;

    if (wtNo && (!currentWt || String(currentWt.stepNumber) !== String(num(wtNo)))) {
      const existing = steps.find((s) => String(s.stepNumber) === String(num(wtNo)));
      if (existing) {
        currentWt = existing;
      } else {
        currentWt = { ...newStep(wtName || `Work Ticket ${wtNo}`, num(wtNo)) };
        steps.push(currentWt);
        subMap = new Map();
      }
    }
    if (!currentWt) return;
    if (wtName && !currentWt.name) currentWt.name = wtName;

    if (!stepNo) return;
    let sub = subMap.get(stepNo);
    if (!sub) {
      sub = { ...newSubcomponent(str(row.getCell(4).value) || `Step ${stepNo}`, stepNo) };
      const activity = str(row.getCell(5).value);
      if (activity) sub.activityCode = activity;
      sub.laborHours = num(row.getCell(6).value);
      sub.laborCode = str(row.getCell(7).value) || 'ASSY';
      sub.laborRate = num(row.getCell(8).value);
      const mk = str(row.getCell(9).value);
      if (mk !== '') sub.markupOverride = num(mk);
      subMap.set(stepNo, sub);
      currentWt.subcomponents.push(sub);
    }
    const pn = str(row.getCell(10).value);
    if (pn) sub.parts.push(makePart(pn, str(row.getCell(11).value), str(row.getCell(12).value), num(row.getCell(13).value), num(row.getCell(14).value)));
  });

  return steps;
}

// ---- Original header-row layout parser (the "Vessel BOM 7-10" file) ----
function parseOriginalLayout(sheet: ExcelJS.Worksheet): EquipmentStep[] {
  const steps: EquipmentStep[] = [];
  let currentWt: EquipmentStep | null = null;
  let subMap = new Map<string, Subcomponent>();

  const ensureSub = (stepNo: string, name?: string): Subcomponent | null => {
    if (!currentWt || !stepNo) return null;
    let sub = subMap.get(stepNo);
    if (!sub) {
      sub = { ...newSubcomponent(name || `Step ${stepNo}`, stepNo), activityCode: 'DFLT' };
      subMap.set(stepNo, sub);
      currentWt.subcomponents.push(sub);
    } else if (name && (!sub.name || sub.name.startsWith('Step '))) {
      sub.name = name;
    }
    return sub;
  };

  sheet.eachRow((row, i) => {
    if (i === 1) return;
    const wtNo = str(row.getCell(1).value);
    const stepHdr = str(row.getCell(2).value); // Step # on header rows
    const stepName = str(row.getCell(3).value); // step name on header rows
    const stepPart = str(row.getCell(4).value); // Step # on part rows
    const pn = str(row.getCell(5).value);
    if (!wtNo && !stepHdr && !pn) return;

    if (wtNo && (!currentWt || String(currentWt.stepNumber) !== String(num(wtNo)))) {
      currentWt = { ...newStep(`Work Ticket ${wtNo}`, num(wtNo)) };
      steps.push(currentWt);
      subMap = new Map();
    }
    if (stepHdr && !pn) {
      ensureSub(stepHdr, stepName);
      return;
    }
    if (pn) {
      const sub = ensureSub(stepPart);
      if (sub) sub.parts.push(makePart(pn, str(row.getCell(6).value), str(row.getCell(7).value), num(row.getCell(8).value)));
    }
  });

  return steps;
}

function makePart(partNumber: string, pidRef: string, description: string, qty: number, unitPrice = 0): PartLine {
  const part: PartLine = { ...newPartLine(), partNumber, description, qty: qty || 1, unitPrice, priceSource: unitPrice > 0 ? 'list' : 'list' };
  if (pidRef) part.pidRef = pidRef;
  return part;
}

/** Prices every part from the list; parts not found are flagged for manual input. */
function applyPrices(quote: Quote, lookup: PriceLookup): void {
  for (const wt of quote.steps) {
    for (const sub of wt.subcomponents) {
      for (const part of sub.parts) {
        if (part.unitPrice > 0) continue; // price came from the file
        const info = lookup(part.partNumber);
        if (info) {
          part.unitPrice = info.unitPrice;
          part.priceSource = 'list';
          part.priceUpdatedAt = info.lastUpdated;
          if (!part.description && info.description) part.description = info.description;
        } else {
          part.priceSource = 'list';
          part.requiresInput = true;
        }
      }
    }
  }
}

function readQuoteInfo(infoSheet: ExcelJS.Worksheet, quote: Quote): void {
  infoSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const field = str(row.getCell(1).value).toLowerCase();
    const value = row.getCell(2).value;
    if (field === 'quote #') quote.quoteNumber = String(value ?? '');
    else if (field === 'customer') quote.customer = String(value ?? '');
    else if (field === 'date') quote.date = normalizeDate(value) || quote.date;
    else if (field === 'default markup %') quote.defaultMarkupPct = num(value) || quote.defaultMarkupPct;
    else if (field === 'template: company name') quote.template.companyName = String(value ?? '');
    else if (field === 'template: company subtitle') quote.template.companySubtitle = String(value ?? '');
    else if (field === 'template: header title') quote.template.headerTitle = String(value ?? '');
    else if (field === 'template: terms text') quote.template.termsText = String(value ?? '');
    else if (field === 'template: valid days') quote.template.validDays = num(value) || quote.template.validDays;
    else if (field === 'template: show material column') quote.template.showMaterialColumn = isYes(value);
    else if (field === 'template: show labor column') quote.template.showLaborColumn = isYes(value);
    else if (field === 'template: show markup column') quote.template.showMarkupColumn = isYes(value);
    else if (field === 'template: accent color') quote.template.accentColorHex = String(value ?? '') || quote.template.accentColorHex;
  });
}

function firstDataSheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet | undefined {
  return wb.worksheets.find((w) => w.name !== 'Quote Info') ?? wb.worksheets[0];
}
function headerText(sheet: ExcelJS.Worksheet, col: number): string {
  return str(sheet.getRow(1).getCell(col).value).toLowerCase();
}
function cellPrimitive(v: unknown): unknown {
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return o.result;
    if ('text' in o) return o.text;
    if ('richText' in o && Array.isArray(o.richText)) return (o.richText as { text?: string }[]).map((r) => r.text ?? '').join('');
    return '';
  }
  return v;
}
function str(v: unknown): string {
  return String(cellPrimitive(v) ?? '').trim();
}
function num(v: unknown): number {
  const p = cellPrimitive(v);
  const n = typeof p === 'number' ? p : Number(p);
  return Number.isFinite(n) ? n : 0;
}
function isYes(v: unknown): boolean {
  const s = String(cellPrimitive(v) ?? '').trim().toLowerCase();
  return s === 'yes' || s === 'true' || s === '1';
}
function normalizeDate(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(cellPrimitive(v) ?? '').trim();
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}
