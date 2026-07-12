import ExcelJS from 'exceljs';
import {
  DEFAULT_H2S_SYSTEM_CONFIG,
  type H2sSystemConfig,
  type MaterialStepTemplate,
  type LaborActivityTemplate,
  type LaborScaling,
  type Arrangement,
} from '../../shared/h2sSystem';

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
function parseArrangements(s: string): Arrangement[] | undefined {
  const parts = s
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .filter((x): x is Arrangement => x === 'single' || x === 'parallel' || x === 'leadlag');
  return parts.length ? parts : undefined;
}

export async function writeH2sConfigBuffer(config: H2sSystemConfig): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();

  const settings = wb.addWorksheet('Settings');
  settings.addRow(['Setting', 'Value']);
  settings.getRow(1).font = { bold: true };
  settings.addRow(['Grade', config.grade]);
  settings.addRow(['Media Cost ($/lb)', config.mediaCostPerLb]);
  settings.addRow(['Bag Weight (lbs)', config.bagWeightLbs]);
  settings.addRow(['Vessel Part Prefix', config.vesselPartPrefix]);
  settings.addRow(['Ref Diameter (ft)', config.refDiameterFt]);
  settings.addRow(['Ref Straight Side (ft)', config.refStraightSideFt]);
  settings.getColumn(1).width = 24;
  settings.getColumn(2).width = 18;

  const mat = wb.addWorksheet('Material Steps');
  mat.addRow(['Step #', 'Name', 'Kind', 'Arrangements (comma, blank=all)', 'Component', 'Size Key', 'Part #', 'Qty (number or =formula)']);
  mat.getRow(1).font = { bold: true };
  for (const m of config.materialSteps) {
    const parts = m.kind === 'parts' ? m.parts ?? [] : [];
    if (parts.length === 0) {
      mat.addRow([m.stepNumber, m.name, m.kind, (m.arrangements ?? []).join(', '), '', '', '', '']);
    } else {
      // One row per part; step columns repeat on the first row and stay blank on continuation rows.
      parts.forEach((p, idx) => {
        mat.addRow([
          idx === 0 ? m.stepNumber : '',
          idx === 0 ? m.name : '',
          idx === 0 ? m.kind : '',
          idx === 0 ? (m.arrangements ?? []).join(', ') : '',
          p.component,
          p.sizeKey ?? '',
          p.partNumber ?? '',
          typeof p.qty === 'string' && p.qty.startsWith('=') ? "'" + p.qty : p.qty, // leading ' keeps Excel from treating =formula as its own formula
        ]);
      });
    }
  }
  mat.getColumn(2).width = 28;
  mat.getColumn(4).width = 28;
  mat.getColumn(5).width = 40;
  mat.getColumn(6).width = 16;
  mat.getColumn(7).width = 20;
  mat.getColumn(8).width = 20;

  const labor = wb.addWorksheet('Labor Activities');
  labor.addRow(['Code', 'Name', 'Scaling (fixed/perVessel/perVesselSize)', 'Base Hours', 'Rate/hr', 'Arrangements']);
  labor.getRow(1).font = { bold: true };
  for (const a of config.laborActivities) {
    labor.addRow([a.code, a.name, a.scaling, a.baseHours, a.ratePerHour, (a.arrangements ?? []).join(', ')]);
  }
  labor.getColumn(2).width = 22;
  labor.getColumn(3).width = 34;

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export async function readH2sConfigBuffer(buffer: ArrayBuffer): Promise<H2sSystemConfig> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new Error('Could not read that file as an .xlsx workbook. Re-export and import without changing the format.');
  }

  const settingsSheet = wb.getWorksheet('Settings');
  const matSheet = wb.getWorksheet('Material Steps');
  const laborSheet = wb.getWorksheet('Labor Activities');
  if (!settingsSheet && !matSheet && !laborSheet) {
    throw new Error('This workbook has none of the expected H2S sheets (Settings, Material Steps, Labor Activities). Import an exported H2S rules file.');
  }

  const config: H2sSystemConfig = {
    ...DEFAULT_H2S_SYSTEM_CONFIG,
    materialSteps: [],
    laborActivities: [],
  };

  if (settingsSheet) {
    settingsSheet.eachRow((row, i) => {
      if (i === 1) return;
      const key = str(row.getCell(1).value).toLowerCase();
      const value = row.getCell(2).value;
      if (key.startsWith('grade')) config.grade = str(value) || config.grade;
      else if (key.includes('media cost')) config.mediaCostPerLb = num(value) || config.mediaCostPerLb;
      else if (key.includes('bag weight')) config.bagWeightLbs = num(value) || config.bagWeightLbs;
      else if (key.includes('prefix')) config.vesselPartPrefix = str(value) || config.vesselPartPrefix;
      else if (key.includes('ref diameter')) config.refDiameterFt = num(value) || config.refDiameterFt;
      else if (key.includes('ref straight')) config.refStraightSideFt = num(value) || config.refStraightSideFt;
    });
  }

  if (matSheet) {
    let current: MaterialStepTemplate | undefined;
    const pushPart = (row: ExcelJS.Row) => {
      const component = str(row.getCell(5).value);
      const sizeKey = str(row.getCell(6).value);
      const partNumber = str(row.getCell(7).value);
      const qtyRaw = str(row.getCell(8).value).replace(/^'/, ''); // strip Excel text-guard apostrophe
      if (!current || (!component && !partNumber)) return;
      // Keep '=formula' quantities as strings; otherwise coerce to a number (default 1).
      const qty: number | string = qtyRaw.startsWith('=')
        ? qtyRaw
        : Number.isFinite(Number(qtyRaw)) && qtyRaw !== ''
          ? Number(qtyRaw)
          : 1;
      (current.parts ??= []).push({
        component,
        partNumber: partNumber || undefined,
        qty,
        sizeKey: sizeKey || undefined,
      });
    };
    matSheet.eachRow((row, i) => {
      if (i === 1) return;
      const name = str(row.getCell(2).value);
      // Continuation row (blank Step #/Name): another part for the current step.
      if (!name) {
        pushPart(row);
        return;
      }
      const stepNumber = num(row.getCell(1).value);
      const kindRaw = str(row.getCell(3).value).toLowerCase();
      const kind = (['placeholder', 'vessel', 'media', 'parts'] as const).includes(kindRaw as never)
        ? (kindRaw as MaterialStepTemplate['kind'])
        : 'placeholder';
      current = {
        stepNumber,
        name,
        kind,
        arrangements: parseArrangements(str(row.getCell(4).value)),
      };
      config.materialSteps.push(current);
      pushPart(row); // this step's first part lives on the same row
    });
  }

  if (laborSheet) {
    laborSheet.eachRow((row, i) => {
      if (i === 1) return;
      const code = str(row.getCell(1).value);
      const name = str(row.getCell(2).value);
      if (!code && !name) return;
      const scalingRaw = str(row.getCell(3).value);
      const scaling: LaborScaling = scalingRaw === 'perVessel' || scalingRaw === 'perVesselSize' ? scalingRaw : 'fixed';
      const act: LaborActivityTemplate = {
        code,
        name: name || code,
        scaling,
        baseHours: num(row.getCell(4).value),
        ratePerHour: num(row.getCell(5).value),
        arrangements: parseArrangements(str(row.getCell(6).value)),
      };
      config.laborActivities.push(act);
    });
  }

  // Fall back to defaults if a section was empty, so a partial file never yields an empty template.
  if (config.materialSteps.length === 0) config.materialSteps = DEFAULT_H2S_SYSTEM_CONFIG.materialSteps;
  if (config.laborActivities.length === 0) config.laborActivities = DEFAULT_H2S_SYSTEM_CONFIG.laborActivities;

  return config;
}
