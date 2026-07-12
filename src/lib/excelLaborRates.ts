import ExcelJS from 'exceljs';
import type { LaborRateEntry } from '../../shared/types';

const CODE_HEADERS = ['labor code', 'code'];
const DESCRIPTION_HEADERS = ['description', 'desc'];
const RATE_HEADERS = ['rate', 'labor rate', '$/hr', 'rate per hour'];

export async function readLaborRatesFromBuffer(buffer: ArrayBuffer): Promise<LaborRateEntry[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];

  const headerRow = sheet.getRow(1);
  let codeCol = -1;
  let descriptionCol = -1;
  let rateCol = -1;

  headerRow.eachCell((cell, colNumber) => {
    const text = String(cell.value ?? '').trim().toLowerCase();
    if (CODE_HEADERS.includes(text)) codeCol = colNumber;
    else if (DESCRIPTION_HEADERS.includes(text)) descriptionCol = colNumber;
    else if (RATE_HEADERS.includes(text)) rateCol = colNumber;
  });

  if (codeCol === -1 || rateCol === -1) {
    throw new Error('Labor rate file must have a "Labor Code" column and a "Rate" column.');
  }

  const entries: LaborRateEntry[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const code = String(row.getCell(codeCol).value ?? '').trim();
    if (!code) return;
    const rateRaw = row.getCell(rateCol).value;
    const rate = typeof rateRaw === 'number' ? rateRaw : Number(rateRaw);
    entries.push({
      code,
      description: descriptionCol !== -1 ? String(row.getCell(descriptionCol).value ?? '') : '',
      rate: Number.isFinite(rate) ? rate : 0,
    });
  });

  return entries;
}
