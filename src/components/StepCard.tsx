import type { EquipmentStep } from '../../shared/types';
import { formatCurrency, formatTicketNo } from '../../shared/computed';
import { useQuoteStore } from '../store/quoteStore';
import { useUiStore } from '../store/uiStore';
import { useComputedStore } from '../store/computedStore';
import { SubcomponentRow } from './SubcomponentRow';
import { api } from '../lib/api';
import { writeStepsBuffer } from '../lib/excelBom';
import { downloadBlob } from '../lib/browserFileIO';

interface Props {
  step: EquipmentStep;
  defaultMarkupPct: number;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function StepCard({ step, defaultMarkupPct }: Props) {
  const updateStep = useQuoteStore((s) => s.updateStep);
  const removeStep = useQuoteStore((s) => s.removeStep);
  const addSubcomponent = useQuoteStore((s) => s.addSubcomponent);
  const collapsed = useUiStore((s) => !!s.collapsedSteps[step.id]);
  const toggleStep = useUiStore((s) => s.toggleStep);
  const stepSell = useComputedStore((s) => s.computed.steps[step.id]?.sell ?? 0);

  const subCount = step.subcomponents.length;
  const partCount = step.subcomponents.reduce((n, sub) => n + sub.parts.length, 0);

  const handleExportStep = async () => {
    // Compute this step's pricing on the server, then build the workbook from those numbers.
    const computed = await api.computeQuote({ ...useQuoteStore.getState().quote, steps: [step], defaultMarkupPct });
    const buffer = await writeStepsBuffer([step], computed);
    const safeName = (step.name || 'step').replace(/[^a-z0-9_-]+/gi, '_');
    downloadBlob(buffer, `${safeName}.xlsx`, XLSX_MIME);
  };

  return (
    <div className="step-card">
      <div className="step-header">
        <button
          className="collapse-btn"
          title={collapsed ? 'Expand step' : 'Collapse step'}
          onClick={() => toggleStep(step.id)}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <div className="field">
          Work Ticket #
          <input
            type="text"
            inputMode="numeric"
            className="step-number"
            value={formatTicketNo(step.stepNumber)}
            onChange={(e) => updateStep(step.id, { stepNumber: Number(e.target.value.replace(/\D/g, '')) || 0 })}
          />
        </div>
        <input
          type="text"
          className="step-name"
          value={step.name}
          onChange={(e) => updateStep(step.id, { name: e.target.value })}
        />
        <div className="field">
          Group
          <input
            type="text"
            placeholder="(none)"
            className="step-group"
            value={step.groupName ?? ''}
            onChange={(e) => updateStep(step.id, { groupName: e.target.value || undefined })}
          />
        </div>

        <div className="totals step-total">
          {collapsed && <span className="collapse-count">{subCount} sub · {partCount} parts · </span>}
          Step Sell Price: {formatCurrency(stepSell)}
        </div>

        <button className="step-export-btn" title="Export this step to Excel" onClick={handleExportStep}>
          Export Step
        </button>
        <button className="remove-btn" onClick={() => removeStep(step.id)}>
          Delete Work Ticket Step
        </button>
      </div>

      {!collapsed && (
        <div className="step-body">
          {step.subcomponents.map((sub) => (
            <SubcomponentRow key={sub.id} stepId={step.id} sub={sub} defaultMarkupPct={defaultMarkupPct} />
          ))}
          <div className="add-line-row">
            <button onClick={() => addSubcomponent(step.id)}>+ Add Subcomponent</button>
          </div>
        </div>
      )}
    </div>
  );
}
