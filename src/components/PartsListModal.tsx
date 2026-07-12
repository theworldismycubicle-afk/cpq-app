import { useState } from 'react';
import { usePriceListStore } from '../store/priceListStore';
import { writePriceListBuffer } from '../lib/excelPriceList';
import { downloadBlob } from '../lib/browserFileIO';

interface Props {
  open: boolean;
  onClose: () => void;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function PartsListModal({ open, onClose }: Props) {
  const entries = usePriceListStore((s) => s.entries);
  const addEntry = usePriceListStore((s) => s.addEntry);
  const updateEntry = usePriceListStore((s) => s.updateEntry);
  const removeEntry = usePriceListStore((s) => s.removeEntry);
  const clearEntries = usePriceListStore((s) => s.clearEntries);
  const lastImport = usePriceListStore((s) => s.lastImport);
  const [search, setSearch] = useState('');

  if (!open) return null;

  const filter = search.trim().toLowerCase();
  // Keep original indices so edits/deletes target the right row even when filtered.
  const rows = entries
    .map((entry, index) => ({ entry, index }))
    .filter(
      ({ entry }) =>
        !filter ||
        entry.partNumber.toLowerCase().includes(filter) ||
        entry.description.toLowerCase().includes(filter),
    );

  const handleExport = async () => {
    const buffer = await writePriceListBuffer(entries);
    downloadBlob(buffer, 'parts-list.xlsx', XLSX_MIME);
  };

  const handleClear = () => {
    if (confirm('Remove all stored parts? This cannot be undone.')) clearEntries();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="parts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="parts-modal-head">
          <h3>Stored Parts List</h3>
          <div className="parts-modal-sub">
            {entries.length} part{entries.length === 1 ? '' : 's'} stored
            {lastImport && ` · last import: ${lastImport.fileName} (${new Date(lastImport.at).toLocaleString()})`}
          </div>
        </div>

        <div className="parts-modal-toolbar">
          <input
            type="text"
            placeholder="Search part # or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button onClick={addEntry}>+ Add Part</button>
          <button onClick={handleExport} disabled={entries.length === 0}>
            Export to Excel
          </button>
          <button className="danger" onClick={handleClear} disabled={entries.length === 0}>
            Clear All
          </button>
        </div>

        <div className="parts-modal-body">
          {entries.length === 0 ? (
            <div className="parts-empty">
              No parts stored yet. Import a price list, or click “+ Add Part” to enter parts manually.
            </div>
          ) : (
            <table className="parts-list-table">
              <thead>
                <tr>
                  <th style={{ width: '24%' }}>Part Number</th>
                  <th style={{ width: '40%' }}>Description</th>
                  <th style={{ width: '15%' }}>Unit Price</th>
                  <th style={{ width: '15%' }}>Last Updated</th>
                  <th style={{ width: '6%' }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ entry, index }) => (
                  <tr key={index}>
                    <td>
                      <input
                        type="text"
                        value={entry.partNumber}
                        onChange={(e) => updateEntry(index, { partNumber: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={entry.description}
                        onChange={(e) => updateEntry(index, { description: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={entry.unitPrice}
                        onChange={(e) => updateEntry(index, { unitPrice: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        value={entry.lastUpdated ?? ''}
                        onChange={(e) => updateEntry(index, { lastUpdated: e.target.value || undefined })}
                      />
                    </td>
                    <td>
                      <button className="remove-line" title="Remove part" onClick={() => removeEntry(index)}>
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
