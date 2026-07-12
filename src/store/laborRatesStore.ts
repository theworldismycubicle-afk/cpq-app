import { create } from 'zustand';
import { DEFAULT_LABOR_RATES, type LaborRateEntry } from '../../shared/types';
import { api } from '../lib/api';

interface LaborRatesState {
  rates: LaborRateEntry[];
  loaded: boolean;
  /** Hydrate from the API; seeds defaults if the server has none yet. */
  load: () => Promise<void>;
  setRates: (rates: LaborRateEntry[]) => void;
  /** Merge by code: existing codes are overwritten, new ones appended. */
  mergeRates: (rates: LaborRateEntry[]) => { updatedCount: number; addedCount: number };
  addRate: () => void;
  updateRate: (index: number, patch: Partial<LaborRateEntry>) => void;
  removeRate: (index: number) => void;
  resetToDefaults: () => void;
  rateForCode: (code: string) => number | undefined;
}

export const useLaborRatesStore = create<LaborRatesState>()((set, get) => ({
  rates: DEFAULT_LABOR_RATES,
  loaded: false,

  load: async () => {
    const rates = await api.getLaborRates().catch(() => [] as LaborRateEntry[]);
    // Seed defaults on a fresh database so the app is usable out of the box.
    if (rates.length === 0) {
      set({ rates: DEFAULT_LABOR_RATES, loaded: true });
      api.replaceLaborRates(DEFAULT_LABOR_RATES).catch(() => {});
    } else {
      set({ rates, loaded: true });
    }
  },

  setRates: (rates) => set({ rates }),

  mergeRates: (incoming) => {
    const merged = [...get().rates];
    let updatedCount = 0;
    let addedCount = 0;
    for (const entry of incoming) {
      const idx = merged.findIndex((r) => r.code === entry.code);
      if (idx >= 0) {
        merged[idx] = entry;
        updatedCount++;
      } else {
        merged.push(entry);
        addedCount++;
      }
    }
    set({ rates: merged });
    return { updatedCount, addedCount };
  },

  addRate: () => set((s) => ({ rates: [...s.rates, { code: '', description: '', rate: 0 }] })),

  updateRate: (index, patch) =>
    set((s) => ({ rates: s.rates.map((r, i) => (i === index ? { ...r, ...patch } : r)) })),

  removeRate: (index) => set((s) => ({ rates: s.rates.filter((_, i) => i !== index) })),

  resetToDefaults: () => set({ rates: DEFAULT_LABOR_RATES }),

  rateForCode: (code) => get().rates.find((r) => r.code === code)?.rate,
}));

// Persist changes to the API (debounced), but only after the initial hydration.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useLaborRatesStore.subscribe((state, prev) => {
  if (!state.loaded || state.rates === prev.rates) return;
  clearTimeout(saveTimer);
  const snapshot = state.rates;
  saveTimer = setTimeout(() => {
    api.replaceLaborRates(snapshot.filter((r) => r.code.trim())).catch(() => {});
  }, 600);
});
