import ExcelJS from 'exceljs';
import {
  emptyAssemblerConfig,
  type AssemblerConfig,
  type AssemblerParameter,
  type ComponentRule,
  type ComponentType,
  type LaborRule,
} from '../../shared/assembler';
import { DEFAULT_SIZING_CONFIG, SCH10S_SIZES, type PipeSize } from '../../shared/pipeSizing';

/** Normalize an ExcelJS cell value that may be a plain value or a rich object
 * (formula result, shared formula, rich text, or hyperlink) into a primitive. */
function cellPrimitive(v: unknown): unknown {
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return o.result; // formula cell → its computed result
    if ('text' in o) return o.text; // hyperlink / rich text
    if ('richText' in o && Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((r) => r.text ?? '').join('');
    }
    return ''; // unknown object shape — treat as empty rather than "[object Object]"
  }
  return v;
}

function num(v: unknown): number {
  const p = cellPrimitive(v);
  const n = typeof p === 'number' ? p : Number(p);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return String(cellPrimitive(v) ?? '').trim();
}

export async function writeAssemblerConfigBuffer(config: AssemblerConfig): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();

  const params = wb.addWorksheet('Parameters');
  params.addRow(['Key', 'Label', 'Type', 'Choices (comma-sep)', 'Default']);
  params.getRow(1).font = { bold: true };
  for (const p of config.parameters) {
    params.addRow([p.key, p.label, p.type, (p.choices ?? []).join(', '), p.default ?? '']);
  }

  const comps = wb.addWorksheet('Components');
  comps.addRow(['Step', 'Step #', 'Subcomponent', 'Sub #', 'Component', 'Type', 'When Param', 'When Value', 'Match Var', 'Match Value', 'Qty', 'Part Number']);
  comps.getRow(1).font = { bold: true };
  for (const c of config.components) {
    comps.addRow([c.step, c.stepNumber ?? '', c.subcomponent, c.subNumber ?? '', c.component, c.type, c.whenParam ?? '', c.whenValue ?? '', c.matchVar ?? '', c.matchValue ?? '', c.qty, c.partNumber ?? '']);
  }

  const labor = wb.addWorksheet('Labor');
  labor.addRow(['Step', 'Subcomponent', 'Labor Hours', 'Labor Code']);
  labor.getRow(1).font = { bold: true };
  for (const l of config.labor) {
    labor.addRow([l.step, l.subcomponent, l.laborHours, l.laborCode]);
  }

  const sizes = wb.addWorksheet('Pipe Sizes');
  sizes.addRow(['Size Label', 'ID (in)']);
  sizes.getRow(1).font = { bold: true };
  for (const s of config.sizing.sizes) sizes.addRow([s.label, s.idInches]);

  const sizing = wb.addWorksheet('Sizing Settings');
  sizing.addRow(['Setting', 'Value']);
  sizing.getRow(1).font = { bold: true };
  sizing.addRow(['Roughness (mm)', config.sizing.roughnessMm]);
  sizing.addRow(['Allowable in wc per 100ft', config.sizing.allowableInWcPer100ft]);
  sizing.addRow(['Flow is standard (SCFM)', config.sizing.flowIsStandard ? 'Yes' : 'No']);

  [params, comps, labor, sizes, sizing].forEach((sh) => sh.columns.forEach((col) => (col.width = 18)));
  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export async function readAssemblerConfigBuffer(buffer: ArrayBuffer): Promise<AssemblerConfig> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new Error('Could not read that file as an .xlsx workbook. Re-export the rules and import without converting the format (avoid saving as .xls or .csv).');
  }
  const config = emptyAssemblerConfig();

  const hasKnownSheet = ['Parameters', 'Components', 'Labor', 'Pipe Sizes', 'Sizing Settings'].some(
    (n) => !!wb.getWorksheet(n),
  );
  if (!hasKnownSheet) {
    throw new Error('This workbook has none of the expected rules sheets (Parameters, Components, Labor, …). Make sure you are importing an exported rules file or the downloaded template.');
  }

  const params = wb.getWorksheet('Parameters');
  if (params) {
    params.eachRow((row, i) => {
      if (i === 1) return;
      const key = str(row.getCell(1).value);
      if (!key) return;
      const type = str(row.getCell(3).value).toLowerCase() === 'choice' ? 'choice' : 'number';
      const choices = str(row.getCell(4).value).split(',').map((s) => s.trim()).filter(Boolean);
      const p: AssemblerParameter = { key, label: str(row.getCell(2).value) || key, type };
      if (choices.length) p.choices = choices;
      const def = str(row.getCell(5).value);
      if (def) p.default = def;
      config.parameters.push(p);
    });
  }

  const comps = wb.getWorksheet('Components');
  if (comps) {
    comps.eachRow((row, i) => {
      if (i === 1) return;
      const step = str(row.getCell(1).value);
      const subcomponent = str(row.getCell(3).value);
      const component = str(row.getCell(5).value);
      if (!step || !subcomponent) return;
      const typeRaw = str(row.getCell(6).value).toLowerCase();
      const type: ComponentType = typeRaw === 'variant' ? 'variant' : typeRaw === 'placeholder' ? 'placeholder' : 'fixed';
      const rule: ComponentRule = {
        step,
        stepNumber: num(row.getCell(2).value) || undefined,
        subcomponent,
        subNumber: str(row.getCell(4).value) || undefined,
        component: component || subcomponent,
        type,
        whenParam: str(row.getCell(7).value) || undefined,
        whenValue: str(row.getCell(8).value) || undefined,
        matchVar: str(row.getCell(9).value) || undefined,
        matchValue: str(row.getCell(10).value) || undefined,
        qty: num(row.getCell(11).value) || 1,
        partNumber: str(row.getCell(12).value) || undefined,
      };
      config.components.push(rule);
    });
  }

  const labor = wb.getWorksheet('Labor');
  if (labor) {
    labor.eachRow((row, i) => {
      if (i === 1) return;
      const step = str(row.getCell(1).value);
      const subcomponent = str(row.getCell(2).value);
      if (!step || !subcomponent) return;
      const l: LaborRule = { step, subcomponent, laborHours: num(row.getCell(3).value), laborCode: str(row.getCell(4).value) || 'ASSY' };
      config.labor.push(l);
    });
  }

  const sizesSheet = wb.getWorksheet('Pipe Sizes');
  if (sizesSheet) {
    const sizes: PipeSize[] = [];
    sizesSheet.eachRow((row, i) => {
      if (i === 1) return;
      const label = str(row.getCell(1).value);
      const id = num(row.getCell(2).value);
      if (label && id > 0) sizes.push({ label, idInches: id });
    });
    if (sizes.length) config.sizing.sizes = sizes;
  }

  const sizing = wb.getWorksheet('Sizing Settings');
  if (sizing) {
    sizing.eachRow((row, i) => {
      if (i === 1) return;
      const setting = str(row.getCell(1).value).toLowerCase();
      const value = row.getCell(2).value;
      if (setting.includes('roughness')) config.sizing.roughnessMm = num(value) || config.sizing.roughnessMm;
      else if (setting.includes('allowable')) config.sizing.allowableInWcPer100ft = num(value) || config.sizing.allowableInWcPer100ft;
      else if (setting.includes('standard')) config.sizing.flowIsStandard = str(value).toLowerCase().startsWith('y');
    });
  }

  return config;
}

/** A starter template with a worked example (P&ID + placeholders). */
export async function writeAssemblerTemplateBuffer(): Promise<ArrayBuffer> {
  const example: AssemblerConfig = {
    sizing: { ...DEFAULT_SIZING_CONFIG, sizes: SCH10S_SIZES },
    parameters: [{ key: 'material', label: 'Material', type: 'choice', choices: ['304SS', '316SS'], default: '304SS' }],
    components: [
      { step: 'Vessel P&ID', stepNumber: 1, subcomponent: 'Inlet PID', subNumber: '101', component: 'Isolation Valve', type: 'variant', matchVar: 'pipeSize', matchValue: '2"', qty: 2, partNumber: 'VB-2000' },
      { step: 'Vessel P&ID', stepNumber: 1, subcomponent: 'Inlet PID', subNumber: '101', component: 'Isolation Valve', type: 'variant', matchVar: 'pipeSize', matchValue: '3"', qty: 2, partNumber: 'VB-3000' },
      { step: 'Vessel P&ID', stepNumber: 1, subcomponent: 'Inlet PID', subNumber: '101', component: 'PLC Controller', type: 'fixed', qty: 1, partNumber: 'PLC-100' },
      { step: 'System', stepNumber: 2, subcomponent: 'Compressor', subNumber: '201', component: 'Compressor (vendor lookup)', type: 'placeholder', qty: 1 },
      { step: 'System', stepNumber: 2, subcomponent: 'Heat Exchanger', subNumber: '202', component: 'Heat Exchanger (vendor lookup)', type: 'placeholder', qty: 1 },
    ],
    labor: [
      { step: 'Vessel P&ID', subcomponent: 'Inlet PID', laborHours: 4, laborCode: 'WELD' },
      { step: 'System', subcomponent: 'Compressor', laborHours: 2, laborCode: 'ASSY' },
    ],
  };
  return writeAssemblerConfigBuffer(example);
}
