/**
 * Gas mixture property calculations for pipe sizing.
 * All calculations are done in SI internally.
 *
 * Inputs are a wet-gas composition (dry-basis mole/volume %) plus temperature,
 * relative humidity, and operating pressure. Water vapor is added from RH.
 */

export interface GasComposition {
  ch4: number; // % (dry basis)
  co2: number;
  n2: number;
  o2: number;
}

export interface GasConditions {
  temperatureC: number; // operating temperature, °C
  relativeHumidityPct: number; // 0-100
  pressureGaugeKpa: number; // operating pressure, kPa gauge
}

export interface GasProperties {
  molecularWeight: number; // g/mol
  densityKgM3: number; // kg/m³ at operating P,T
  viscosityPaS: number; // Pa·s
  waterMoleFraction: number;
  pressureAbsKpa: number;
}

const R = 8.314462; // J/(mol·K)
const ATM_KPA = 101.325;

interface Component {
  mw: number; // g/mol
  // Sutherland viscosity constants: mu = mu0 * (T0+C)/(T+C) * (T/T0)^1.5
  mu0: number; // reference viscosity, Pa·s at T0
  t0: number; // K
  c: number; // Sutherland constant, K
}

// MW (g/mol) and Sutherland constants for viscosity.
const COMPONENTS: Record<string, Component> = {
  ch4: { mw: 16.043, mu0: 1.1e-5, t0: 273.15, c: 197 },
  co2: { mw: 44.01, mu0: 1.37e-5, t0: 273.15, c: 240 },
  n2: { mw: 28.014, mu0: 1.663e-5, t0: 273.15, c: 107 },
  o2: { mw: 31.998, mu0: 1.919e-5, t0: 273.15, c: 139 },
  h2o: { mw: 18.015, mu0: 8.9e-6, t0: 273.15, c: 660 },
};

/** Saturation vapor pressure of water (kPa) at temperature (°C), Magnus formula. */
export function waterSaturationPressureKpa(tempC: number): number {
  return 0.61094 * Math.exp((17.625 * tempC) / (tempC + 243.04));
}

function sutherlandViscosity(comp: Component, tempK: number): number {
  return comp.mu0 * ((comp.t0 + comp.c) / (tempK + comp.c)) * Math.pow(tempK / comp.t0, 1.5);
}

/** Wilke's method for the viscosity of a gas mixture. */
function wilkeMixtureViscosity(
  fractions: Record<string, number>,
  viscosities: Record<string, number>,
  mws: Record<string, number>,
): number {
  const keys = Object.keys(fractions).filter((k) => fractions[k] > 0);
  let mu = 0;
  for (const i of keys) {
    let denom = 0;
    for (const j of keys) {
      const phi =
        Math.pow(1 + Math.sqrt(viscosities[i] / viscosities[j]) * Math.pow(mws[j] / mws[i], 0.25), 2) /
        Math.sqrt(8 * (1 + mws[i] / mws[j]));
      denom += fractions[j] * phi;
    }
    mu += (fractions[i] * viscosities[i]) / denom;
  }
  return mu;
}

export function computeGasProperties(comp: GasComposition, cond: GasConditions): GasProperties {
  const tempK = cond.temperatureC + 273.15;
  const pAbsKpa = cond.pressureGaugeKpa + ATM_KPA;

  // Dry-basis mole fractions (normalize in case they don't sum to exactly 100).
  const dryTotal = comp.ch4 + comp.co2 + comp.n2 + comp.o2;
  const dry: Record<string, number> = dryTotal > 0
    ? { ch4: comp.ch4 / dryTotal, co2: comp.co2 / dryTotal, n2: comp.n2 / dryTotal, o2: comp.o2 / dryTotal }
    : { ch4: 0, co2: 0, n2: 0, o2: 0 };

  // Water vapor mole fraction from RH.
  const pw = (cond.relativeHumidityPct / 100) * waterSaturationPressureKpa(cond.temperatureC);
  const yw = Math.min(Math.max(pw / pAbsKpa, 0), 0.99);

  // Wet-basis mole fractions.
  const fractions: Record<string, number> = {
    ch4: dry.ch4 * (1 - yw),
    co2: dry.co2 * (1 - yw),
    n2: dry.n2 * (1 - yw),
    o2: dry.o2 * (1 - yw),
    h2o: yw,
  };

  // Mixture molecular weight (g/mol).
  let mw = 0;
  const mws: Record<string, number> = {};
  const viscosities: Record<string, number> = {};
  for (const k of Object.keys(fractions)) {
    const c = COMPONENTS[k];
    mw += fractions[k] * c.mw;
    mws[k] = c.mw;
    viscosities[k] = sutherlandViscosity(c, tempK);
  }

  // Ideal-gas density: rho = P*MW/(R*T). P in Pa, MW in kg/mol.
  const densityKgM3 = (pAbsKpa * 1000 * (mw / 1000)) / (R * tempK);

  const viscosityPaS = wilkeMixtureViscosity(fractions, viscosities, mws);

  return {
    molecularWeight: mw,
    densityKgM3,
    viscosityPaS,
    waterMoleFraction: yw,
    pressureAbsKpa: pAbsKpa,
  };
}
