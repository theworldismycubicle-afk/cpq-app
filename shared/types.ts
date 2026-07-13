export type PriceSource = 'list' | 'manual';

export interface PartLine {
  id: string;
  partNumber: string;
  description: string;
  qty: number;
  unitPrice: number;
  priceSource: PriceSource;
  manualPriceOverride?: number;
  /** Set when a price-list import found a different price but priceSource is 'manual'. */
  pendingListPrice?: number;
  /** YYYY-MM-DD the list price was last updated, carried over from the parts list. */
  priceUpdatedAt?: string;
  /** When true, a mass "update all to list" reprice skips this line. */
  priceLocked?: boolean;
  /** Set by the BOM Assembler for placeholder lines (e.g. Compressor, HX) that need manual pricing. */
  requiresInput?: boolean;
}

/** A subcomponent within a vessel/step, e.g. "H2S PID" or "H2S Vessel Shell". Carries labor and markup. */
export interface Subcomponent {
  id: string;
  number: string;
  name: string;
  parts: PartLine[];
  laborHours: number;
  laborCode: string;
  laborRate: number;
  /** When undefined, the subcomponent inherits the quote's default markup. */
  markupOverride?: number;
}

/** A top-level work-order step representing one vessel/piece of equipment, made up of subcomponents. */
export interface EquipmentStep {
  id: string;
  stepNumber: number;
  name: string;
  subcomponents: Subcomponent[];
  /** Optional group name; steps sharing the same group are combined into one subtotal. */
  groupName?: string;
  /** ERP activity code for the step-summary export ('DFLT' for material steps, e.g. '031' for labor). */
  activityCode?: string;
}

export interface QuoteTemplate {
  companyName: string;
  companySubtitle: string;
  headerTitle: string;
  termsText: string;
  validDays: number;
  showMaterialColumn: boolean;
  showLaborColumn: boolean;
  showMarkupColumn: boolean;
  accentColorHex: string;
}

export const DEFAULT_QUOTE_TEMPLATE: QuoteTemplate = {
  companyName: 'Your Company Name',
  companySubtitle: '',
  headerTitle: 'Quote',
  termsText: 'This quote is valid for {validDays} days from the date above. Pricing subject to change based on final specifications.',
  validDays: 30,
  showMaterialColumn: true,
  showLaborColumn: true,
  showMarkupColumn: true,
  accentColorHex: '#1f2a3c',
};

export interface Quote {
  id: string;
  quoteNumber: string;
  customer: string;
  date: string;
  defaultMarkupPct: number;
  steps: EquipmentStep[];
  priceListVersion?: string;
  template: QuoteTemplate;
}

export interface LaborRateEntry {
  code: string;
  description: string;
  rate: number;
}

export const DEFAULT_LABOR_RATES: LaborRateEntry[] = [
  { code: 'WELD', description: 'Welding/Fabrication', rate: 85 },
  { code: 'ASSY', description: 'Assembly', rate: 65 },
  { code: 'MACH', description: 'Machining', rate: 95 },
  { code: 'INSP', description: 'Inspection/QC', rate: 70 },
  { code: 'POL', description: 'Polishing/Finishing', rate: 75 },
];

export function newPartLine(): PartLine {
  return {
    id: cryptoRandomId(),
    partNumber: '',
    description: '',
    qty: 1,
    unitPrice: 0,
    priceSource: 'manual',
  };
}

export function newSubcomponent(name = 'New Subcomponent', number = ''): Subcomponent {
  return {
    id: cryptoRandomId(),
    number,
    name,
    parts: [],
    laborHours: 0,
    laborCode: 'ASSY',
    laborRate: 65,
  };
}

export function newStep(name = 'New Work Ticket', stepNumber = 1): EquipmentStep {
  return {
    id: cryptoRandomId(),
    stepNumber,
    name,
    subcomponents: [],
  };
}

export function newQuote(): Quote {
  return {
    id: cryptoRandomId(),
    quoteNumber: '',
    customer: '',
    date: new Date().toISOString().slice(0, 10),
    defaultMarkupPct: 35,
    steps: [],
    template: { ...DEFAULT_QUOTE_TEMPLATE },
  };
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
