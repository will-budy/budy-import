/**
 * OPS (care and compliance) result for the booth: care bumps found and the dollars they produce.
 * Rule approved 2026-10-28. All numbers come from settings.ts (CARE_BUMP).
 *   care bumps       = residents x (cases seen at Jamie / residents at Jamie)
 *   dollars a month  = care bumps x the average care bump typed in
 *   per community    = dollars a month / communities
 */
import { CARE_BUMP } from '../settings';

export interface OpsInput {
  residents: number;
  careBump: number;
  communities: number;
}

export type OpsResult =
  | { applicable: false }
  | {
      applicable: true;
      bumpsExact: number;
      bumps: number; // shown as a whole number
      monthly: number; // from the exact decimals
      perCommunityMonthly: number | null;
    };

/** About 0.047 care bumps per resident. */
export const bumpsPerResident = CARE_BUMP.casesObserved / CARE_BUMP.residentsObserved;

export function calculateOps({ residents, careBump, communities }: OpsInput): OpsResult {
  if (![residents, careBump, communities].every(Number.isFinite) || residents <= 0 || careBump < 0) return { applicable: false };
  const bumpsExact = residents * bumpsPerResident;
  const monthly = bumpsExact * careBump;
  return {
    applicable: true,
    bumpsExact,
    bumps: Math.round(bumpsExact),
    monthly,
    perCommunityMonthly: communities > 0 ? monthly / communities : null,
  };
}
