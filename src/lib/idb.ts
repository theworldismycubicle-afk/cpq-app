/**
 * Persistence facade. Historically this was IndexedDB; it now delegates to the
 * REST API (Postgres). The function names are unchanged so existing callers
 * (useAutosave, assemblerStore, SavedQuotesModal) keep working as-is.
 */
import type { Quote } from '../../shared/types';
import type { AssemblerConfig } from '../../shared/assembler';
import type { H2sSystemConfig } from '../../shared/h2sSystem';
import { api, type SavedQuoteMeta } from './api';

export type { SavedQuoteMeta };
export interface SavedQuoteRecord extends SavedQuoteMeta {
  quote: Quote;
}

// ---- Autosave (the working draft) ----

export async function getAutosave(): Promise<Quote | null> {
  return api.getConfig<Quote>('autosave');
}

export async function setAutosave(quote: Quote): Promise<void> {
  await api.setConfig('autosave', quote);
}

// ---- Assembler config ----

export async function getAssemblerConfig(): Promise<AssemblerConfig | null> {
  return api.getConfig<AssemblerConfig>('assembler');
}

export async function setAssemblerConfig(config: AssemblerConfig): Promise<void> {
  await api.setConfig('assembler', config);
}

export async function getH2sConfig(): Promise<H2sSystemConfig | null> {
  return api.getConfig<H2sSystemConfig>('h2s');
}

export async function setH2sConfig(config: H2sSystemConfig): Promise<void> {
  await api.setConfig('h2s', config);
}

// ---- Saved Quotes library ----

export async function listSavedQuotes(): Promise<SavedQuoteMeta[]> {
  return api.listQuotes();
}

export async function saveQuoteToLibrary(quote: Quote): Promise<SavedQuoteMeta> {
  return api.saveQuote(quote);
}

export async function loadQuoteFromLibrary(id: string): Promise<Quote | null> {
  try {
    return await api.getQuote(id);
  } catch {
    return null;
  }
}

export async function deleteQuoteFromLibrary(id: string): Promise<void> {
  await api.deleteQuote(id);
}
