/**
 * Types for server-computed pricing. Only TYPES live here (safe to ship to the
 * client); the actual pricing/markup FORMULAS live server-side in server/calc.ts
 * and never reach the browser bundle.
 */

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

export interface ComputedSub {
  material: number;
  labor: number;
  cost: number;
  markupPct: number;
  sell: number;
}

export interface ComputedGroup {
  groupName: string | null;
  stepNames: string[];
  total: number;
}

/** Everything the UI/exports need to display, computed on the server. Keyed by entity id. */
export interface ComputedQuote {
  /** Extended price per part line, keyed by PartLine.id. */
  lines: Record<string, number>;
  /** Derived money per subcomponent, keyed by Subcomponent.id. */
  subs: Record<string, ComputedSub>;
  /** Sell price per step, keyed by EquipmentStep.id. */
  steps: Record<string, { sell: number }>;
  groups: ComputedGroup[];
  grandTotal: number;
  labor: LaborSummary;
}

/** An empty overlay, used before the first server response arrives. */
export const EMPTY_COMPUTED: ComputedQuote = {
  lines: {},
  subs: {},
  steps: {},
  groups: [],
  grandTotal: 0,
  labor: { perStep: [], totals: [], grandHours: 0, grandCost: 0 },
};

/** Currency formatting is presentation, not a secret — safe to keep client-side. */
export function formatCurrency(n: number): string {
  return (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
