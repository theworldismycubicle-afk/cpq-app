/**
 * Pipe sizing by pressure-drop limit (Darcy-Weisbach).
 * Picks the smallest standard pipe size whose friction gradient stays within the
 * allowable inches-water-column per 100 ft. Calculations are done in SI internally.
 */
import { computeGasProperties, type GasComposition, type GasConditions, type GasProperties } from './gasProperties';

export interface PipeSize {
  label: string; // e.g. '2"'
  idInches: number; // inside diameter, inches
}

// Schedule 10S stainless steel inside diameters (inches).
export const SCH10S_SIZES: PipeSize[] = [
  { label: '1/2"', idInches: 0.674 },
  { label: '3/4"', idInches: 0.884 },
  { label: '1"', idInches: 1.097 },
  { label: '1-1/4"', idInches: 1.442 },
  { label: '1-1/2"', idInches: 1.682 },
  { label: '2"', idInches: 2.157 },
  { label: '2-1/2"', idInches: 2.635 },
  { label: '3"', idInches: 3.26 },
  { label: '4"', idInches: 4.26 },
  { label: '5"', idInches: 5.295 },
  { label: '6"', idInches: 6.357 },
  { label: '8"', idInches: 8.329 },
  { label: '10"', idInches: 10.42 },
  { label: '12"', idInches: 12.39 },
];

export interface SizingConfig {
  sizes: PipeSize[];
  roughnessMm: number; // absolute roughness, mm (SS ≈ 0.015)
  allowableInWcPer100ft: number; // pressure-drop limit
  flowIsStandard: boolean; // true = SCFM (correct to actual), false = ACFM
}

export const DEFAULT_SIZING_CONFIG: SizingConfig = {
  sizes: SCH10S_SIZES,
  roughnessMm: 0.015,
  allowableInWcPer100ft: 3,
  flowIsStandard: true,
};

// Standard conditions for SCFM (60°F, 1 atm).
const T_STD_K = 288.706; // 60 °F
const P_STD_KPA = 101.325;
const IN_WC_TO_PA = 249.0889;
const FT_TO_M = 0.3048;
const CFM_TO_M3S = 0.000471947;
const INCH_TO_M = 0.0254;

export interface SizeCandidate {
  size: PipeSize;
  velocityMs: number;
  velocityFtS: number;
  reynolds: number;
  dpInWcPer100ft: number;
  ok: boolean;
}

export interface SizingResult {
  props: GasProperties;
  actualFlowCfm: number;
  candidates: SizeCandidate[];
  selected: SizeCandidate | null; // smallest size within the limit
}

/** Swamee-Jain explicit friction factor (turbulent); falls back to laminar for low Re. */
function frictionFactor(re: number, relRoughness: number): number {
  if (re < 2000) return 64 / Math.max(re, 1);
  const term = relRoughness / 3.7 + 5.74 / Math.pow(re, 0.9);
  return 0.25 / Math.pow(Math.log10(term), 2);
}

export function sizePipe(
  comp: GasComposition,
  cond: GasConditions,
  flowCfm: number,
  config: SizingConfig = DEFAULT_SIZING_CONFIG,
): SizingResult {
  const props = computeGasProperties(comp, cond);
  const tempK = cond.temperatureC + 273.15;

  // Correct standard flow to actual volumetric flow at operating P,T.
  const actualFlowCfm = config.flowIsStandard
    ? flowCfm * (P_STD_KPA / props.pressureAbsKpa) * (tempK / T_STD_K)
    : flowCfm;

  const qM3s = actualFlowCfm * CFM_TO_M3S;
  const rho = props.densityKgM3;
  const mu = props.viscosityPaS;
  const roughnessM = config.roughnessMm / 1000;
  const lengthM = 100 * FT_TO_M;
  const limitPa = config.allowableInWcPer100ft * IN_WC_TO_PA;

  const candidates: SizeCandidate[] = config.sizes.map((size) => {
    const dM = size.idInches * INCH_TO_M;
    const area = (Math.PI * dM * dM) / 4;
    const v = qM3s / area;
    const re = (rho * v * dM) / mu;
    const f = frictionFactor(re, roughnessM / dM);
    const dpPa = f * (lengthM / dM) * ((rho * v * v) / 2);
    const dpInWc = dpPa / IN_WC_TO_PA;
    return {
      size,
      velocityMs: v,
      velocityFtS: v / FT_TO_M,
      reynolds: re,
      dpInWcPer100ft: dpInWc,
      ok: dpInWc <= config.allowableInWcPer100ft,
    };
  });

  const selected = candidates.find((c) => c.ok) ?? null;
  return { props, actualFlowCfm, candidates, selected };
}
