import ExcelJS from 'exceljs';

export interface PriceListEntry {
  partNumber: string;
  description: string;
  unitPrice: number;
  /** YYYY-MM-DD the price was last updated, per the parts list. */
  lastUpdated?: string;
}

const PART_NUMBER_HEADERS = ['part number', 'part #', 'partnumber', 'pn', 'part no'];
const PRICE_HEADERS = ['unit price', 'price', 'unitprice', 'cost'];

/** Returns a YYYY-MM-DD string from a Date or string cell value, or '' if not parseable. */
export function normalizeDate(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v ?? '').trim();
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

export async function writePriceListBuffer(entries: PriceListEntry[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Parts List');
  sheet.addRow(['Part Number', 'Description', 'Price', 'Last Updated']);
  sheet.getRow(1).font = { bold: true };
  for (const e of entries) {
    sheet.addRow([e.partNumber, e.description, e.unitPrice, e.lastUpdated ?? '']);
  }
  sheet.columns.forEach((col) => (col.width = 24));
  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/** Import template with example rows (part numbers match the BOM template so they price out). */
export async function writePriceListTemplateBuffer(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const info = wb.addWorksheet('Instructions');
  info.addRow(['CPQ — Price List Import Template']);
  info.getRow(1).font = { bold: true, size: 14 };
  [
    ['', ''],
    ['Part Number', 'Unique part identifier. Matched against BOM part numbers on import (required).'],
    ['Description', 'Part description (optional; used when a BOM line has none).'],
    ['Price', 'Unit price (required).'],
    ['Last Updated', 'Optional date the price was last confirmed (YYYY-MM-DD).'],
    ['', ''],
    ['Note', 'Import replaces/merges by Part Number. Fill the "Parts List" sheet and load with Import Price List.'],
  ].forEach((r) => info.addRow(r));
  info.getColumn(1).width = 20;
  info.getColumn(2).width = 90;

  const sheet = wb.addWorksheet('Parts List');
  sheet.addRow(['Part Number', 'Description', 'Price', 'Last Updated']);
  sheet.getRow(1).font = { bold: true };
  const ex: (string | number)[][] = [
    ['PSV-1146', '8" 94040 Spring Loaded PSV', 1850, '2026-07-01'],
    ['VB-1024', '2" Sharpe SS Threaded Ball Valve', 210, '2026-07-01'],
    ['HEAD-0096', '96" OD ASME F&D Head 304SS', 4200, '2026-07-01'],
    ['PIPE-1011', '6" Sch 10S Weld Pipe A312, per ft', 38, '2026-07-01'],
    ['MEDIA-1000', 'UniH2S Media, per bag', 3630, '2026-07-01'],
  ];
  ex.forEach((r) => sheet.addRow(r));
  sheet.columns.forEach((col) => (col.width = 26));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function readPriceListFromBuffer(buffer: ArrayBuffer): Promise<PriceListEntry[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  // Find the sheet whose header row has a Part Number + Price column (skips any cover/Instructions sheet).
  let sheet = wb.worksheets[0];
  let partNumberCol = -1;
  let descriptionCol = -1;
  let priceCol = -1;
  let updatedCol = -1;

  for (const ws of wb.worksheets) {
    let pn = -1, desc = -1, price = -1, upd = -1;
    ws.getRow(1).eachCell((cell, colNumber) => {
      const text = String(cell.value ?? '').trim().toLowerCase();
      if (PART_NUMBER_HEADERS.includes(text)) pn = colNumber;
      else if (text.startsWith('desc')) desc = colNumber;
      else if (text.includes('updat') || text === 'date') upd = colNumber;
      else if (PRICE_HEADERS.includes(text)) price = colNumber;
    });
    if (pn !== -1 && price !== -1) {
      sheet = ws;
      partNumberCol = pn; descriptionCol = desc; priceCol = price; updatedCol = upd;
      break;
    }
  }

  if (partNumberCol === -1 || priceCol === -1) {
    throw new Error('Price list must have a "Part Number" column and a "Unit Price" (or "Price") column.');
  }

  const entries: PriceListEntry[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const partNumber = String(row.getCell(partNumberCol).value ?? '').trim();
    if (!partNumber) return;
    const priceRaw = row.getCell(priceCol).value;
    const unitPrice = typeof priceRaw === 'number' ? priceRaw : Number(priceRaw);
    entries.push({
      partNumber,
      description: descriptionCol !== -1 ? String(row.getCell(descriptionCol).value ?? '') : '',
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
      lastUpdated: updatedCol !== -1 ? normalizeDate(row.getCell(updatedCol).value) || undefined : undefined,
    });
  });

  return entries;
}
