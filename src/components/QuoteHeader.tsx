import { useQuoteStore } from '../store/quoteStore';
import { usePriceListStore } from '../store/priceListStore';

export function QuoteHeader() {
  const quote = useQuoteStore((s) => s.quote);
  const updateHeader = useQuoteStore((s) => s.updateHeader);
  const repriceAllToList = useQuoteStore((s) => s.repriceAllToList);
  const priceListEntries = usePriceListStore((s) => s.entries);

  const handleRepriceAll = () => {
    if (priceListEntries.length === 0) {
      alert('No parts list loaded. Import or enter a parts list first.');
      return;
    }
    if (!confirm('Update all unlocked part prices to the current parts list? Locked (🔒) prices are kept.')) return;
    const r = repriceAllToList(priceListEntries);
    alert(
      `Repriced ${r.repriced} part${r.repriced === 1 ? '' : 's'} to list.\n` +
        `${r.locked} locked part${r.locked === 1 ? '' : 's'} kept.\n` +
        `${r.notFound} part${r.notFound === 1 ? '' : 's'} not found in the parts list (unchanged).`,
    );
  };

  return (
    <div className="header-panel">
      <label>
        Quote #
        <input
          type="text"
          value={quote.quoteNumber}
          onChange={(e) => updateHeader({ quoteNumber: e.target.value })}
        />
      </label>
      <label>
        Customer
        <input
          type="text"
          value={quote.customer}
          onChange={(e) => updateHeader({ customer: e.target.value })}
        />
      </label>
      <label>
        Date
        <input type="date" value={quote.date} onChange={(e) => updateHeader({ date: e.target.value })} />
      </label>
      <label>
        Default Markup %
        <input
          type="number"
          value={quote.defaultMarkupPct}
          onChange={(e) => updateHeader({ defaultMarkupPct: Number(e.target.value) })}
        />
      </label>
      <button className="reprice-btn" onClick={handleRepriceAll}>
        Update All Prices to List
      </button>
    </div>
  );
}
