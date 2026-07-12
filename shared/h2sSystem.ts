/**
 * H2S vessel system BOM generator.
 * Produces the standard top-level step structure (material steps + labor-activity steps)
 * from an editable template, the chosen vessel size, and the arrangement.
 *
 * Numbers here are editable placeholders until real labor/cost data is provided.
 */
import {
  newStep,
  newSubcomponent,
  newPartLine,
  type EquipmentStep,
  type PartLine,
} from './types';
import type { VesselCandidate } from './h2sVesselSizing';

export type Arrangement = 'single' | 'parallel' | 'leadlag';

/** How many physical vessels an arrangement uses. */
export function vesselCount(a: Arrangement): number {
  return a === 'single' ? 1 : 2;
}

// ---- Material step template ----
export interface H2sPartTemplate {
  component: string;
  partNumber?: string;
  /**
   * Quantity: a plain number, or a formula string starting with '=' using the
   * variables D (vessel diameter ft), SS (straight side ft), N (vessel count),
   * and PI. E.g. '=PI*D*3' (walkway grating), '=2*SS+10' (pipe run).
   */
  qty: number | string;
  /**
   * Optional match condition(s), so one component can list per-size variants.
   * Format 'key=value', multiple joined by ';' (all must match). Keys: line
   * (resolved pipe/line size, e.g. '4"'), grade, arrangement. Blank = always.
   * E.g. 'line=6"' or 'line=4";grade=316SS'.
   */
  sizeKey?: string;
}
export interface MaterialStepTemplate {
  stepNumber: number;
  name: string;
  /** Which arrangements include this step. Empty = all. */
  arrangements?: Arrangement[];
  /** Special generation handling. */
  kind: 'placeholder' | 'vessel' | 'media' | 'parts';
  /** For 'parts' kind: part lines, optionally size-keyed with formula quantities. */
  parts?: H2sPartTemplate[];
}

/** Minimal safe arithmetic evaluator: + - * / parentheses, numbers, named vars. No JS eval. */
function evalExpr(expr: string, vars: Record<string, number>): number {
  let i = 0;
  const s = expr;
  const skip = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const parseExpr = (): number => {
    let v = parseTerm();
    for (;;) {
      skip();
      if (s[i] === '+') { i++; v += parseTerm(); }
      else if (s[i] === '-') { i++; v -= parseTerm(); }
      else break;
    }
    return v;
  };
  const parseTerm = (): number => {
    let v = parseFactor();
    for (;;) {
      skip();
      if (s[i] === '*') { i++; v *= parseFactor(); }
      else if (s[i] === '/') { i++; v /= parseFactor(); }
      else break;
    }
    return v;
  };
  const parseFactor = (): number => {
    skip();
    if (s[i] === '+') { i++; return parseFactor(); }
    if (s[i] === '-') { i++; return -parseFactor(); }
    if (s[i] === '(') { i++; const v = parseExpr(); skip(); if (s[i] === ')') i++; return v; }
    const rest = s.slice(i);
    const num = /^[0-9]*\.?[0-9]+/.exec(rest);
    if (num) { i += num[0].length; return Number(num[0]); }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (id) { i += id[0].length; return vars[id[0]] ?? 0; }
    i++; // skip unknown char
    return 0;
  };
  return parseExpr();
}

/** Resolve a qty that may be a number or an '=' formula. Rounds to 2 decimals, floors at 0. */
export function resolveQty(qty: number | string, vars: Record<string, number>): number {
  if (typeof qty === 'number') return qty;
  const t = qty.trim();
  if (!t.startsWith('=')) {
    const n = Number(t);
    return Number.isFinite(n) ? n : 1;
  }
  const v = evalExpr(t.slice(1), { ...vars, PI: Math.PI });
  return Number.isFinite(v) ? Math.max(0, Math.round(v * 100) / 100) : 0;
}

/** Does a part's sizeKey match the resolved string context? Blank matches everything. */
export function partMatches(sizeKey: string | undefined, ctx: Record<string, string>): boolean {
  if (!sizeKey || !sizeKey.trim()) return true;
  return sizeKey
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)
    .every((cond) => {
      const eq = cond.indexOf('=');
      if (eq < 0) return true;
      const k = cond.slice(0, eq).trim().toLowerCase();
      const v = cond.slice(eq + 1).trim().toLowerCase();
      return (ctx[k] ?? '').toLowerCase() === v;
    });
}

// ---- Labor activity template ----
export type LaborScaling = 'fixed' | 'perVessel' | 'perVesselSize';
export interface LaborActivityTemplate {
  code: string; // ERP activity code, e.g. '031'
  name: string;
  scaling: LaborScaling;
  baseHours: number; // fixed: per system; perVessel/perVesselSize: per vessel at reference size
  ratePerHour: number; // editable placeholder rate
  arrangements?: Arrangement[];
}

export interface H2sSystemConfig {
  materialSteps: MaterialStepTemplate[];
  laborActivities: LaborActivityTemplate[];
  grade: string; // default vessel grade, e.g. '304SS'
  mediaCostPerLb: number; // $/lb
  bagWeightLbs: number; // 2200
  vesselPartPrefix: string; // for optional vessel part-number lookup
  /** Reference vessel size for labor scaling (D×SS). Hours scale by (D×SS)/(refD×refSS). */
  refDiameterFt: number;
  refStraightSideFt: number;
}

export const DEFAULT_H2S_SYSTEM_CONFIG: H2sSystemConfig = {
  grade: '304SS',
  mediaCostPerLb: 1.65,
  bagWeightLbs: 2200,
  vesselPartPrefix: 'H2S-VESSEL',
  refDiameterFt: 8,
  refStraightSideFt: 16,
  // NOTE: The `parts` lists below are EXAMPLE part numbers so every step imports
  // with material lines and you can see the format. Replace the component names,
  // partNumber values, and qty with your real ERP parts. A part number that isn't
  // in the price list imports with requiresInput=true (flagged for pricing).
  materialSteps: [
    {
      stepNumber: 100,
      name: 'H2S Inlet P&ID',
      kind: 'parts',
      parts: [
        // Size-keyed variant: only the row matching the resolved line size emits.
        { component: 'Inlet Isolation Valve, 4" 150# SS Butterfly', partNumber: 'VLV-BFY-04-150-SS', qty: 1, sizeKey: 'line=4"' },
        { component: 'Inlet Isolation Valve, 6" 150# SS Butterfly', partNumber: 'VLV-BFY-06-150-SS', qty: 1, sizeKey: 'line=6"' },
        { component: 'Inlet Isolation Valve, 8" 150# SS Butterfly', partNumber: 'VLV-BFY-08-150-SS', qty: 1, sizeKey: 'line=8"' },
        // Size-invariant: no sizeKey, always emits.
        { component: 'Inlet Pressure Gauge, 0-30 psi, SS', partNumber: 'GAU-PR-030-SS', qty: 1 },
        { component: 'Inlet Sample Port, 1/2" NPT SS', partNumber: 'PRT-SMP-050-SS', qty: 1 },
      ],
    },
    {
      stepNumber: 102,
      name: 'H2S Inlet Pipe',
      kind: 'parts',
      parts: [
        // Size-keyed part number + formula qty (run ≈ 2×straight side + 8 ft of header).
        { component: 'Pipe, 4" Sch 10S 304SS, per ft', partNumber: 'PIPE-04-10S-304', qty: '=2*SS+8', sizeKey: 'line=4"' },
        { component: 'Pipe, 6" Sch 10S 304SS, per ft', partNumber: 'PIPE-06-10S-304', qty: '=2*SS+8', sizeKey: 'line=6"' },
        { component: 'Elbow, 90° LR Sch 10S 304SS', partNumber: 'FIT-ELB90-04-304', qty: 4, sizeKey: 'line=4"' },
        { component: 'Elbow, 90° LR Sch 10S 304SS', partNumber: 'FIT-ELB90-06-304', qty: 4, sizeKey: 'line=6"' },
        { component: 'Flange, 150# SO 304SS', partNumber: 'FLG-SO-04-150-304', qty: 4, sizeKey: 'line=4"' },
        { component: 'Flange, 150# SO 304SS', partNumber: 'FLG-SO-06-150-304', qty: 4, sizeKey: 'line=6"' },
      ],
    },
    {
      stepNumber: 112,
      name: 'H2S P&ID',
      kind: 'parts',
      parts: [
        { component: 'Differential Pressure Transmitter', partNumber: 'INS-DPT-100', qty: 1 },
        { component: 'Vessel Isolation Valve, 4" 150# SS', partNumber: 'VLV-BFY-04-150-SS', qty: 2 },
        { component: 'Pressure Relief Valve, 3" SS', partNumber: 'VLV-PRV-03-SS', qty: 1 },
      ],
    },
    { stepNumber: 114, name: 'H2S Vessel #1', kind: 'vessel' },
    { stepNumber: 116, name: 'H2S Vessel #2', kind: 'vessel', arrangements: ['parallel', 'leadlag'] },
    {
      stepNumber: 118,
      name: 'H2S Vessel Drain P&ID',
      kind: 'parts',
      parts: [
        { component: 'Drain Valve, 2" 150# SS Ball', partNumber: 'VLV-BALL-02-150-SS', qty: 1 },
        { component: 'Drain Sight Glass, 2" SS', partNumber: 'INS-SG-02-SS', qty: 1 },
      ],
    },
    {
      stepNumber: 120,
      name: 'H2S Vessel Drain Pipe',
      kind: 'parts',
      parts: [
        { component: 'Pipe, 2" Sch 10S 304SS, per ft', partNumber: 'PIPE-02-10S-304', qty: 15 },
        { component: 'Elbow, 2" 90° LR Sch 10S 304SS', partNumber: 'FIT-ELB90-02-304', qty: 3 },
      ],
    },
    {
      stepNumber: 122,
      name: 'H2S Platform',
      kind: 'parts',
      parts: [
        // Formula quantities scale with vessel geometry — one row covers every size.
        { component: 'Grating, Galv Bar 1"x3/16", per sq ft', partNumber: 'PLT-GRT-GALV', qty: '=PI*D*3' }, // 3 ft walkway ring
        { component: 'Handrail, Galv 1-1/2" Sch 40, per ft', partNumber: 'PLT-RAIL-GALV', qty: '=PI*D' },
        { component: 'Ladder w/ Cage, Galv, per ft', partNumber: 'PLT-LADR-CAGE', qty: '=SS+4' },
      ],
    },
    {
      stepNumber: 124,
      name: 'H2S Pipe (Single Vessel)',
      kind: 'parts',
      arrangements: ['single'],
      parts: [
        { component: 'Pipe, 4" Sch 10S 304SS, per ft', partNumber: 'PIPE-04-10S-304', qty: 30 },
        { component: 'Tee, 4" Sch 10S 304SS', partNumber: 'FIT-TEE-04-304', qty: 2 },
      ],
    },
    {
      stepNumber: 126,
      name: 'H2S Pipe (Parallel)',
      kind: 'parts',
      arrangements: ['parallel'],
      parts: [
        { component: 'Pipe, 4" Sch 10S 304SS, per ft', partNumber: 'PIPE-04-10S-304', qty: 50 },
        { component: 'Tee, 4" Sch 10S 304SS', partNumber: 'FIT-TEE-04-304', qty: 4 },
        { component: 'Balancing Valve, 4" 150# SS', partNumber: 'VLV-BAL-04-150-SS', qty: 2 },
      ],
    },
    {
      stepNumber: 128,
      name: 'H2S Pipe (Lead/Lag)',
      kind: 'parts',
      arrangements: ['leadlag'],
      parts: [
        { component: 'Pipe, 4" Sch 10S 304SS, per ft', partNumber: 'PIPE-04-10S-304', qty: 55 },
        { component: 'Tee, 4" Sch 10S 304SS', partNumber: 'FIT-TEE-04-304', qty: 4 },
        { component: 'Switching Valve, 4" 150# SS 3-way', partNumber: 'VLV-3W-04-150-SS', qty: 2 },
      ],
    },
    { stepNumber: 130, name: 'H2S Media', kind: 'media' },
    {
      stepNumber: 132,
      name: 'H2S Signage',
      kind: 'parts',
      parts: [
        { component: 'H2S Hazard Placard, 10"x14" Alum', partNumber: 'SGN-H2S-HAZ', qty: 2 },
        { component: 'Vessel ID Nameplate, SS Engraved', partNumber: 'SGN-NAMEPLATE-SS', qty: 1 },
      ],
    },
  ],
  laborActivities: [
    { code: '020', name: 'Engineering', scaling: 'fixed', baseHours: 40, ratePerHour: 52.5 },
    { code: '021', name: 'Project Management', scaling: 'fixed', baseHours: 40, ratePerHour: 52.5 },
    { code: '022', name: 'Drafting', scaling: 'fixed', baseHours: 80, ratePerHour: 37 },
    { code: '025', name: 'Pipe Fab - All', scaling: 'perVessel', baseHours: 20, ratePerHour: 35 },
    { code: '029', name: 'System Assembly', scaling: 'perVessel', baseHours: 20, ratePerHour: 35 },
    { code: '030', name: 'Skid Base Fab', scaling: 'perVessel', baseHours: 30, ratePerHour: 35 },
    { code: '031', name: 'H2S Vessel Fab', scaling: 'perVesselSize', baseHours: 250, ratePerHour: 35 },
    { code: '032', name: 'H2S Assembly', scaling: 'perVessel', baseHours: 10, ratePerHour: 35 },
    { code: '036', name: 'Work Platform Fab', scaling: 'perVessel', baseHours: 40, ratePerHour: 35 },
    { code: '039', name: 'Shipping', scaling: 'fixed', baseHours: 45, ratePerHour: 35 },
    { code: '040', name: 'Inspection', scaling: 'perVesselSize', baseHours: 90, ratePerHour: 50 },
    { code: '041', name: 'Testing', scaling: 'perVessel', baseHours: 20, ratePerHour: 50 },
  ],
};

export interface H2sSystemInput {
  arrangement: Arrangement;
  grade: string;
  vessel: VesselCandidate;
  mediaBagsPerVessel: number;
  /** Resolved pipe/line size label (e.g. '4"') used to match part sizeKeys. */
  lineSize?: string;
}

export interface PriceInfo {
  unitPrice: number;
  description?: string;
  lastUpdated?: string;
}

function fmtSize(v: VesselCandidate): string {
  return `${v.diameterFt}'0"x${v.straightSideFt}'`;
}

export function generateH2sSystem(
  input: H2sSystemInput,
  config: H2sSystemConfig,
  priceLookup: (pn: string) => PriceInfo | undefined,
): EquipmentStep[] {
  const count = vesselCount(input.arrangement);
  const sizeFactor =
    (input.vessel.diameterFt * input.vessel.straightSideFt) / (config.refDiameterFt * config.refStraightSideFt);
  const steps: EquipmentStep[] = [];

  const includedFor = (arrangements?: Arrangement[]) => !arrangements || arrangements.includes(input.arrangement);

  // Context for size-keyed part selection and formula quantities.
  const partCtx: Record<string, string> = {
    line: input.lineSize ?? '',
    grade: input.grade,
    arrangement: input.arrangement,
  };
  const qtyVars: Record<string, number> = {
    D: input.vessel.diameterFt,
    SS: input.vessel.straightSideFt,
    N: count,
  };

  // Material steps
  let vesselIndex = 0;
  for (const m of config.materialSteps) {
    if (!includedFor(m.arrangements)) continue;
    const step: EquipmentStep = { ...newStep(m.name, m.stepNumber), activityCode: 'DFLT' };
    const sub = { ...newSubcomponent(m.name, String(m.stepNumber)) };
    sub.laborHours = 0;

    if (m.kind === 'vessel') {
      vesselIndex++;
      const part: PartLine = { ...newPartLine() };
      part.description = `${m.name} ${fmtSize(input.vessel)} ${input.grade}`;
      part.qty = 1;
      const pn = `${config.vesselPartPrefix}-${input.vessel.diameterFt}x${input.vessel.straightSideFt}-${input.grade}`;
      part.partNumber = pn;
      const info = priceLookup(pn);
      if (info) {
        part.unitPrice = info.unitPrice;
        part.priceSource = 'list';
        part.priceUpdatedAt = info.lastUpdated;
      } else {
        part.unitPrice = 0;
        part.priceSource = 'manual';
        part.manualPriceOverride = 0;
        part.requiresInput = true; // vessel priced manually until a size-keyed price exists
      }
      sub.parts.push(part);
    } else if (m.kind === 'media') {
      const bags = input.mediaBagsPerVessel * count;
      const part: PartLine = { ...newPartLine() };
      part.partNumber = 'H2S-MEDIA';
      part.description = `H2S Media (Ferrosorp), ${config.bagWeightLbs} lb sacks`;
      part.qty = bags;
      part.unitPrice = config.bagWeightLbs * config.mediaCostPerLb; // per-bag price
      part.priceSource = 'list';
      sub.parts.push(part);
    } else if (m.kind === 'parts' && m.parts) {
      const matched = m.parts.filter((p) => partMatches(p.sizeKey, partCtx));
      if (matched.length === 0) {
        // No size variant matched the resolved line size — emit one line to fill in.
        const part: PartLine = { ...newPartLine() };
        part.description = `${m.name} (no part for line size ${input.lineSize ?? '?'})`;
        part.qty = 1;
        part.unitPrice = 0;
        part.priceSource = 'manual';
        part.manualPriceOverride = 0;
        part.requiresInput = true;
        sub.parts.push(part);
      }
      for (const p of matched) {
        const part: PartLine = { ...newPartLine() };
        part.partNumber = p.partNumber ?? '';
        part.qty = resolveQty(p.qty, qtyVars);
        const info = p.partNumber ? priceLookup(p.partNumber) : undefined;
        part.description = info?.description || p.component;
        if (info) {
          part.unitPrice = info.unitPrice;
          part.priceSource = 'list';
          part.priceUpdatedAt = info.lastUpdated;
        } else {
          part.priceSource = 'list';
          part.requiresInput = !!p.partNumber;
        }
        sub.parts.push(part);
      }
    } else {
      // placeholder material grouping — a single line for the estimator to fill
      const part: PartLine = { ...newPartLine() };
      part.description = m.name;
      part.qty = 1;
      part.unitPrice = 0;
      part.priceSource = 'manual';
      part.manualPriceOverride = 0;
      part.requiresInput = true;
      sub.parts.push(part);
    }

    step.subcomponents.push(sub);
    steps.push(step);
  }

  // Labor-activity steps
  for (const a of config.laborActivities) {
    if (!includedFor(a.arrangements)) continue;
    let hours = a.baseHours;
    if (a.scaling === 'perVessel') hours = a.baseHours * count;
    else if (a.scaling === 'perVesselSize') hours = a.baseHours * count * sizeFactor;
    hours = Math.round(hours);
    if (hours <= 0) continue;

    const step: EquipmentStep = { ...newStep(a.name, Number(a.code)), activityCode: a.code };
    const sub = { ...newSubcomponent(a.name, a.code) };
    sub.laborHours = hours;
    sub.laborCode = a.code;
    sub.laborRate = a.ratePerHour;
    step.subcomponents.push(sub);
    steps.push(step);
  }

  return steps;
}
