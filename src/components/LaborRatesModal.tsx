import { useLaborRatesStore } from '../store/laborRatesStore';
import { useQuoteStore } from '../store/quoteStore';
import { readLaborRatesFromBuffer } from '../lib/excelLaborRates';
import { pickFile } from '../lib/browserFileIO';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function LaborRatesModal({ open, onClose }: Props) {
  const rates = useLaborRatesStore((s) => s.rates);
  const addRate = useLaborRatesStore((s) => s.addRate);
  const updateRate = useLaborRatesStore((s) => s.updateRate);
  const removeRate = useLaborRatesStore((s) => s.removeRate);
  const mergeRates = useLaborRatesStore((s) => s.mergeRates);
  const resetToDefaults = useLaborRatesStore((s) => s.resetToDefaults);
  const applyLaborRateUpdates = useQuoteStore((s) => s.applyLaborRateUpdates);

  if (!open) return null;

  const handleImport = async () => {
    const file = await pickFile('.xlsx');
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const entries = await readLaborRatesFromBuffer(buffer);
    const oldRates = rates.map((r) => ({ code: r.code, rate: r.rate }));
    mergeRates(entries);
    // also push the new rates onto any subcomponents using those codes (not manually overridden)
    applyLaborRateUpdates(oldRates, entries);
  };

  const handleReset = () => {
    if (confirm('Reset labor codes to the built-in defaults? Your custom edits will be lost.')) resetToDefaults();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="parts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="parts-modal-head">
          <h3>Labor Codes &amp; Rates</h3>
          <div className="parts-modal-sub">
            {rates.length} code{rates.length === 1 ? '' : 's'} · saved automatically, edits persist between sessions
          </div>
        </div>

        <div className="parts-modal-toolbar">
          <button onClick={addRate}>+ Add Code</button>
          <button onClick={handleImport}>Import from Excel</button>
          <div style={{ flex: 1 }} />
          <button className="danger" onClick={handleReset}>
            Reset to Defaults
          </button>
        </div>

        <div className="parts-modal-body">
          {rates.length === 0 ? (
            <div className="parts-empty">No labor codes. Click “+ Add Code” to create one.</div>
          ) : (
            <table className="parts-list-table">
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>Labor Code</th>
                  <th style={{ width: '52%' }}>Activity</th>
                  <th style={{ width: '20%' }}>Rate ($/hr)</th>
                  <th style={{ width: '6%' }}></th>
                </tr>
              </thead>
              <tbody>
                {rates.map((rate, index) => (
                  <tr key={index}>
                    <td>
                      <input
                        type="text"
                        value={rate.code}
                        onChange={(e) => updateRate(index, { code: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={rate.activity}
                        onChange={(e) => updateRate(index, { activity: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={rate.rate}
                        onChange={(e) => updateRate(index, { rate: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <button className="remove-line" title="Remove code" onClick={() => removeRate(index)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
