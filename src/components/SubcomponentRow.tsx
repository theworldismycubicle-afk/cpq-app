import type { Subcomponent } from '../../shared/types';
import { formatCurrency } from '../../shared/computed';
import { useQuoteStore } from '../store/quoteStore';
import { useLaborRatesStore } from '../store/laborRatesStore';
import { useUiStore } from '../store/uiStore';
import { useComputedStore } from '../store/computedStore';
import { PartLineRow } from './PartLineRow';

interface Props {
  stepId: string;
  sub: Subcomponent;
  defaultMarkupPct: number;
}

export function SubcomponentRow({ stepId, sub, defaultMarkupPct }: Props) {
  const updateSubcomponent = useQuoteStore((s) => s.updateSubcomponent);
  const removeSubcomponent = useQuoteStore((s) => s.removeSubcomponent);
  const addPartLine = useQuoteStore((s) => s.addPartLine);
  const laborRates = useLaborRatesStore((s) => s.rates);
  const collapsed = useUiStore((s) => !!s.collapsedSubs[sub.id]);
  const toggleSub = useUiStore((s) => s.toggleSub);
  const money = useComputedStore((s) => s.computed.subs[sub.id]);

  // "Which markup applies" is a trivial input value, not the sensitive markup math.
  const markup = sub.markupOverride !== undefined ? sub.markupOverride : defaultMarkupPct;
  const isOverridden = sub.markupOverride !== undefined;

  // Activity + rate are driven by the selected labor code (static from the labor table).
  const laborActivity = laborRates.find((r) => r.code === sub.laborCode)?.activity ?? '';

  return (
    <div className="sub-card">
      <div className="sub-header">
        <button
          className="collapse-btn"
          title={collapsed ? 'Expand subcomponent' : 'Collapse subcomponent'}
          onClick={() => toggleSub(sub.id)}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <div className="field">
          Step #
          <input
            type="text"
            className="sub-number"
            value={sub.number}
            placeholder="#"
            onChange={(e) => updateSubcomponent(stepId, sub.id, { number: e.target.value })}
          />
        </div>
        <input
          type="text"
          value={sub.name}
          onChange={(e) => updateSubcomponent(stepId, sub.id, { name: e.target.value })}
        />

        <div className="field">
          Labor Hrs
          <input
            type="number"
            value={sub.laborHours}
            onChange={(e) => updateSubcomponent(stepId, sub.id, { laborHours: Number(e.target.value) })}
          />
        </div>

        <div className="field">
          Activity
          <select
            className="activity-select"
            value={sub.laborCode}
            onChange={(e) => {
              const code = e.target.value;
              const rate = laborRates.find((r) => r.code === code)?.rate ?? sub.laborRate;
              updateSubcomponent(stepId, sub.id, { laborCode: code, laborRate: rate });
            }}
          >
            {laborRates.map((r) => (
              <option key={r.code} value={r.code}>
                {r.activity || r.code}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          Code
          <span className="field-ro code-ro" title={laborActivity}>{sub.laborCode || '—'}</span>
        </div>

        <div className="field">
          Rate $/hr
          <input
            type="number"
            className="field-locked"
            value={sub.laborRate}
            readOnly
            tabIndex={-1}
            title="Rate is set by the labor code (edit it in Labor Codes / Rates)"
          />
        </div>

        <div className="field">
          Markup %{!isOverridden && ' (default)'}
          <input
            type="number"
            value={markup}
            onChange={(e) => updateSubcomponent(stepId, sub.id, { markupOverride: Number(e.target.value) })}
          />
        </div>
        {isOverridden && (
          <button
            className="field"
            title="Reset to quote default markup"
            onClick={() => updateSubcomponent(stepId, sub.id, { markupOverride: undefined })}
          >
            Reset ↺
          </button>
        )}

        <div className="totals">
          {collapsed && <span className="collapse-count">{sub.parts.length} parts · </span>}
          Material {formatCurrency(money?.material ?? 0)} · Labor{' '}
          {formatCurrency(money?.labor ?? 0)} · Sell {formatCurrency(money?.sell ?? 0)}
        </div>

        <button className="remove-btn" onClick={() => removeSubcomponent(stepId, sub.id)}>
          Delete Subcomponent
        </button>
      </div>

      {!collapsed && (
      <>
      <table className="parts-table">
        <thead>
          <tr>
            <th style={{ width: '12%' }}>Part Number</th>
            <th style={{ width: '9%' }}>P&amp;ID Ref</th>
            <th style={{ width: '24%' }}>Description</th>
            <th style={{ width: '6%' }}>Qty</th>
            <th style={{ width: '12%' }}>Unit Price</th>
            <th style={{ width: '7%' }}>Source</th>
            <th style={{ width: '10%' }}>Last Updated</th>
            <th style={{ width: '12%' }}>Ext Price</th>
            <th style={{ width: '4%' }}></th>
          </tr>
        </thead>
        <tbody>
          {sub.parts.map((part) => (
            <PartLineRow key={part.id} stepId={stepId} subId={sub.id} part={part} />
          ))}
        </tbody>
      </table>
      <div className="add-line-row">
        <button onClick={() => addPartLine(stepId, sub.id)}>+ Add Part Line</button>
      </div>
      </>
      )}
    </div>
  );
}
