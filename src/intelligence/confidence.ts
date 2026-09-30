import type { LabelSource } from '../types/formField';
import type { ConfidenceLevel } from '../types/mapping';

/**
 * Confidence scoring settings, kept together so they're easy to tune.
 *
 * A mapping's confidence starts from its best text match (scaled by how
 * trustworthy that text is), then signals add or subtract:
 *   + another source agrees (name attribute says the same as the label)
 *   + the input type fits (type="email" for an email)
 *   − the input type conflicts (type="date" for a phone number)
 *   − another profile field scored almost as well (ambiguous)
 *   and whenever we had to ASSUME something (which address, which date format,
 *   full name standing in for legal name), confidence is capped below "high".
 */
export interface ConfidenceConfig {
  thresholds: { high: number; medium: number };
  /** Candidates below this aren't worth suggesting at all. */
  minCandidate: number;
  /** How much to trust the label, depending on where it came from. */
  labelSourceWeights: Record<LabelSource, number>;
  attributeWeights: { ariaLabel: number; placeholder: number; title: number; name: number; id: number };
  autocompleteScore: number;
  agreementBonus: number;
  maxAgreementBonus: number;
  typeMatchBonus: number;
  typeConflictPenalty: number;
  softTypeConflictPenalty: number;
  ambiguityGap: number;
  ambiguityPenalty: number;
  /** Cap whenever we had to assume something (stand-in value, address type, date format): never "high". */
  assumptionCap: number;
  memoryScore: number;
}

export const DEFAULT_CONFIDENCE: ConfidenceConfig = {
  thresholds: { high: 0.8, medium: 0.55 },
  minCandidate: 0.3,
  labelSourceWeights: {
    label: 1,
    'aria-labelledby': 1,
    'aria-label': 0.95,
    'nearby-text': 0.85,
    title: 0.8,
    placeholder: 0.8,
    name: 0.7,
    id: 0.6,
    none: 0,
  },
  attributeWeights: { ariaLabel: 0.95, placeholder: 0.8, title: 0.75, name: 0.7, id: 0.6 },
  autocompleteScore: 0.95,
  agreementBonus: 0.05,
  maxAgreementBonus: 0.1,
  typeMatchBonus: 0.1,
  typeConflictPenalty: 0.3,
  softTypeConflictPenalty: 0.15,
  ambiguityGap: 0.08,
  ambiguityPenalty: 0.15,
  assumptionCap: 0.7,
  memoryScore: 0.97,
};

export function levelFor(confidence: number, config: ConfidenceConfig = DEFAULT_CONFIDENCE): ConfidenceLevel {
  if (confidence >= config.thresholds.high) return 'high';
  if (confidence >= config.thresholds.medium) return 'medium';
  return 'low';
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
