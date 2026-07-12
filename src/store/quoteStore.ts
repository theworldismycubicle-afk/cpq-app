import { create } from 'zustand';
import {
  newQuote,
  newStep,
  newSubcomponent,
  newPartLine,
  type Quote,
  type PartLine,
  type QuoteTemplate,
  type EquipmentStep,
  type Subcomponent,
} from '../../shared/types';

interface QuoteState {
  quote: Quote;
  setQuote: (quote: Quote) => void;

  updateHeader: (patch: Partial<Pick<Quote, 'quoteNumber' | 'customer' | 'date' | 'defaultMarkupPct'>>) => void;
  updateTemplate: (patch: Partial<QuoteTemplate>) => void;

  addStep: () => void;
  removeStep: (stepId: string) => void;
  updateStep: (stepId: string, patch: Partial<Pick<EquipmentStep, 'stepNumber' | 'name' | 'groupName'>>) => void;
  /** Appends imported steps, renumbering them to continue after the current highest step number. */
  appendSteps: (steps: EquipmentStep[]) => void;

  addSubcomponent: (stepId: string) => void;
  removeSubcomponent: (stepId: string, subId: string) => void;
  updateSubcomponent: (stepId: string, subId: string, patch: Partial<Subcomponent>) => void;

  addPartLine: (stepId: string, subId: string) => void;
  removePartLine: (stepId: string, subId: string, partId: string) => void;
  updatePartLine: (stepId: string, subId: string, partId: string, patch: Partial<PartLine>) => void;

  applyPriceList: (entries: { partNumber: string; unitPrice: number; lastUpdated?: string }[]) => { updated: number; unmatched: number; pendingManual: number };

  /**
   * Forces every unlocked part to the current parts-list price (overrides manual prices too).
   * Locked parts and parts not found in the list are left untouched.
   */
  repriceAllToList: (entries: { partNumber: string; unitPrice: number; lastUpdated?: string }[]) => { repriced: number; locked: number; notFound: number };

  /**
   * Updates subcomponent labor rates for codes whose rate changed, but only on subcomponents whose
   * current rate still matches the old master rate for that code (i.e. not manually edited).
   */
  applyLaborRateUpdates: (
    oldRates: { code: string; rate: number }[],
    newRates: { code: string; rate: number }[],
  ) => { updated: number; manuallyOverridden: number };
  acceptPendingListPrice: (stepId: string, subId: string, partId: string) => void;
}

function mapSteps(steps: EquipmentStep[], stepId: string, fn: (step: EquipmentStep) => EquipmentStep): EquipmentStep[] {
  return steps.map((s) => (s.id === stepId ? fn(s) : s));
}

function mapSub(step: EquipmentStep, subId: string, fn: (sub: Subcomponent) => Subcomponent): EquipmentStep {
  return { ...step, subcomponents: step.subcomponents.map((sub) => (sub.id === subId ? fn(sub) : sub)) };
}

export const useQuoteStore = create<QuoteState>((set) => ({
  quote: newQuote(),

  setQuote: (quote) => set({ quote }),

  updateHeader: (patch) => set((s) => ({ quote: { ...s.quote, ...patch } })),

  updateTemplate: (patch) =>
    set((s) => ({ quote: { ...s.quote, template: { ...s.quote.template, ...patch } } })),

  addStep: () =>
    set((s) => {
      const nextNumber = s.quote.steps.length > 0 ? Math.max(...s.quote.steps.map((st) => st.stepNumber)) + 1 : 1;
      return { quote: { ...s.quote, steps: [...s.quote.steps, newStep(undefined, nextNumber)] } };
    }),

  removeStep: (stepId) =>
    set((s) => ({ quote: { ...s.quote, steps: s.quote.steps.filter((st) => st.id !== stepId) } })),

  updateStep: (stepId, patch) =>
    set((s) => ({
      quote: { ...s.quote, steps: mapSteps(s.quote.steps, stepId, (st) => ({ ...st, ...patch })) },
    })),

  appendSteps: (incoming) =>
    set((s) => {
      let next = s.quote.steps.length > 0 ? Math.max(...s.quote.steps.map((st) => st.stepNumber)) + 1 : 1;
      const renumbered = incoming.map((st) => ({ ...st, stepNumber: next++ }));
      return { quote: { ...s.quote, steps: [...s.quote.steps, ...renumbered] } };
    }),

  addSubcomponent: (stepId) =>
    set((s) => ({
      quote: {
        ...s.quote,
        steps: mapSteps(s.quote.steps, stepId, (st) => ({
          ...st,
          subcomponents: [...st.subcomponents, newSubcomponent()],
        })),
      },
    })),

  removeSubcomponent: (stepId, subId) =>
    set((s) => ({
      quote: {
        ...s.quote,
        steps: mapSteps(s.quote.steps, stepId, (st) => ({
          ...st,
          subcomponents: st.subcomponents.filter((sub) => sub.id !== subId),
        })),
      },
    })),

  updateSubcomponent: (stepId, subId, patch) =>
    set((s) => ({
      quote: {
        ...s.quote,
        steps: mapSteps(s.quote.steps, stepId, (st) => mapSub(st, subId, (sub) => ({ ...sub, ...patch }))),
      },
    })),

  addPartLine: (stepId, subId) =>
    set((s) => ({
      quote: {
        ...s.quote,
        steps: mapSteps(s.quote.steps, stepId, (st) =>
          mapSub(st, subId, (sub) => ({ ...sub, parts: [...sub.parts, newPartLine()] })),
        ),
      },
    })),

  removePartLine: (stepId, subId, partId) =>
    set((s) => ({
      quote: {
        ...s.quote,
        steps: mapSteps(s.quote.steps, stepId, (st) =>
          mapSub(st, subId, (sub) => ({ ...sub, parts: sub.parts.filter((p) => p.id !== partId) })),
        ),
      },
    })),

  updatePartLine: (stepId, subId, partId, patch) =>
    set((s) => ({
      quote: {
        ...s.quote,
        steps: mapSteps(s.quote.steps, stepId, (st) =>
          mapSub(st, subId, (sub) => ({
            ...sub,
            parts: sub.parts.map((p) => (p.id === partId ? { ...p, ...patch } : p)),
          })),
        ),
      },
    })),

  applyPriceList: (entries) => {
    const entryMap = new Map(entries.map((e) => [e.partNumber.trim().toLowerCase(), e]));
    let updated = 0;
    let unmatched = 0;
    let pendingManual = 0;

    set((s) => {
      const matchedPartNumbers = new Set<string>();
      const steps = s.quote.steps.map((step) => ({
        ...step,
        subcomponents: step.subcomponents.map((sub) => ({
          ...sub,
          parts: sub.parts.map((p) => {
            const key = p.partNumber.trim().toLowerCase();
            const match = entryMap.get(key);
            if (!key || !match) return p;
            matchedPartNumbers.add(key);
            const newPrice = match.unitPrice;
            if (p.priceSource === 'list') {
              updated++;
              return { ...p, unitPrice: newPrice, priceUpdatedAt: match.lastUpdated, pendingListPrice: undefined };
            } else {
              if (newPrice !== p.unitPrice) {
                pendingManual++;
                return { ...p, pendingListPrice: newPrice };
              }
              return p;
            }
          }),
        })),
      }));

      for (const key of entryMap.keys()) {
        if (!matchedPartNumbers.has(key)) unmatched++;
      }

      return { quote: { ...s.quote, steps, priceListVersion: new Date().toISOString() } };
    });

    return { updated, unmatched, pendingManual };
  },

  repriceAllToList: (entries) => {
    const entryMap = new Map(entries.map((e) => [e.partNumber.trim().toLowerCase(), e]));
    let repriced = 0;
    let locked = 0;
    let notFound = 0;

    set((s) => {
      const steps = s.quote.steps.map((step) => ({
        ...step,
        subcomponents: step.subcomponents.map((sub) => ({
          ...sub,
          parts: sub.parts.map((p): PartLine => {
            const key = p.partNumber.trim().toLowerCase();
            if (!key) return p;
            if (p.priceLocked) {
              locked++;
              return p;
            }
            const match = entryMap.get(key);
            if (!match) {
              notFound++;
              return p;
            }
            repriced++;
            return {
              ...p,
              unitPrice: match.unitPrice,
              priceSource: 'list',
              manualPriceOverride: undefined,
              pendingListPrice: undefined,
              priceUpdatedAt: match.lastUpdated,
            };
          }),
        })),
      }));
      return { quote: { ...s.quote, steps } };
    });

    return { repriced, locked, notFound };
  },

  applyLaborRateUpdates: (oldRates, newRates) => {
    const oldMap = new Map(oldRates.map((r) => [r.code, r.rate]));
    const newMap = new Map(newRates.map((r) => [r.code, r.rate]));
    let updated = 0;
    let manuallyOverridden = 0;

    set((s) => ({
      quote: {
        ...s.quote,
        steps: s.quote.steps.map((step) => ({
          ...step,
          subcomponents: step.subcomponents.map((sub) => {
            if (!newMap.has(sub.laborCode)) return sub;
            const newRate = newMap.get(sub.laborCode)!;
            const oldRate = oldMap.get(sub.laborCode);
            if (newRate === sub.laborRate) return sub;
            if (oldRate === undefined || sub.laborRate === oldRate) {
              updated++;
              return { ...sub, laborRate: newRate };
            }
            manuallyOverridden++;
            return sub;
          }),
        })),
      },
    }));

    return { updated, manuallyOverridden };
  },

  acceptPendingListPrice: (stepId, subId, partId) =>
    set((s) => ({
      quote: {
        ...s.quote,
        steps: mapSteps(s.quote.steps, stepId, (st) =>
          mapSub(st, subId, (sub) => ({
            ...sub,
            parts: sub.parts.map((p) =>
              p.id === partId && p.pendingListPrice !== undefined
                ? { ...p, priceSource: 'list', unitPrice: p.pendingListPrice, manualPriceOverride: undefined, pendingListPrice: undefined }
                : p,
            ),
          })),
        ),
      },
    })),
}));
