import type { PartLine } from '../../shared/types';
import { formatCurrency } from '../../shared/computed';
import { useQuoteStore } from '../store/quoteStore';
import { usePriceListStore } from '../store/priceListStore';
import { useComputedStore } from '../store/computedStore';

interface Props {
  stepId: string;
  subId: string;
  part: PartLine;
}

export function PartLineRow({ stepId, subId, part }: Props) {
  const updatePartLine = useQuoteStore((s) => s.updatePartLine);
  const removePartLine = useQuoteStore((s) => s.removePartLine);
  const acceptPendingListPrice = useQuoteStore((s) => s.acceptPendingListPrice);
  const lookupPriceList = usePriceListStore((s) => s.lookup);
  const extPrice = useComputedStore((s) => s.computed.lines[part.id] ?? 0);

  const isManual = part.priceSource === 'manual';
  const displayedPrice = isManual && part.manualPriceOverride !== undefined ? part.manualPriceOverride : part.unitPrice;

  const handlePartNumberChange = (value: string) => {
    const match = lookupPriceList(value);
    if (match) {
      updatePartLine(stepId, subId, part.id, {
        partNumber: value,
        description: match.description || part.description,
        unitPrice: match.unitPrice,
        priceSource: 'list',
        manualPriceOverride: undefined,
        pendingListPrice: undefined,
        priceUpdatedAt: match.lastUpdated,
      });
    } else {
      updatePartLine(stepId, subId, part.id, { partNumber: value });
    }
  };

  // For list-priced lines, prefer the snapshot date; fall back to the current parts-list entry.
  const lastUpdated = isManual ? undefined : (part.priceUpdatedAt ?? lookupPriceList(part.partNumber)?.lastUpdated);

  return (
    <tr>
      <td>
        <div className="pn-cell">
          {part.requiresInput && <span className="req-badge" title="Requires manual input (vendor lookup)">!</span>}
          <input
            type="text"
            list="known-part-numbers"
            className={part.requiresInput ? 'req-input' : ''}
            value={part.partNumber}
            onChange={(e) => handlePartNumberChange(e.target.value)}
          />
        </div>
      </td>
      <td>
        <input
          type="text"
          value={part.description}
          onChange={(e) => updatePartLine(stepId, subId, part.id, { description: e.target.value })}
        />
      </td>
      <td>
        <input
          type="number"
          value={part.qty}
          min={0}
          onChange={(e) => updatePartLine(stepId, subId, part.id, { qty: Number(e.target.value) })}
        />
      </td>
      <td>
        <div className="price-cell">
          <button
            className={`lock-btn ${part.priceLocked ? 'locked' : ''}`}
            title={part.priceLocked ? 'Price locked — skipped by "Update All to List"' : 'Lock price to skip mass reprice'}
            onClick={() => updatePartLine(stepId, subId, part.id, { priceLocked: !part.priceLocked })}
          >
            {part.priceLocked ? '🔒' : '🔓'}
          </button>
          <input
            type="number"
            className={isManual ? 'price-manual' : ''}
            value={displayedPrice}
            step="0.01"
            onChange={(e) => {
              const value = Number(e.target.value);
              updatePartLine(stepId, subId, part.id, {
                priceSource: 'manual',
                manualPriceOverride: value,
              });
            }}
          />
        </div>
        {part.pendingListPrice !== undefined && (
          <div className="pending-flag" onClick={() => acceptPendingListPrice(stepId, subId, part.id)}>
            New list price: {formatCurrency(part.pendingListPrice)} (click to accept)
          </div>
        )}
      </td>
      <td>
        {!isManual ? (
          <span title="Price comes from imported price list">List</span>
        ) : (
          <button
            title="Revert to list price source on next import"
            onClick={() => updatePartLine(stepId, subId, part.id, { priceSource: 'list', manualPriceOverride: undefined })}
          >
            Manual ↺
          </button>
        )}
      </td>
      <td className="updated-cell" title="Date this price was last updated in the parts list">
        {isManual ? 'manual' : lastUpdated || '—'}
      </td>
      <td>{formatCurrency(extPrice)}</td>
      <td>
        <button className="remove-line" title="Remove line" onClick={() => removePartLine(stepId, subId, part.id)}>
          ✕
        </button>
      </td>
    </tr>
  );
}
