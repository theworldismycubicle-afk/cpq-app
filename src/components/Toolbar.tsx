import { useState } from 'react';
import { useQuoteStore } from '../store/quoteStore';
import { usePriceListStore } from '../store/priceListStore';
import { pickFile, downloadBlob } from '../lib/browserFileIO';
import { writeBomWorkbookBuffer, readBomWorkbookFromBuffer, writeStepSummaryBuffer } from '../lib/excelBom';
import { readPriceListFromBuffer } from '../lib/excelPriceList';
import { buildQuotePdf } from '../lib/pdfQuote';
import { saveQuoteToLibrary } from '../lib/idb';
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

type GroupKey = 'quote' | 'build' | 'data';

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
  const storedPartCount = usePriceListStore((s) => s.entries.length);
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<Record<GroupKey, boolean>>({ quote: true, build: true, data: true });

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
    const bytes = await buildQuotePdf(quote);
    const fileName = `${quote.quoteNumber || 'quote'}.pdf`;
    downloadBlob(bytes, fileName, PDF_MIME);
    setStatus(`Downloaded ${fileName}`);
  };

  // ---- Build / BOM actions ----
  const handleImportBom = async () => {
    const file = await pickFile('.xlsx');
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const imported = await readBomWorkbookFromBuffer(buffer);
    setQuote(imported);
    setStatus(`Imported BOM from ${file.name}`);
  };

  const handleExportBom = async () => {
    const buffer = await writeBomWorkbookBuffer(quote);
    const fileName = `${quote.quoteNumber || 'bom'}.xlsx`;
    downloadBlob(buffer, fileName, XLSX_MIME);
    setStatus(`Downloaded ${fileName}`);
  };

  const handleExportStepSummary = async () => {
    const buffer = await writeStepSummaryBuffer(quote.steps);
    const fileName = `${quote.quoteNumber || 'quote'}-step-summary.xlsx`;
    downloadBlob(buffer, fileName, XLSX_MIME);
    setStatus(`Downloaded ${fileName}`);
  };

  // ---- Data actions ----
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

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-logo">▧</span>
        <span className="sidebar-title">Vessel CPQ</span>
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
        <button className="side-btn" onClick={handleImportBom}>⬆ Import BOM</button>
        <button className="side-btn" onClick={handleExportBom}>⬇ Export BOM</button>
        <button className="side-btn" onClick={handleExportStepSummary}>⬇ Step Summary</button>
      </SideGroup>

      <SideGroup title="Data" icon="🗄" open={open.data} onToggle={() => toggle('data')}>
        <button className="side-btn" onClick={handleImportPriceList}>⬆ Import Price List</button>
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
