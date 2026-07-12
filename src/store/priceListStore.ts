import { create } from 'zustand';
import type { PriceListEntry } from '../lib/excelPriceList';
import { api } from '../lib/api';

interface PriceListState {
  entries: PriceListEntry[];
  loaded: boolean;
  /** Filename + ISO timestamp of the last import, for display (not persisted server-side). */
  lastImport?: { fileName: string; at: string };
  /** Hydrate from the API. */
  load: () => Promise<void>;
  /** Replace the entire stored list. */
  setEntries: (entries: PriceListEntry[]) => void;
  /** Merge by part number: existing part numbers are overwritten, new ones appended. */
  mergeEntries: (entries: PriceListEntry[], fileName: string) => { updatedCount: number; addedCount: number };
  /** Remove every stored part. */
  clearEntries: () => void;
  /** Add a blank part row (for manual entry in the viewer). */
  addEntry: () => void;
  /** Update one part by its index in the list. */
  updateEntry: (index: number, patch: Partial<PriceListEntry>) => void;
  /** Remove one part by its index in the list. */
  removeEntry: (index: number) => void;
  lookup: (partNumber: string) => PriceListEntry | undefined;
}

export const usePriceListStore = create<PriceListState>()((set, get) => ({
  entries: [],
  loaded: false,
  lastImport: undefined,

  load: async () => {
    const entries = await api.getParts().catch(() => [] as PriceListEntry[]);
    set({ entries, loaded: true });
  },

  setEntries: (entries) => set({ entries }),

  mergeEntries: (incoming, fileName) => {
    const merged = [...get().entries];
    let updatedCount = 0;
    let addedCount = 0;
    for (const entry of incoming) {
      const key = entry.partNumber.trim().toLowerCase();
      if (!key) continue;
      const idx = merged.findIndex((e) => e.partNumber.trim().toLowerCase() === key);
      if (idx >= 0) {
        merged[idx] = entry;
        updatedCount++;
      } else {
        merged.push(entry);
        addedCount++;
      }
    }
    set({ entries: merged, lastImport: { fileName, at: new Date().toISOString() } });
    return { updatedCount, addedCount };
  },

  clearEntries: () => set({ entries: [], lastImport: undefined }),

  addEntry: () =>
    set((s) => ({
      entries: [
        { partNumber: '', description: '', unitPrice: 0, lastUpdated: new Date().toISOString().slice(0, 10) },
        ...s.entries,
      ],
    })),

  updateEntry: (index, patch) =>
    set((s) => ({ entries: s.entries.map((e, i) => (i === index ? { ...e, ...patch } : e)) })),

  removeEntry: (index) => set((s) => ({ entries: s.entries.filter((_, i) => i !== index) })),

  lookup: (partNumber) => {
    const key = partNumber.trim().toLowerCase();
    if (!key) return undefined;
    return get().entries.find((e) => e.partNumber.trim().toLowerCase() === key);
  },
}));

// Persist changes to the API (debounced), but only after the initial hydration.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
usePriceListStore.subscribe((state, prev) => {
  if (!state.loaded || state.entries === prev.entries) return;
  clearTimeout(saveTimer);
  const snapshot = state.entries;
  saveTimer = setTimeout(() => {
    // Only persist rows that have a part number; blank in-progress rows are skipped.
    api.replaceParts(snapshot.filter((e) => e.partNumber.trim())).catch(() => {});
  }, 600);
});
