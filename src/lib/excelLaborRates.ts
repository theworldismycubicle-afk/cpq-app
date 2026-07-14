import ExcelJS from 'exceljs';
import type { LaborRateEntry } from '../../shared/types';

const CODE_HEADERS = ['labor code', 'code'];
const ACTIVITY_HEADERS = ['activity', 'description', 'desc'];
const RATE_HEADERS = ['rate', 'labor rate', '$/hr', 'rate per hour'];

/** Import template with example labor codes/rates. */
export async function writeLaborRatesTemplateBuffer(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const info = wb.addWorksheet('Instructions');
  info.addRow(['CPQ — Labor Rates Import Template']);
  info.getRow(1).font = { bold: true, size: 14 };
  [
    ['', ''],
    ['Labor Code', 'Short activity code (e.g. 031, ASSY, WELD). Required; matched by code on import.'],
    ['Activity', 'What the code means, e.g. "H2S Vessel Fab" (optional).'],
    ['Rate', 'Hourly rate in $/hr (required).'],
    ['', ''],
    ['Note', 'Import merges by Labor Code. Fill the "Labor Rates" sheet and load with Import Labor Rates.'],
  ].forEach((r) => info.addRow(r));
  info.getColumn(1).width = 18;
  info.getColumn(2).width = 90;

  const sheet = wb.addWorksheet('Labor Rates');
  sheet.addRow(['Labor Code', 'Activity', 'Rate']);
  sheet.getRow(1).font = { bold: true };
  const ex: (string | number)[][] = [
    ['020', 'Engineering', 52.5],
    ['022', 'Drafting', 37],
    ['031', 'H2S Vessel Fab', 35],
    ['ASSY', 'Assembly', 65],
    ['WELD', 'Welding/Fabrication', 85],
    ['INSP', 'Inspection/QC', 70],
  ];
  ex.forEach((r) => sheet.addRow(r));
  sheet.columns.forEach((col) => (col.width = 24));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function readLaborRatesFromBuffer(buffer: ArrayBuffer): Promise<LaborRateEntry[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  // Find the sheet whose header row has a Code + Rate column (skips any cover/Instructions sheet).
  let sheet = wb.worksheets[0];
  let codeCol = -1;
  let descriptionCol = -1;
  let rateCol = -1;

  for (const ws of wb.worksheets) {
    let code = -1, act = -1, rate = -1;
    ws.getRow(1).eachCell((cell, colNumber) => {
      const text = String(cell.value ?? '').trim().toLowerCase();
      if (CODE_HEADERS.includes(text)) code = colNumber;
      else if (ACTIVITY_HEADERS.includes(text)) act = colNumber;
      else if (RATE_HEADERS.includes(text)) rate = colNumber;
    });
    if (code !== -1 && rate !== -1) {
      sheet = ws;
      codeCol = code; descriptionCol = act; rateCol = rate;
      break;
    }
  }

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
      activity: descriptionCol !== -1 ? String(row.getCell(descriptionCol).value ?? '') : '',
      rate: Number.isFinite(rate) ? rate : 0,
    });
  });

  return entries;
}
