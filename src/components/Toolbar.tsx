import { useState } from 'react';
import { useQuoteStore } from '../store/quoteStore';
import { usePriceListStore } from '../store/priceListStore';
import { pickFile, downloadBlob } from '../lib/browserFileIO';
import { useLaborRatesStore } from '../store/laborRatesStore';
import { writeBomWorkbookBuffer, readBomWorkbookFromBuffer, writeStepSummaryBuffer, writeBomTemplateBuffer } from '../lib/excelBom';
import { readPriceListFromBuffer, writePriceListTemplateBuffer } from '../lib/excelPriceList';
import { readLaborRatesFromBuffer, writeLaborRatesTemplateBuffer } from '../lib/excelLaborRates';
import { buildQuotePdf } from '../lib/pdfQuote';
import { saveQuoteToLibrary } from '../lib/idb';
import { api } from '../lib/api';
import { newQuote } from '../../shared/types';

interface Props {
  onPriceListResult: (result: { fileName: string; updated: number; unmatched: number; pendingManual: number }) => void;
  onOpenTemplate: () => void;
  onOpenPartsList: () => void;
  onOpenLaborRates: () => void;
  onOpenLaborSummary: () => void;
  onOpenSavedQuotes: () => void;
  onOpenAssembler: () => void;
  autosaveLabel: string;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF_MIME = 'application/pdf';

type GroupKey = 'quote' | 'build' | 'import' | 'data';

export function Toolbar({
  onPriceListResult,
  onOpenTemplate,
  onOpenPartsList,
  onOpenLaborRates,
  onOpenLaborSummary,
  onOpenSavedQuotes,
  onOpenAssembler,
  autosaveLabel,
}: Props) {
  const quote = useQuoteStore((s) => s.quote);
  const setQuote = useQuoteStore((s) => s.setQuote);
  const applyPriceList = useQuoteStore((s) => s.applyPriceList);
  const mergePriceListEntries = usePriceListStore((s) => s.mergeEntries);
  const lookupPrice = usePriceListStore((s) => s.lookup);
  const storedPartCount = usePriceListStore((s) => s.entries.length);
  const mergeLaborRates = useLaborRatesStore((s) => s.mergeRates);
  const priceLookup = (pn: string) => {
    const e = lookupPrice(pn);
    return e ? { unitPrice: e.unitPrice, description: e.description, lastUpdated: e.lastUpdated } : undefined;
  };
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<Record<GroupKey, boolean>>({ quote: true, build: true, import: true, data: true });

  const toggle = (k: GroupKey) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  // ---- Quote actions ----
  const handleSaveQuote = async () => {
    try {
      const rec = await saveQuoteToLibrary(quote);
      setStatus(`Saved "${rec.quoteNumber || '(no number)'}"`);
    } catch {
      setStatus('Save failed');
    }
  };

  const handleNewQuote = () => {
    if (!confirm('Start a new blank quote? Your current quote is auto-saved; use Save Quote first to keep it in the library.')) return;
    setQuote(newQuote());
    setStatus('Started new quote');
  };

  const handleExportPdf = async () => {
    const bytes = await buildQuotePdf(quote, await api.computeQuote(quote));
    const fileName = `${quote.quoteNumber || 'quote'}.pdf`;
    downloadBlob(bytes, fileName, PDF_MIME);
    setStatus(`Downloaded ${fileName}`);
  };

  // ---- Build / BOM actions ----
  const handleImportBom = async () => {
    const file = await pickFile('.xlsx');
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const imported = await readBomWorkbookFromBuffer(buffer, priceLookup);
    setQuote(imported);
    const flagged = imported.steps.reduce(
      (n, wt) => n + wt.subcomponents.reduce((m, s) => m + s.parts.filter((p) => p.requiresInput).length, 0),
      0,
    );
    setStatus(`Imported BOM from ${file.name}${flagged ? ` — ${flagged} part(s) need pricing` : ''}`);
  };

  const handleExportBom = async () => {
    const buffer = await writeBomWorkbookBuffer(quote, await api.computeQuote(quote));
    const fileName = `${quote.quoteNumber || 'bom'}.xlsx`;
    downloadBlob(buffer, fileName, XLSX_MIME);
    setStatus(`Downloaded ${fileName}`);
  };

  const handleBomTemplate = async () => {
    const buffer = await writeBomTemplateBuffer();
    downloadBlob(buffer, 'CPQ-BOM-Import-Template.xlsx', XLSX_MIME);
    setStatus('Downloaded BOM import template');
  };

  const handleExportStepSummary = async () => {
    const buffer = await writeStepSummaryBuffer(quote.steps, await api.computeQuote(quote));
    const fileName = `${quote.quoteNumber || 'quote'}-step-summary.xlsx`;
    downloadBlob(buffer, fileName, XLSX_MIME);
    setStatus(`Downloaded ${fileName}`);
  };

  // ---- Import actions ----
  const handleImportPriceList = async () => {
    const file = await pickFile('.xlsx');
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const entries = await readPriceListFromBuffer(buffer);
    mergePriceListEntries(entries, file.name);
    const summary = applyPriceList(entries);
    onPriceListResult({ fileName: file.name, ...summary });
    setStatus(`Applied price list ${file.name}`);
  };

  const handlePriceListTemplate = async () => {
    downloadBlob(await writePriceListTemplateBuffer(), 'CPQ-Price-List-Template.xlsx', XLSX_MIME);
    setStatus('Downloaded price list template');
  };

  const handleImportLaborRates = async () => {
    const file = await pickFile('.xlsx');
    if (!file) return;
    const rates = await readLaborRatesFromBuffer(await file.arrayBuffer());
    const { addedCount, updatedCount } = mergeLaborRates(rates);
    setStatus(`Labor rates: ${addedCount} added, ${updatedCount} updated`);
  };

  const handleLaborRatesTemplate = async () => {
    downloadBlob(await writeLaborRatesTemplateBuffer(), 'CPQ-Labor-Rates-Template.xlsx', XLSX_MIME);
    setStatus('Downloaded labor rates template');
  };

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-logo">▧</span>
        <span className="sidebar-title">CPQ</span>
      </div>

      <SideGroup title="Quote" icon="📄" open={open.quote} onToggle={() => toggle('quote')}>
        <button className="side-btn accent" onClick={handleSaveQuote}>💾 Save Quote</button>
        <button className="side-btn" onClick={onOpenSavedQuotes}>📁 Open / Manage Quotes</button>
        <button className="side-btn" onClick={handleNewQuote}>✚ New Quote</button>
        <button className="side-btn" onClick={onOpenTemplate}>🎨 Template &amp; Preview</button>
        <button className="side-btn" onClick={handleExportPdf}>⬇ Export PDF</button>
      </SideGroup>

      <SideGroup title="Build BOM" icon="⚙" open={open.build} onToggle={() => toggle('build')}>
        <button className="side-btn accent-green" onClick={onOpenAssembler}>⚙ BOM Assembler</button>
        <button className="side-btn" onClick={handleExportBom}>⬇ Export BOM</button>
        <button className="side-btn" onClick={handleExportStepSummary}>⬇ Step Summary</button>
      </SideGroup>

      <SideGroup title="Import" icon="⬆" open={open.import} onToggle={() => toggle('import')}>
        <ImportRow label="BOM" onImport={handleImportBom} onTemplate={handleBomTemplate} />
        <ImportRow label="Price List" onImport={handleImportPriceList} onTemplate={handlePriceListTemplate} />
        <ImportRow label="Labor Rates" onImport={handleImportLaborRates} onTemplate={handleLaborRatesTemplate} />
      </SideGroup>

      <SideGroup title="Data" icon="🗄" open={open.data} onToggle={() => toggle('data')}>
        <button className="side-btn" onClick={onOpenPartsList}>📋 Parts List</button>
        <button className="side-btn" onClick={onOpenLaborRates}>👷 Labor Codes / Rates</button>
        <button className="side-btn" onClick={onOpenLaborSummary}>Σ Labor Summary</button>
      </SideGroup>

      <div className="sidebar-foot">
        {autosaveLabel && <div className="status autosave-status">● {autosaveLabel}</div>}
        {storedPartCount > 0 && <div className="status">{storedPartCount} parts stored</div>}
        {status && <div className="status status-msg">{status}</div>}
      </div>
    </nav>
  );
}

function ImportRow({ label, onImport, onTemplate }: { label: string; onImport: () => void; onTemplate: () => void }) {
  return (
    <div className="import-row">
      <span className="import-row-label">{label}</span>
      <div className="import-row-btns">
        <button className="import-btn" onClick={onImport}>Import</button>
        <button className="import-btn ghost" title={`Download the ${label} import template`} onClick={onTemplate}>Template ↓</button>
      </div>
    </div>
  );
}

function SideGroup({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="side-group">
      <button className="side-group-head" onClick={onToggle} aria-expanded={open}>
        <span className="side-caret">{open ? '▾' : '▸'}</span>
        <span className="side-group-icon">{icon}</span>
        <span className="side-group-title">{title}</span>
      </button>
      {open && <div className="side-group-body">{children}</div>}
    </div>
  );
}
