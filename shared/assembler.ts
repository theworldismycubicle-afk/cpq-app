/**
 * Parametric BOM assembler. Turns a set of resolved parameters (including the
 * calculated pipe size) into a draft BOM in the standard 3-level structure.
 */
import {
  newStep,
  newSubcomponent,
  newPartLine,
  type EquipmentStep,
  type Subcomponent,
  type PartLine,
} from './types';
import { DEFAULT_SIZING_CONFIG, type SizingConfig } from './pipeSizing';

export interface AssemblerParameter {
  key: string; // context key, e.g. 'material'
  label: string;
  type: 'number' | 'choice';
  choices?: string[];
  default?: string;
}

export type ComponentType = 'fixed' | 'variant' | 'placeholder';

export interface ComponentRule {
  step: string;
  stepNumber?: number;
  subNumber?: string;
  subcomponent: string;
  component: string; // display name / description
  type: ComponentType;
  whenParam?: string; // optional inclusion condition: context[whenParam] === whenValue
  whenValue?: string;
  matchVar?: string; // for variants: context[matchVar] === matchValue (e.g. pipeSize === '2"')
  matchValue?: string;
  qty: number;
  partNumber?: string;
}

export interface LaborRule {
  step: string;
  subcomponent: string;
  laborHours: number;
  laborCode: string;
}

export interface AssemblerConfig {
  parameters: AssemblerParameter[];
  components: ComponentRule[];
  labor: LaborRule[];
  sizing: SizingConfig;
}

export function emptyAssemblerConfig(): AssemblerConfig {
  return { parameters: [], components: [], labor: [], sizing: { ...DEFAULT_SIZING_CONFIG } };
}

/** Resolved parameter/derived context used to evaluate rules (all values compared as strings). */
export type AssemblerContext = Record<string, string>;

export interface PriceInfo {
  unitPrice: number;
  description?: string;
  lastUpdated?: string;
}

function eq(a: string | undefined, b: string | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

function ruleIncluded(rule: ComponentRule, ctx: AssemblerContext): boolean {
  if (rule.whenParam && rule.whenParam.trim()) {
    if (!eq(ctx[rule.whenParam.trim()], rule.whenValue)) return false;
  }
  if (rule.type === 'variant' && rule.matchVar && rule.matchVar.trim()) {
    if (!eq(ctx[rule.matchVar.trim()], rule.matchValue)) return false;
  }
  return true;
}

/**
 * Builds draft Equipment Steps from the config + resolved context.
 * priceLookup pulls list prices from the Parts List; rateForCode resolves labor rates.
 */
export function generateSteps(
  config: AssemblerConfig,
  ctx: AssemblerContext,
  priceLookup: (partNumber: string) => PriceInfo | undefined,
  rateForCode: (code: string) => number | undefined,
): EquipmentStep[] {
  const steps: EquipmentStep[] = [];
  const stepByName = new Map<string, EquipmentStep>();
  const subByKey = new Map<string, Subcomponent>();

  const getStep = (rule: ComponentRule): EquipmentStep => {
    let step = stepByName.get(rule.step);
    if (!step) {
      step = { ...newStep(rule.step, rule.stepNumber ?? steps.length + 1) };
      stepByName.set(rule.step, step);
      steps.push(step);
    }
    return step;
  };

  const getSub = (step: EquipmentStep, rule: ComponentRule): Subcomponent => {
    const key = `${rule.step}||${rule.subcomponent}`;
    let sub = subByKey.get(key);
    if (!sub) {
      sub = { ...newSubcomponent(rule.subcomponent, rule.subNumber ?? '') };
      // Attach labor if a matching rule exists.
      const laborRule = config.labor.find(
        (l) => eq(l.step, rule.step) && eq(l.subcomponent, rule.subcomponent),
      );
      if (laborRule) {
        sub.laborHours = laborRule.laborHours;
        sub.laborCode = laborRule.laborCode;
        sub.laborRate = rateForCode(laborRule.laborCode) ?? sub.laborRate;
      }
      subByKey.set(key, sub);
      step.subcomponents.push(sub);
    }
    return sub;
  };

  for (const rule of config.components) {
    if (!ruleIncluded(rule, ctx)) continue;
    const step = getStep(rule);
    const sub = getSub(step, rule);

    const part: PartLine = { ...newPartLine() };
    part.qty = rule.qty || 1;

    if (rule.type === 'placeholder') {
      part.partNumber = rule.partNumber ?? '';
      part.description = rule.component;
      part.unitPrice = 0;
      part.priceSource = 'manual';
      part.manualPriceOverride = 0;
      part.requiresInput = true;
    } else {
      const pn = rule.partNumber ?? '';
      part.partNumber = pn;
      const info = pn ? priceLookup(pn) : undefined;
      part.description = info?.description || rule.component;
      if (info) {
        part.unitPrice = info.unitPrice;
        part.priceSource = 'list';
        part.priceUpdatedAt = info.lastUpdated;
      } else {
        // Part not in the price list yet — leave price 0 for manual fill, but flag it.
        part.unitPrice = 0;
        part.priceSource = 'list';
        part.requiresInput = !pn ? false : true;
      }
    }

    sub.parts.push(part);
  }

  return steps;
}
