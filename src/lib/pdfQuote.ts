import { PDFDocument, StandardFonts, rgb, type RGB } from 'pdf-lib';
import type { Quote } from '../../shared/types';
import {
  subcomponentSellPrice,
  subcomponentMaterialTotal,
  subcomponentLaborCost,
  subcomponentMarkupPct,
  stepSellPrice,
  groupStepTotals,
  quoteGrandTotal,
  formatCurrency,
} from '../../shared/calculations';

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 50;

function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '');
  const valid = /^[0-9a-fA-F]{6}$/.test(clean) ? clean : '1f2a3c';
  const r = parseInt(valid.slice(0, 2), 16) / 255;
  const g = parseInt(valid.slice(2, 4), 16) / 255;
  const b = parseInt(valid.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

export async function buildQuotePdf(quote: Quote): Promise<Uint8Array> {
  const t = quote.template;
  const accent = hexToRgb(t.accentColorHex);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  // Header
  page.drawText(t.companyName, { x: MARGIN, y, size: 16, font: fontBold, color: accent });
  y -= 18;
  if (t.companySubtitle) {
    page.drawText(t.companySubtitle, { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 22;
  } else {
    y -= 8;
  }

  page.drawText(t.headerTitle, { x: MARGIN, y, size: 18, font: fontBold });
  y -= 28;
  page.drawText(`Quote #: ${quote.quoteNumber || '(unassigned)'}`, { x: MARGIN, y, size: 11, font });
  y -= 16;
  page.drawText(`Customer: ${quote.customer || ''}`, { x: MARGIN, y, size: 11, font });
  y -= 16;
  page.drawText(`Date: ${quote.date}`, { x: MARGIN, y, size: 11, font });
  y -= 30;

  // Table header
  const col = { name: MARGIN, material: 300, labor: 380, markup: 450, sell: 510 };
  const drawTableHeader = () => {
    page.drawText('Equipment / Subcomponent', { x: col.name, y, size: 10, font: fontBold });
    if (t.showMaterialColumn) page.drawText('Material', { x: col.material, y, size: 10, font: fontBold });
    if (t.showLaborColumn) page.drawText('Labor', { x: col.labor, y, size: 10, font: fontBold });
    if (t.showMarkupColumn) page.drawText('Markup', { x: col.markup, y, size: 10, font: fontBold });
    page.drawText('Sell Price', { x: col.sell, y, size: 10, font: fontBold });
    y -= 6;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
    y -= 16;
  };

  drawTableHeader();

  for (const step of quote.steps) {
    newPageIfNeeded(20);
    page.drawText(`${step.stepNumber}. ${step.name}`, { x: col.name, y, size: 11, font: fontBold });
    y -= 16;

    for (const sub of step.subcomponents) {
      newPageIfNeeded(18);
      const material = subcomponentMaterialTotal(sub);
      const labor = subcomponentLaborCost(sub);
      const sell = subcomponentSellPrice(sub, quote.defaultMarkupPct);
      const markupPct = subcomponentMarkupPct(sub, quote.defaultMarkupPct);
      const label = sub.number ? `   ${sub.number}  ${sub.name}` : `   ${sub.name}`;

      page.drawText(label, { x: col.name, y, size: 10, font });
      if (t.showMaterialColumn) page.drawText(formatCurrency(material), { x: col.material, y, size: 10, font });
      if (t.showLaborColumn) page.drawText(formatCurrency(labor), { x: col.labor, y, size: 10, font });
      if (t.showMarkupColumn) page.drawText(`${markupPct}%`, { x: col.markup, y, size: 10, font });
      page.drawText(formatCurrency(sell), { x: col.sell, y, size: 10, font });
      y -= 16;
    }

    newPageIfNeeded(18);
    page.drawText('Step Subtotal:', { x: col.markup, y, size: 9, font: fontItalic, color: rgb(0.35, 0.35, 0.35) });
    page.drawText(formatCurrency(stepSellPrice(step, quote.defaultMarkupPct)), {
      x: col.sell,
      y,
      size: 9,
      font: fontItalic,
      color: rgb(0.35, 0.35, 0.35),
    });
    y -= 20;
  }

  // Combined group subtotals (only shown when at least one step has a group assigned)
  const groups = groupStepTotals(quote).filter((g) => g.groupName !== null);
  if (groups.length > 0) {
    newPageIfNeeded(20 + groups.length * 16);
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
    y -= 18;
    page.drawText('Combined System Subtotals', { x: MARGIN, y, size: 11, font: fontBold });
    y -= 18;
    for (const g of groups) {
      newPageIfNeeded(16);
      page.drawText(`${g.groupName} (${g.steps.map((s) => s.name).join(', ')})`, { x: col.name, y, size: 10, font });
      page.drawText(formatCurrency(g.total), { x: col.sell, y, size: 10, font: fontBold });
      y -= 16;
    }
    y -= 6;
  }

  y -= 4;
  newPageIfNeeded(40);
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: accent,
  });
  y -= 20;
  page.drawText('Grand Total:', { x: col.markup, y, size: 13, font: fontBold, color: accent });
  page.drawText(formatCurrency(quoteGrandTotal(quote)), { x: col.sell, y, size: 13, font: fontBold, color: accent });

  y -= 40;
  newPageIfNeeded(60);
  const terms = t.termsText.replace('{validDays}', String(t.validDays));
  page.drawText(terms, { x: MARGIN, y, size: 8, font, color: rgb(0.4, 0.4, 0.4), maxWidth: PAGE_WIDTH - MARGIN * 2 });

  return pdf.save();
}
