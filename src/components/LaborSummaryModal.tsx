import { formatCurrency, formatTicketNo } from '../../shared/computed';
import { useComputedStore } from '../store/computedStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function LaborSummaryModal({ open, onClose }: Props) {
  const summary = useComputedStore((s) => s.computed.labor);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="parts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="parts-modal-head">
          <h3>Labor Summary</h3>
          <div className="parts-modal-sub">
            {summary.grandHours.toLocaleString()} total hours · {formatCurrency(summary.grandCost)} total labor cost
          </div>
        </div>

        <div className="parts-modal-body">
          {summary.perStep.length === 0 ? (
            <div className="parts-empty">No work tickets in this quote yet.</div>
          ) : (
            <>
              {summary.perStep.map((step) => (
                <div key={step.stepId} className="labor-step-block">
                  <div className="labor-step-title">
                    {formatTicketNo(step.stepNumber)}. {step.name || '(unnamed)'}
                    <span className="labor-step-total">
                      {step.totalHours.toLocaleString()} hrs · {formatCurrency(step.totalCost)}
                    </span>
                  </div>
                  {step.byCode.length === 0 ? (
                    <div className="labor-none">No labor entered.</div>
                  ) : (
                    <table className="labor-table">
                      <thead>
                        <tr>
                          <th>Labor Code</th>
                          <th className="num">Hours</th>
                          <th className="num">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {step.byCode.map((c) => (
                          <tr key={c.code}>
                            <td>{c.code}</td>
                            <td className="num">{c.hours.toLocaleString()}</td>
                            <td className="num">{formatCurrency(c.cost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}

              <div className="labor-step-block labor-grand-block">
                <div className="labor-step-title">
                  Whole BOM — Total by Labor Code
                  <span className="labor-step-total">
                    {summary.grandHours.toLocaleString()} hrs · {formatCurrency(summary.grandCost)}
                  </span>
                </div>
                <table className="labor-table">
                  <thead>
                    <tr>
                      <th>Labor Code</th>
                      <th className="num">Hours</th>
                      <th className="num">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.totals.map((c) => (
                      <tr key={c.code}>
                        <td>{c.code}</td>
                        <td className="num">{c.hours.toLocaleString()}</td>
                        <td className="num">{formatCurrency(c.cost)}</td>
                      </tr>
                    ))}
                    <tr className="labor-grand-row">
                      <td>Total</td>
                      <td className="num">{summary.grandHours.toLocaleString()}</td>
                      <td className="num">{formatCurrency(summary.grandCost)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
