import { useState } from 'react';
import { useQuoteStore } from '../store/quoteStore';
import { useUiStore } from '../store/uiStore';
import { useComputedStore } from '../store/computedStore';
import { StepCard } from './StepCard';
import { formatCurrency } from '../../shared/computed';
import { readStepsFromBuffer } from '../lib/excelBom';
import { saveQuoteToLibrary } from '../lib/idb';
import { pickFile } from '../lib/browserFileIO';

export function BomTable() {
  const quote = useQuoteStore((s) => s.quote);
  const addStep = useQuoteStore((s) => s.addStep);
  const appendSteps = useQuoteStore((s) => s.appendSteps);
  const collapseAll = useUiStore((s) => s.collapseAll);
  const expandAll = useUiStore((s) => s.expandAll);
  const computed = useComputedStore((s) => s.computed);
  const [saveMsg, setSaveMsg] = useState('');

  const handleSaveQuote = async () => {
    try {
      const rec = await saveQuoteToLibrary(quote);
      setSaveMsg(`Saved "${rec.quoteNumber || '(no number)'}"`);
    } catch {
      setSaveMsg('Save failed');
    }
    setTimeout(() => setSaveMsg(''), 2500);
  };

  const handleCollapseAll = () => {
    const stepIds = quote.steps.map((st) => st.id);
    const subIds = quote.steps.flatMap((st) => st.subcomponents.map((sub) => sub.id));
    collapseAll(stepIds, subIds);
  };

  const groups = computed.groups;
  const hasGroups = groups.some((g) => g.groupName !== null);

  const handleImportStep = async () => {
    const file = await pickFile('.xlsx');
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const steps = await readStepsFromBuffer(buffer);
    if (steps.length === 0) {
      alert('No equipment step rows found in that file.');
      return;
    }
    appendSteps(steps);
  };

  return (
    <>
      <div className="content">
        {quote.steps.map((step) => (
          <StepCard key={step.id} step={step} defaultMarkupPct={quote.defaultMarkupPct} />
        ))}
        <div className="step-actions-row">
          <button onClick={addStep}>+ Add Work Ticket Step</button>
          <button onClick={handleImportStep}>Import Step from Excel</button>
          {quote.steps.length > 0 && (
            <>
              <div style={{ flex: 1 }} />
              <button onClick={handleCollapseAll}>Collapse All</button>
              <button onClick={expandAll}>Expand All</button>
            </>
          )}
        </div>

        {hasGroups && (
          <div className="group-summary">
            <h4>Subtotals</h4>
            {groups.map((g, i) => (
              <div key={g.groupName ?? g.stepNames[0] ?? i} className="group-summary-row">
                <span>
                  {g.groupName ?? g.stepNames[0]} {g.groupName && `(${g.stepNames.join(', ')})`}
                </span>
                <span>{formatCurrency(g.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="grand-total-bar">
        <span>Grand Total:</span>
        <span>{formatCurrency(computed.grandTotal)}</span>
        {saveMsg && <span className="grand-total-savemsg">{saveMsg}</span>}
        <button className="grand-total-save" onClick={handleSaveQuote}>💾 Save Quote</button>
      </div>
    </>
  );
}
