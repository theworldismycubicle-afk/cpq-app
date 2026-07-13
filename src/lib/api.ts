/**
 * Typed client for the CPQ REST API. All persistence now goes through here
 * (replacing the old IndexedDB / localStorage layers).
 */
import type { Quote } from '../../shared/types';
import type { PriceListEntry } from './excelPriceList';
import type { LaborRateEntry } from '../../shared/types';
import type { AssemblerConfig } from '../../shared/assembler';
import type { H2sSystemConfig } from '../../shared/h2sSystem';
import type { ComputedQuote } from '../../shared/computed';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${init?.method ?? 'GET'} ${path} failed: ${res.status} ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** A part row as returned by the server (superset of PriceListEntry). */
export interface ServerPart extends PriceListEntry {
  id: string;
  category?: string | null;
}

export interface SavedQuoteMeta {
  id: string;
  quoteNumber: string;
  customer: string;
  updatedAt: string;
}

export const api = {
  // ---- Parts / price list ----
  async getParts(): Promise<PriceListEntry[]> {
    const rows = await request<ServerPart[]>('/parts');
    return rows.map((r) => ({
      partNumber: r.partNumber,
      description: r.description,
      unitPrice: r.unitPrice,
      lastUpdated: r.lastUpdated ?? undefined,
    }));
  },
  /** Replace the whole list (source-of-truth sync). Returns the saved rows. */
  replaceParts(entries: PriceListEntry[]): Promise<ServerPart[]> {
    return request<ServerPart[]>('/parts', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ entries }),
    });
  },

  // ---- Labor rates ----
  getLaborRates(): Promise<LaborRateEntry[]> {
    return request<LaborRateEntry[]>('/labor-rates');
  },
  replaceLaborRates(rates: LaborRateEntry[]): Promise<LaborRateEntry[]> {
    return request<LaborRateEntry[]>('/labor-rates', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ rates }),
    });
  },

  // ---- Quotes ----
  listQuotes(): Promise<SavedQuoteMeta[]> {
    return request<SavedQuoteMeta[]>('/quotes');
  },
  getQuote(id: string): Promise<Quote> {
    return request<Quote>(`/quotes/${encodeURIComponent(id)}`);
  },
  saveQuote(quote: Quote): Promise<SavedQuoteMeta> {
    return request<SavedQuoteMeta>(`/quotes/${encodeURIComponent(quote.id)}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(quote),
    });
  },
  deleteQuote(id: string): Promise<void> {
    return request<void>(`/quotes/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // ---- Pricing (computed server-side; formulas never reach the client) ----
  computeQuote(quote: Quote): Promise<ComputedQuote> {
    return request<ComputedQuote>('/compute', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(quote),
    });
  },

  // ---- Config docs (assembler / h2s / autosave) ----
  getConfig<T>(key: 'assembler' | 'h2s' | 'autosave'): Promise<T | null> {
    return request<T | null>(`/config/${key}`);
  },
  setConfig<T>(key: 'assembler' | 'h2s' | 'autosave', value: T): Promise<T> {
    return request<T>(`/config/${key}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(value),
    });
  },
};

export type { AssemblerConfig, H2sSystemConfig, Quote };
