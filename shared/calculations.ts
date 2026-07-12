import type { PartLine, Subcomponent, EquipmentStep, Quote } from './types';

export function lineExtendedPrice(line: PartLine): number {
  return line.qty * effectiveUnitPrice(line);
}

export function effectiveUnitPrice(line: PartLine): number {
  return line.priceSource === 'manual' && line.manualPriceOverride !== undefined
    ? line.manualPriceOverride
    : line.unitPrice;
}

export function subcomponentMaterialTotal(sub: Subcomponent): number {
  return sub.parts.reduce((sum, p) => sum + lineExtendedPrice(p), 0);
}

export function subcomponentLaborCost(sub: Subcomponent): number {
  return sub.laborHours * sub.laborRate;
}

export function subcomponentMarkupPct(sub: Subcomponent, quoteDefaultMarkupPct: number): number {
  return sub.markupOverride !== undefined ? sub.markupOverride : quoteDefaultMarkupPct;
}

export function subcomponentCost(sub: Subcomponent): number {
  return subcomponentMaterialTotal(sub) + subcomponentLaborCost(sub);
}

export function subcomponentSellPrice(sub: Subcomponent, quoteDefaultMarkupPct: number): number {
  const markup = subcomponentMarkupPct(sub, quoteDefaultMarkupPct);
  return subcomponentCost(sub) * (1 + markup / 100);
}

export function stepSellPrice(step: EquipmentStep, quoteDefaultMarkupPct: number): number {
  return step.subcomponents.reduce((sum, sub) => sum + subcomponentSellPrice(sub, quoteDefaultMarkupPct), 0);
}

export function quoteGrandTotal(quote: Quote): number {
  return quote.steps.reduce((sum, step) => sum + stepSellPrice(step, quote.defaultMarkupPct), 0);
}

/** Groups steps by groupName (steps with no groupName are returned individually under a null key). */
export function groupStepTotals(quote: Quote): { groupName: string | null; steps: EquipmentStep[]; total: number }[] {
  const groups = new Map<string | null, EquipmentStep[]>();
  for (const step of quote.steps) {
    const key = step.groupName && step.groupName.trim() ? step.groupName.trim() : null;
    const list = groups.get(key) ?? [];
    list.push(step);
    groups.set(key, list);
  }
  return Array.from(groups.entries()).map(([groupName, steps]) => ({
    groupName,
    steps,
    total: steps.reduce((sum, step) => sum + stepSellPrice(step, quote.defaultMarkupPct), 0),
  }));
}

export interface LaborCodeTotal {
  code: string;
  hours: number;
  cost: number;
}

export interface StepLaborSummary {
  stepId: string;
  stepNumber: number;
  name: string;
  byCode: LaborCodeTotal[];
  totalHours: number;
  totalCost: number;
}

export interface LaborSummary {
  perStep: StepLaborSummary[];
  totals: LaborCodeTotal[];
  grandHours: number;
  grandCost: number;
}

function addToCodeMap(map: Map<string, LaborCodeTotal>, code: string, hours: number, cost: number) {
  const key = code || '(none)';
  const cur = map.get(key) ?? { code: key, hours: 0, cost: 0 };
  cur.hours += hours;
  cur.cost += cost;
  map.set(key, cur);
}

/** Aggregates labor hours and cost by code, per step and across the whole BOM. */
export function laborSummary(quote: Quote): LaborSummary {
  const grandMap = new Map<string, LaborCodeTotal>();

  const perStep: StepLaborSummary[] = quote.steps.map((step) => {
    const stepMap = new Map<string, LaborCodeTotal>();
    for (const sub of step.subcomponents) {
      const hours = sub.laborHours;
      const cost = subcomponentLaborCost(sub);
      if (hours === 0 && cost === 0) continue;
      addToCodeMap(stepMap, sub.laborCode, hours, cost);
      addToCodeMap(grandMap, sub.laborCode, hours, cost);
    }
    const byCode = Array.from(stepMap.values()).sort((a, b) => a.code.localeCompare(b.code));
    return {
      stepId: step.id,
      stepNumber: step.stepNumber,
      name: step.name,
      byCode,
      totalHours: byCode.reduce((s, c) => s + c.hours, 0),
      totalCost: byCode.reduce((s, c) => s + c.cost, 0),
    };
  });

  const totals = Array.from(grandMap.values()).sort((a, b) => a.code.localeCompare(b.code));
  return {
    perStep,
    totals,
    grandHours: totals.reduce((s, c) => s + c.hours, 0),
    grandCost: totals.reduce((s, c) => s + c.cost, 0),
  };
}

export function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
