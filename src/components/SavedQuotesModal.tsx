import { useEffect, useState } from 'react';
import { useQuoteStore } from '../store/quoteStore';
import { newQuote } from '../../shared/types';
import {
  listSavedQuotes,
  saveQuoteToLibrary,
  loadQuoteFromLibrary,
  deleteQuoteFromLibrary,
  type SavedQuoteMeta,
} from '../lib/idb';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SavedQuotesModal({ open, onClose }: Props) {
  const quote = useQuoteStore((s) => s.quote);
  const setQuote = useQuoteStore((s) => s.setQuote);
  const [items, setItems] = useState<SavedQuoteMeta[]>([]);
  const [status, setStatus] = useState('');

  const refresh = () => listSavedQuotes().then(setItems).catch(() => {});

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  if (!open) return null;

  const handleSaveCurrent = async () => {
    const rec = await saveQuoteToLibrary(quote);
    setStatus(`Saved "${rec.quoteNumber || '(no number)'}" to library`);
    refresh();
  };

  const handleOpen = async (id: string) => {
    const q = await loadQuoteFromLibrary(id);
    if (q) {
      setQuote(q);
      setStatus('Opened quote');
      onClose();
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Delete saved quote "${label}"? This cannot be undone.`)) return;
    await deleteQuoteFromLibrary(id);
    refresh();
  };

  const handleNew = () => {
    if (!confirm('Start a new blank quote? Your current quote is auto-saved — save it to the library first if you want to keep it separately.')) return;
    setQuote(newQuote());
    onClose();
  };

  const isCurrentSaved = items.some((i) => i.id === quote.id);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="parts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="parts-modal-head">
          <h3>Saved Quotes</h3>
          <div className="parts-modal-sub">
            Your work auto-saves in this browser. Use the library to keep multiple named BOMs.
          </div>
        </div>

        <div className="parts-modal-toolbar">
          <button onClick={handleSaveCurrent}>
            {isCurrentSaved ? 'Update Current in Library' : 'Save Current to Library'}
          </button>
          <button onClick={handleNew}>New Blank Quote</button>
          <div style={{ flex: 1 }} />
          <span className="parts-modal-sub">{status}</span>
        </div>

        <div className="parts-modal-body">
          {items.length === 0 ? (
            <div className="parts-empty">No saved quotes yet. Click “Save Current to Library”.</div>
          ) : (
            <table className="parts-list-table">
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>Quote #</th>
                  <th style={{ width: '34%' }}>Customer</th>
                  <th style={{ width: '24%' }}>Last Saved</th>
                  <th style={{ width: '20%' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className={it.id === quote.id ? 'current-quote-row' : ''}>
                    <td>{it.quoteNumber || '(no number)'}</td>
                    <td>{it.customer || '—'}</td>
                    <td>{new Date(it.updatedAt).toLocaleString()}</td>
                    <td className="row-actions">
                      <button onClick={() => handleOpen(it.id)}>Open</button>
                      <button
                        className="danger-link"
                        onClick={() => handleDelete(it.id, it.quoteNumber || '(no number)')}
                      >
                        Delete
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
