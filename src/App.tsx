import { useState } from 'react';
import { Toolbar } from './components/Toolbar';
import { QuoteHeader } from './components/QuoteHeader';
import { BomTable } from './components/BomTable';
import { PriceListImportModal } from './components/PriceListImportModal';
import { QuoteTemplateModal } from './components/QuoteTemplateModal';
import { PartsListModal } from './components/PartsListModal';
import { LaborRatesModal } from './components/LaborRatesModal';
import { LaborSummaryModal } from './components/LaborSummaryModal';
import { SavedQuotesModal } from './components/SavedQuotesModal';
import { AssemblerModal } from './components/AssemblerModal';
import { usePriceListStore } from './store/priceListStore';
import { useLaborRatesStore } from './store/laborRatesStore';
import { useAssemblerStore } from './store/assemblerStore';
import { useAutosave } from './hooks/useAutosave';
import { useEffect } from 'react';

export default function App() {
  const [priceListResult, setPriceListResult] = useState<
    { fileName: string; updated: number; unmatched: number; pendingManual: number } | null
  >(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [partsListOpen, setPartsListOpen] = useState(false);
  const [laborRatesOpen, setLaborRatesOpen] = useState(false);
  const [laborSummaryOpen, setLaborSummaryOpen] = useState(false);
  const [savedQuotesOpen, setSavedQuotesOpen] = useState(false);
  const [assemblerOpen, setAssemblerOpen] = useState(false);
  const priceListEntries = usePriceListStore((s) => s.entries);
  const loadPriceList = usePriceListStore((s) => s.load);
  const loadLaborRates = useLaborRatesStore((s) => s.load);
  const loadAssembler = useAssemblerStore((s) => s.load);
  const { ready, lastSavedAt } = useAutosave();

  useEffect(() => {
    loadPriceList();
    loadLaborRates();
    loadAssembler();
  }, [loadPriceList, loadLaborRates, loadAssembler]);

  const autosaveLabel = lastSavedAt
    ? `Auto-saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : ready
      ? 'Auto-save on'
      : 'Restoring…';

  return (
    <div className="app">
      <Toolbar
        onPriceListResult={setPriceListResult}
        onOpenTemplate={() => setTemplateOpen(true)}
        onOpenPartsList={() => setPartsListOpen(true)}
        onOpenLaborRates={() => setLaborRatesOpen(true)}
        onOpenLaborSummary={() => setLaborSummaryOpen(true)}
        onOpenSavedQuotes={() => setSavedQuotesOpen(true)}
        onOpenAssembler={() => setAssemblerOpen(true)}
        autosaveLabel={autosaveLabel}
      />
      <QuoteHeader />
      <BomTable />
      <datalist id="known-part-numbers">
        {priceListEntries.map((e) => (
          <option key={e.partNumber} value={e.partNumber} />
        ))}
      </datalist>
      <PriceListImportModal result={priceListResult} onClose={() => setPriceListResult(null)} />
      <QuoteTemplateModal open={templateOpen} onClose={() => setTemplateOpen(false)} />
      <PartsListModal open={partsListOpen} onClose={() => setPartsListOpen(false)} />
      <LaborRatesModal open={laborRatesOpen} onClose={() => setLaborRatesOpen(false)} />
      <LaborSummaryModal open={laborSummaryOpen} onClose={() => setLaborSummaryOpen(false)} />
      <SavedQuotesModal open={savedQuotesOpen} onClose={() => setSavedQuotesOpen(false)} />
      <AssemblerModal open={assemblerOpen} onClose={() => setAssemblerOpen(false)} />
    </div>
  );
}
