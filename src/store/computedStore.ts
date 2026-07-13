import { create } from 'zustand';
import { EMPTY_COMPUTED, type ComputedQuote } from '../../shared/computed';
import { api } from '../lib/api';
import { useQuoteStore } from './quoteStore';

interface ComputedState {
  computed: ComputedQuote;
  /** True while a recompute request is in flight (totals may be a beat stale). */
  pending: boolean;
  recompute: () => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

export const useComputedStore = create<ComputedState>((set) => ({
  computed: EMPTY_COMPUTED,
  pending: false,

  recompute: () => {
    clearTimeout(timer);
    set({ pending: true });
    timer = setTimeout(async () => {
      const mySeq = ++seq;
      try {
        const result = await api.computeQuote(useQuoteStore.getState().quote);
        // Ignore out-of-order responses (a newer edit already fired).
        if (mySeq === seq) set({ computed: result, pending: false });
      } catch {
        if (mySeq === seq) set({ pending: false });
      }
    }, 250);
  },
}));

// Recompute whenever the quote changes (and once on load).
useQuoteStore.subscribe(() => useComputedStore.getState().recompute());
useComputedStore.getState().recompute();
