/**
 * H2S (Ferrosorp) vessel sizing, ported from the Unison vessel-sizing workbook.
 * Iterates candidate vessel diameters × straight-sides, sizes the media bed in
 * whole super-sacks, and evaluates velocity / contact-time criteria + media life.
 */

export interface H2sDesignConditions {
  flowScfm: number;
  inletPressureInWc: number; // "WC (gauge)
  inletTempF: number;
  h2sPpmv: number;
}

export interface H2sSizingParams {
  mediaDensityLbFt3: number; // 38.5
  bagWeightLbs: number; // 2200
  freeboardFt: number; // 3.5
  mediaCapacityFraction: number; // 0.15 (lb H2S per lb media)
  h2sDensityLbFt3: number; // 0.089
  minVelocityFtMin: number; // 3
  maxVelocityFtMin: number; // 7
  minContactTimeMin: number; // 1
  mediaCostPerLb: number; // 1.65
  candidateDiametersFt: number[]; // e.g. [4,6,8,10,12]
  candidateStraightSidesFt: number[]; // e.g. [8,10,12,14,16]
}

export const DEFAULT_H2S_PARAMS: H2sSizingParams = {
  mediaDensityLbFt3: 38.5,
  bagWeightLbs: 2200,
  freeboardFt: 3.5,
  mediaCapacityFraction: 0.15,
  h2sDensityLbFt3: 0.089,
  minVelocityFtMin: 3,
  maxVelocityFtMin: 7,
  minContactTimeMin: 1,
  mediaCostPerLb: 1.65,
  candidateDiametersFt: [4, 6, 8, 10, 12],
  candidateStraightSidesFt: [8, 10, 12, 14, 16],
};

const IN_WC_PER_PSI = 27.68;
const STD_TEMP_R = 528; // 68 °F base
const STD_PRESS_PSIA = 14.3;

export interface VesselCandidate {
  diameterFt: number;
  straightSideFt: number;
  areaFt2: number;
  maxBedDepthFt: number;
  bags: number;
  mediaLbs: number;
  bedDepthFt: number;
  velocityFtMin: number;
  contactTimeMin: number;
  mediaLifeDays: number;
  meetsCriteria: boolean;
}

export interface H2sSizingResult {
  acfm: number;
  pressurePsig: number;
  h2sMassLbsPerDay: number;
  candidates: VesselCandidate[];
  valid: VesselCandidate[]; // meetsCriteria, sorted by media life ascending
  recommended: VesselCandidate | null;
}

export function sizeH2sVessel(
  cond: H2sDesignConditions,
  params: H2sSizingParams = DEFAULT_H2S_PARAMS,
): H2sSizingResult {
  const pressurePsig = cond.inletPressureInWc / IN_WC_PER_PSI;
  const acfm =
    cond.flowScfm *
    ((cond.inletTempF + 460) / STD_TEMP_R) *
    (STD_PRESS_PSIA / (STD_PRESS_PSIA + pressurePsig));

  const h2sMassLbsPerMin = params.h2sDensityLbFt3 * cond.flowScfm * (cond.h2sPpmv / 1_000_000);
  const h2sMassLbsPerDay = h2sMassLbsPerMin * 60 * 24;

  const candidates: VesselCandidate[] = [];
  for (const d of params.candidateDiametersFt) {
    for (const ss of params.candidateStraightSidesFt) {
      const area = Math.PI * Math.pow(d / 2, 2);
      const maxBedDepth = ss - params.freeboardFt;
      const maxBags = (area * maxBedDepth * params.mediaDensityLbFt3) / params.bagWeightLbs;
      const bags = Math.floor(maxBags);
      const mediaLbs = bags * params.bagWeightLbs;
      const bedDepth = mediaLbs / (area * params.mediaDensityLbFt3);
      const velocity = acfm / area;
      const contactTime = velocity > 0 ? bedDepth / velocity : 0;
      const mediaLife = h2sMassLbsPerDay > 0 ? (mediaLbs * params.mediaCapacityFraction) / h2sMassLbsPerDay : 0;
      const meets =
        bags >= 1 &&
        velocity >= params.minVelocityFtMin &&
        velocity <= params.maxVelocityFtMin &&
        contactTime >= params.minContactTimeMin;
      candidates.push({
        diameterFt: d,
        straightSideFt: ss,
        areaFt2: area,
        maxBedDepthFt: maxBedDepth,
        bags,
        mediaLbs,
        bedDepthFt: bedDepth,
        velocityFtMin: velocity,
        contactTimeMin: contactTime,
        mediaLifeDays: mediaLife,
        meetsCriteria: meets,
      });
    }
  }

  const valid = candidates.filter((c) => c.meetsCriteria).sort((a, b) => a.mediaLifeDays - b.mediaLifeDays);
  // Default recommendation: smallest media (lowest cost) that still meets all criteria.
  const recommended = valid.length
    ? valid.reduce((best, c) => (c.mediaLbs < best.mediaLbs ? c : best), valid[0])
    : null;

  return { acfm, pressurePsig, h2sMassLbsPerDay, candidates, valid, recommended };
}
