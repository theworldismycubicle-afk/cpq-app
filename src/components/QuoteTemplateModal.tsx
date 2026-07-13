import { useEffect, useRef, useState } from 'react';
import { useQuoteStore } from '../store/quoteStore';
import { buildQuotePdf } from '../lib/pdfQuote';
import { api } from '../lib/api';
import { downloadBlob } from '../lib/browserFileIO';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function QuoteTemplateModal({ open, onClose }: Props) {
  const quote = useQuoteStore((s) => s.quote);
  const updateTemplate = useQuoteStore((s) => s.updateTemplate);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const bytes = await buildQuotePdf(quote, await api.computeQuote(quote));
      if (cancelled) return;
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setPreviewUrl(url);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quote]);

  useEffect(() => {
    if (!open && urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      setPreviewUrl(null);
    }
  }, [open]);

  if (!open) return null;

  const t = quote.template;

  const handleDownload = async () => {
    const bytes = await buildQuotePdf(quote, await api.computeQuote(quote));
    downloadBlob(bytes, `${quote.quoteNumber || 'quote'}.pdf`, 'application/pdf');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="template-modal" onClick={(e) => e.stopPropagation()}>
        <div className="template-editor">
          <h3>Quote Template</h3>

          <label>
            Company Name
            <input
              type="text"
              value={t.companyName}
              onChange={(e) => updateTemplate({ companyName: e.target.value })}
            />
          </label>

          <label>
            Company Subtitle
            <input
              type="text"
              value={t.companySubtitle}
              onChange={(e) => updateTemplate({ companySubtitle: e.target.value })}
            />
          </label>

          <label>
            Quote Header Title
            <input
              type="text"
              value={t.headerTitle}
              onChange={(e) => updateTemplate({ headerTitle: e.target.value })}
            />
          </label>

          <label>
            Accent Color
            <input
              type="color"
              value={t.accentColorHex}
              onChange={(e) => updateTemplate({ accentColorHex: e.target.value })}
            />
          </label>

          <label>
            Terms / Footer Text
            <textarea
              rows={3}
              value={t.termsText}
              onChange={(e) => updateTemplate({ termsText: e.target.value })}
            />
            <span className="hint">Use {'{validDays}'} to insert the valid-days number below.</span>
          </label>

          <label>
            Valid Days
            <input
              type="number"
              value={t.validDays}
              onChange={(e) => updateTemplate({ validDays: Number(e.target.value) })}
            />
          </label>

          <div className="checkbox-row">
            <label className="inline">
              <input
                type="checkbox"
                checked={t.showMaterialColumn}
                onChange={(e) => updateTemplate({ showMaterialColumn: e.target.checked })}
              />
              Show Material column
            </label>
            <label className="inline">
              <input
                type="checkbox"
                checked={t.showLaborColumn}
                onChange={(e) => updateTemplate({ showLaborColumn: e.target.checked })}
              />
              Show Labor column
            </label>
            <label className="inline">
              <input
                type="checkbox"
                checked={t.showMarkupColumn}
                onChange={(e) => updateTemplate({ showMarkupColumn: e.target.checked })}
              />
              Show Markup column
            </label>
          </div>

          <div className="modal-actions">
            <button className="secondary" onClick={onClose}>
              Close
            </button>
            <button className="primary" onClick={handleDownload}>
              Download PDF
            </button>
          </div>
        </div>

        <div className="template-preview">
          {previewUrl ? (
            <iframe title="Quote PDF Preview" src={previewUrl} />
          ) : (
            <div className="preview-loading">Rendering preview…</div>
          )}
        </div>
      </div>
    </div>
  );
}
