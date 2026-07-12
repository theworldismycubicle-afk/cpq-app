import { useEffect, useState } from 'react';
import { useQuoteStore } from '../store/quoteStore';
import { getAutosave, setAutosave } from '../lib/idb';

/**
 * Restores the working draft from IndexedDB on load, then continuously auto-saves
 * the active quote (debounced) so work is never lost to a forgotten export.
 */
export function useAutosave() {
  const [ready, setReady] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let hydrated = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    getAutosave()
      .then((q) => {
        if (q) useQuoteStore.getState().setQuote(q);
      })
      .catch(() => {})
      .finally(() => {
        hydrated = true;
        setReady(true);
      });

    const unsub = useQuoteStore.subscribe((state) => {
      if (!hydrated) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        setAutosave(state.quote)
          .then(() => setLastSavedAt(new Date().toISOString()))
          .catch(() => {});
      }, 600);
    });

    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  return { ready, lastSavedAt };
}
