interface Props {
  result: { fileName: string; updated: number; unmatched: number; pendingManual: number } | null;
  onClose: () => void;
}

export function PriceListImportModal({ result, onClose }: Props) {
  if (!result) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Price List Imported</h3>
        <p>File: {result.fileName}</p>
        <ul>
          <li>{result.updated} line(s) updated to new list price</li>
          <li>{result.pendingManual} manually-overridden line(s) have a newer list price available (flagged in table)</li>
          <li>{result.unmatched} price list entries did not match any part number in the BOM</li>
        </ul>
        <div className="modal-actions">
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
