import { useState } from 'react';
import { useQuoteStore } from '../store/quoteStore';
import { usePriceListStore } from '../store/priceListStore';
import { pickFile, downloadBlob } from '../lib/browserFileIO';
import { writeBomWorkbookBuffer, readBomWorkbookFromBuffer, writeStepSummaryBuffer } from '../lib/excelBom';
import { readPriceListFromBuffer } from '../lib/excelPriceList';
import { buildQuotePdf } from '../lib/pdfQuote';

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

export function Toolbar({ onPriceListResult, onOpenTemplate, onOpenPartsList, onOpenLaborRates, onOpenLaborSummary, onOpenSavedQuotes, onOpenAssembler, autosaveLabel }: Props) {
  const quote = useQuoteStore((s) => s.quote);
  const setQuote = useQuoteStore((s) => s.setQuote);
  const applyPriceList = useQuoteStore((s) => s.applyPriceList);
  const mergePriceListEntries = usePriceListStore((s) => s.mergeEntries);
  const storedPartCount = usePriceListStore((s) => s.entries.length);
  const [status, setStatus] = useState('');

  const handleImportBom = async () => {
    const file = await pickFile('.xlsx');
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const quote = await readBomWorkbookFromBuffer(buffer);
    setQuote(quote);
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

  const handleExportPdf = async () => {
    const bytes = await buildQuotePdf(quote);
    const fileName = `${quote.quoteNumber || 'quote'}.pdf`;
    downloadBlob(bytes, fileName, PDF_MIME);
    setStatus(`Downloaded ${fileName}`);
  };

  return (
    <div className="toolbar">
      <button className="assembler-btn" onClick={onOpenAssembler}>⚙ BOM Assembler</button>
      <button onClick={onOpenSavedQuotes}>Saved Quotes</button>
      <button onClick={handleImportBom}>Import BOM</button>
      <button onClick={handleExportBom}>Export BOM</button>
      <button onClick={handleExportStepSummary}>Export Step Summary</button>
      <button onClick={handleImportPriceList}>Import Price List</button>
      <button onClick={onOpenPartsList}>View Parts List</button>
      <button onClick={onOpenLaborRates}>Labor Codes/Rates</button>
      <button onClick={onOpenLaborSummary}>Labor Summary</button>
      <button onClick={onOpenTemplate}>Quote Template & Preview</button>
      <button onClick={handleExportPdf}>Export Quote PDF</button>
      <div className="spacer" />
      {autosaveLabel && <div className="status autosave-status">{autosaveLabel}</div>}
      {storedPartCount > 0 && <div className="status">{storedPartCount} parts stored</div>}
      <div className="status">{status}</div>
    </div>
  );
}
