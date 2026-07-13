import ExcelJS from 'exceljs';
import { newQuote, newStep, newSubcomponent, newPartLine, type Quote, type EquipmentStep, type Subcomponent, type PartLine } from '../../shared/types';
import { lineExtendedPrice, subcomponentMaterialTotal, subcomponentLaborCost, subcomponentMarkupPct, subcomponentSellPrice } from '../../shared/calculations';

// Level 1 = Equipment Step, Level 2 = Subcomponent, Level 3 = Part.
const HEADERS = [
  'Level', 'Work Ticket #', 'Work Ticket Name', 'Group', 'Step #', 'Step Name',
  'Part Number', 'Description', 'Qty', 'Unit Price', 'Price Source',
  'Labor Hours', 'Labor Code', 'Labor Rate', 'Markup %',
  'Ext Price', 'Sell Price', 'Price Updated', 'Price Locked', 'Activity Code',
];

// One row per Equipment Step, totaling labor hours/cost and material cost per step.
const STEP_SUMMARY_HEADERS = ['WORK TICKET', 'DESCRIPTION', 'ACTIVITY CODE', 'BUDGET LABOR', 'BUDGET MATERIAL', 'LABOR HOURS'];

/** Exports a step-level summary (one row per step) matching the ERP budget-import template. */
export async function writeStepSummaryBuffer(steps: EquipmentStep[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Step Summary');
  sheet.addRow(STEP_SUMMARY_HEADERS);
  sheet.getRow(1).font = { bold: true };

  for (const step of steps) {
    let laborHours = 0;
    let laborCost = 0;
    let materialCost = 0;
    const codes: string[] = [];
    for (const sub of step.subcomponents) {
      laborHours += sub.laborHours;
      laborCost += subcomponentLaborCost(sub);
      materialCost += subcomponentMaterialTotal(sub);
      if (sub.laborHours > 0 && sub.laborCode && !codes.includes(sub.laborCode)) codes.push(sub.laborCode);
    }
    const activityCode = step.activityCode || codes.join(', ');
    sheet.addRow([step.stepNumber, step.name, activityCode, laborCost, materialCost, laborHours]);
  }

  sheet.getColumn(1).width = 8;
  sheet.getColumn(2).width = 32;
  sheet.getColumn(3).width = 16;
  sheet.getColumn(4).width = 16;
  sheet.getColumn(5).width = 16;
  sheet.getColumn(6).width = 14;
  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export async function writeBomWorkbookBuffer(quote: Quote): Promise<ArrayBuffer> {
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

  writeBomSheet(wb, quote.steps, quote.defaultMarkupPct);
  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/** Writes a workbook containing just the BOM sheet for the given steps (no Quote Info header). */
export async function writeStepsBuffer(steps: EquipmentStep[], defaultMarkupPct: number): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  writeBomSheet(wb, steps, defaultMarkupPct);
  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

function writeBomSheet(wb: ExcelJS.Workbook, steps: EquipmentStep[], defaultMarkupPct: number): void {
  const sheet = wb.addWorksheet('BOM');
  sheet.addRow(HEADERS);
  sheet.getRow(1).font = { bold: true };

  for (const step of steps) {
    sheet.addRow([
      1, step.stepNumber, step.name, step.groupName ?? '', '', '',
      '', '', '', '', '',
      '', '', '', '',
      '', '', '', '',
      step.activityCode ?? '',
    ]);
    for (const sub of step.subcomponents) {
      const markup = subcomponentMarkupPct(sub, defaultMarkupPct);
      sheet.addRow([
        2, '', '', '', sub.number, sub.name,
        '', '', '', '', '',
        sub.laborHours, sub.laborCode, sub.laborRate, markup,
        subcomponentMaterialTotal(sub) + subcomponentLaborCost(sub),
        subcomponentSellPrice(sub, defaultMarkupPct),
      ]);
      for (const part of sub.parts) {
        sheet.addRow([
          3, '', '', '', '', '',
          part.partNumber, part.description, part.qty,
          part.priceSource === 'manual' && part.manualPriceOverride !== undefined ? part.manualPriceOverride : part.unitPrice,
          part.priceSource,
          '', '', '', '',
          lineExtendedPrice(part), '',
          part.priceSource === 'manual' ? '' : (part.priceUpdatedAt ?? ''),
          part.priceLocked ? 'Yes' : '',
        ]);
      }
    }
  }

  sheet.columns.forEach((col) => (col.width = 14));
}

/** Reads just the steps from a BOM/step workbook (ignores any Quote Info header). */
export async function readStepsFromBuffer(buffer: ArrayBuffer): Promise<EquipmentStep[]> {
  const quote = await readBomWorkbookFromBuffer(buffer);
  return quote.steps;
}

export async function readBomWorkbookFromBuffer(buffer: ArrayBuffer): Promise<Quote> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const quote = newQuote();

  // Restore quote header fields from the "Quote Info" sheet if present.
  const infoSheet = wb.getWorksheet('Quote Info');
  if (infoSheet) {
    infoSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const field = String(row.getCell(1).value ?? '').trim().toLowerCase();
      const value = row.getCell(2).value;
      if (field === 'quote #') quote.quoteNumber = String(value ?? '');
      else if (field === 'customer') quote.customer = String(value ?? '');
      else if (field === 'date') quote.date = normalizeDate(value) || quote.date;
      else if (field === 'default markup %') quote.defaultMarkupPct = numberOrZero(value) || quote.defaultMarkupPct;
      else if (field === 'template: company name') quote.template.companyName = String(value ?? '');
      else if (field === 'template: company subtitle') quote.template.companySubtitle = String(value ?? '');
      else if (field === 'template: header title') quote.template.headerTitle = String(value ?? '');
      else if (field === 'template: terms text') quote.template.termsText = String(value ?? '');
      else if (field === 'template: valid days') quote.template.validDays = numberOrZero(value) || quote.template.validDays;
      else if (field === 'template: show material column') quote.template.showMaterialColumn = isYes(value);
      else if (field === 'template: show labor column') quote.template.showLaborColumn = isYes(value);
      else if (field === 'template: show markup column') quote.template.showMarkupColumn = isYes(value);
      else if (field === 'template: accent color') quote.template.accentColorHex = String(value ?? '') || quote.template.accentColorHex;
    });
  }

  // The BOM sheet may not be the first worksheet (Quote Info precedes it).
  const sheet = wb.getWorksheet('BOM') ?? wb.worksheets[wb.worksheets.length - 1];

  let currentStep: EquipmentStep | null = null;
  let currentSub: Subcomponent | null = null;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const level = Number(row.getCell(1).value);

    if (level === 1) {
      const stepNumber = numberOrZero(row.getCell(2).value) || quote.steps.length + 1;
      const name = String(row.getCell(3).value ?? '').trim();
      if (!name) return;
      const groupRaw = String(row.getCell(4).value ?? '').trim();
      const activityCodeRaw = String(row.getCell(20).value ?? '').trim();
      const step: EquipmentStep = {
        ...newStep(name, stepNumber),
        groupName: groupRaw || undefined,
        activityCode: activityCodeRaw || undefined,
      };
      quote.steps.push(step);
      currentStep = step;
      currentSub = null;
    } else if (level === 2 && currentStep) {
      const subName = String(row.getCell(6).value ?? '').trim();
      if (!subName) return;
      const sub: Subcomponent = {
        ...newSubcomponent(subName, String(row.getCell(5).value ?? '').trim()),
        laborHours: numberOrZero(row.getCell(12).value),
        laborCode: String(row.getCell(13).value ?? 'ASSY'),
        laborRate: numberOrZero(row.getCell(14).value),
        markupOverride: numberOrZero(row.getCell(15).value),
      };
      currentStep.subcomponents.push(sub);
      currentSub = sub;
    } else if (level === 3 && currentSub) {
      const partNumber = String(row.getCell(7).value ?? '').trim();
      if (!partNumber) return;
      const priceSourceRaw = String(row.getCell(11).value ?? 'list').trim();
      const priceSource = priceSourceRaw === 'manual' ? 'manual' : 'list';
      const unitPrice = numberOrZero(row.getCell(10).value);
      const updatedRaw = normalizeDate(row.getCell(18).value);
      const part: PartLine = {
        ...newPartLine(),
        partNumber,
        description: String(row.getCell(8).value ?? ''),
        qty: numberOrZero(row.getCell(9).value) || 1,
        unitPrice,
        priceSource,
        manualPriceOverride: priceSource === 'manual' ? unitPrice : undefined,
        priceUpdatedAt: priceSource === 'manual' ? undefined : updatedRaw || undefined,
        priceLocked: isYes(row.getCell(19).value),
      };
      currentSub.parts.push(part);
    }
  });

  return quote;
}

function numberOrZero(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isYes(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'yes' || s === 'true' || s === '1';
}

/** Returns a YYYY-MM-DD string from a Date or string cell value, or '' if not parseable. */
function normalizeDate(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v ?? '').trim();
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}
