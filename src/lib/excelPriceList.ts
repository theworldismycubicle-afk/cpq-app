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

export async function readPriceListFromBuffer(buffer: ArrayBuffer): Promise<PriceListEntry[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];

  const headerRow = sheet.getRow(1);
  let partNumberCol = -1;
  let descriptionCol = -1;
  let priceCol = -1;
  let updatedCol = -1;

  headerRow.eachCell((cell, colNumber) => {
    const text = String(cell.value ?? '').trim().toLowerCase();
    if (PART_NUMBER_HEADERS.includes(text)) partNumberCol = colNumber;
    // tolerant match for "Description"/"Descritpion" and similar typos
    else if (text.startsWith('desc')) descriptionCol = colNumber;
    else if (text.includes('updat') || text === 'date') updatedCol = colNumber;
    else if (PRICE_HEADERS.includes(text)) priceCol = colNumber;
  });

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
