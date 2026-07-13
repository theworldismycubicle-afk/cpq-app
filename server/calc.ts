/**
 * Server-side pricing engine. This is the ONLY place the markup/sell-price
 * formulas run; the browser receives computed numbers, never this logic.
 */
import type { Quote } from '../shared/types.ts';
import type { ComputedQuote } from '../shared/computed.ts';
import {
  lineExtendedPrice,
  subcomponentMaterialTotal,
  subcomponentLaborCost,
  subcomponentMarkupPct,
  subcomponentCost,
  subcomponentSellPrice,
  stepSellPrice,
  quoteGrandTotal,
  groupStepTotals,
  laborSummary,
} from '../shared/calculations.ts';

export function computeQuote(quote: Quote): ComputedQuote {
  const lines: ComputedQuote['lines'] = {};
  const subs: ComputedQuote['subs'] = {};
  const steps: ComputedQuote['steps'] = {};

  for (const step of quote.steps) {
    for (const sub of step.subcomponents) {
      for (const part of sub.parts) {
        lines[part.id] = lineExtendedPrice(part);
      }
      subs[sub.id] = {
        material: subcomponentMaterialTotal(sub),
        labor: subcomponentLaborCost(sub),
        cost: subcomponentCost(sub),
        markupPct: subcomponentMarkupPct(sub, quote.defaultMarkupPct),
        sell: subcomponentSellPrice(sub, quote.defaultMarkupPct),
      };
    }
    steps[step.id] = { sell: stepSellPrice(step, quote.defaultMarkupPct) };
  }

  const groups = groupStepTotals(quote).map((g) => ({
    groupName: g.groupName,
    stepNames: g.steps.map((s) => s.name),
    total: g.total,
  }));

  return {
    lines,
    subs,
    steps,
    groups,
    grandTotal: quoteGrandTotal(quote),
    labor: laborSummary(quote),
  };
}
