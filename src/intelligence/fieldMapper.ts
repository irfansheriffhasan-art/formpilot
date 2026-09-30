import { isSensitiveTarget, listTargets, resolveTargetValue, targetLabel } from '../profiles/targets';
import type { UserProfile } from '../profiles/profileTypes';
import type { FormField } from '../types/formField';
import type { FieldMapping, TargetKey } from '../types/mapping';
import { clamp01, DEFAULT_CONFIDENCE, levelFor, type ConfidenceConfig } from './confidence';
import { detectAddressSection, detectPersonContext } from './contextAnalyzer';
import { fieldSignature } from './fieldSignature';
import { tokenize, tokenizeIdentifier } from './normalizer';
import { CONCEPTS, conceptScore, phraseScore, type ConceptId } from './synonyms';
import { formatValue } from './valueFormatter';

/**
 * The field mapper: decides which profile value belongs in each form field.
 *
 *   Analyze  → collect every text clue about the field
 *   Score    → match clues against the synonym dictionary and custom fields
 *   Explain  → record a human-readable reason for every adjustment
 *   (Confirm and Fill happen in the popup and content script.)
 *
 * Pure: takes a profile object, returns decisions. No storage, no DOM.
 */

export interface MapperOptions {
  hostname?: string;
  /** Corrections for this site: field signature → chosen target (or "ignore"). */
  memory?: Record<string, TargetKey | 'ignore'>;
  config?: ConfidenceConfig;
}

interface TextClue {
  tokens: string[];
  weight: number;
  /** e.g. `Label “Full Name”`, shown in explanations. */
  description: string;
  /** Shown to the user (label, placeholder...) rather than a programmer name/id. */
  visible: boolean;
}

type Candidate =
  | { kind: 'concept'; concept: ConceptId; score: number; reasons: string[] }
  | { kind: 'custom'; target: TargetKey; score: number; reasons: string[] };

const LABEL_SOURCE_NAMES: Record<FormField['labelSource'], string> = {
  label: 'Label',
  'aria-labelledby': 'Label',
  'aria-label': 'Accessible label',
  'nearby-text': 'Text next to the field',
  title: 'Tooltip',
  placeholder: 'Placeholder',
  name: 'Field name',
  id: 'Field id',
  none: '',
};

/** Input types that only make sense for certain concepts. */
const TYPE_FIT: Record<string, { concepts: ConceptId[]; hard: boolean }> = {
  email: { concepts: ['email'], hard: true },
  date: { concepts: ['dateOfBirth'], hard: true },
  tel: { concepts: ['phone', 'pincode'], hard: false },
  number: { concepts: ['phone', 'pincode', 'yearOfStudy'], hard: false },
};

/** Concepts whose target doesn't depend on context. */
const CONCEPT_PATHS: Partial<Record<ConceptId, TargetKey>> = {
  fullName: 'personal.fullName',
  firstName: 'personal.firstName',
  middleName: 'personal.middleName',
  lastName: 'personal.lastName',
  legalName: 'personal.legalName',
  certificateName: 'personal.certificateName',
  dateOfBirth: 'personal.dateOfBirth',
  gender: 'personal.gender',
  parentGuardianName: 'personal.parentGuardianName',
  email: 'contact.email',
  phone: 'contact.phone',
  college: 'education.college',
  degree: 'education.degree',
  department: 'education.department',
  yearOfStudy: 'education.yearOfStudy',
  skills: 'education.skills',
};

const ADDRESS_FIELDS: Partial<Record<ConceptId, string>> = {
  fullAddress: 'full',
  addressLine1: 'line1',
  addressLine2: 'line2',
  city: 'city',
  state: 'state',
  country: 'country',
  pincode: 'pincode',
};

/** If the user left a specific name empty, the full name is a reasonable stand-in. */
const FALLBACKS: Partial<Record<TargetKey, TargetKey>> = {
  'personal.legalName': 'personal.fullName',
  'personal.certificateName': 'personal.fullName',
};

export function mapFields(fields: FormField[], profile: UserProfile | null, options: MapperOptions = {}): FieldMapping[] {
  return fields.map((field) => mapField(field, profile, options));
}

export function mapField(field: FormField, profile: UserProfile | null, options: MapperOptions = {}): FieldMapping {
  const config = options.config ?? DEFAULT_CONFIDENCE;
  const base = { elementId: field.elementId, sensitive: field.sensitive, source: 'auto' as const };

  if (!profile) {
    return { ...base, target: null, confidence: 0, level: 'low', unavailable: 'no-profile', reasons: ['Choose or create a profile first.'] };
  }
  if (field.readOnly) {
    return { ...base, target: null, confidence: 0, level: 'low', unavailable: 'read-only', reasons: ['The site made this field read-only.'] };
  }

  const remembered = options.memory?.[fieldSignature(field)];
  if (remembered === 'ignore') {
    return {
      ...base, source: 'memory', target: null, confidence: 0, level: 'low', unavailable: 'ignored',
      reasons: [`You chose not to fill this field on ${options.hostname ?? 'this site'} before.`],
    };
  }
  if (remembered && listTargets(profile).some((t) => t.key === remembered)) {
    return mapWithTarget(field, profile, remembered, 'memory', config.memoryScore, [
      `You chose this on ${options.hostname ?? 'this site'} before.`,
    ], config);
  }

  const clues = collectClues(field, config);
  if (clues.length === 0 && !field.autocomplete) {
    return { ...base, target: null, confidence: 0, level: 'low', unavailable: 'no-match', reasons: ['The field has no label or name to go on.'] };
  }

  const candidates = scoreCandidates(field, profile, clues, config).sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < config.minCandidate) {
    return {
      ...base, target: null, confidence: best?.score ?? 0, level: 'low', unavailable: 'no-match',
      reasons: [`No profile field matches ${clues[0]?.description ?? 'this field'}.`],
    };
  }

  // --- Context: whose details is this section about? ---
  const person = detectPersonContext(field);
  let concept = best.kind === 'concept' ? best.concept : null;
  const reasons = [...best.reasons];
  let score = best.score;

  if (person.kind === 'parent' && concept === 'fullName') {
    concept = 'parentGuardianName';
    reasons.push(`Section “${person.heading}” is about your parent or guardian.`);
  } else if (person.kind !== 'self' && concept !== 'parentGuardianName') {
    return {
      ...base, target: null, confidence: score, level: 'low', unavailable: 'other-person',
      reasons: [`This looks like someone else’s details (section “${person.heading}”).`],
    };
  }

  // --- Resolve the concept to a concrete target ---
  let target: TargetKey;
  if (best.kind === 'custom') {
    target = best.target;
  } else if (concept && ADDRESS_FIELDS[concept]) {
    const resolved = resolveAddress(field, profile, ADDRESS_FIELDS[concept]!);
    target = resolved.target;
    reasons.push(resolved.reason);
    if (resolved.assumed) score = Math.min(score, config.assumptionCap);
  } else {
    target = CONCEPT_PATHS[concept!]!;
  }

  // --- Ambiguity: did a different target score almost as well? ---
  const runnerUp = candidates.slice(1).find((c) => !sameTarget(c, best));
  if (runnerUp && best.score - runnerUp.score < config.ambiguityGap) {
    score -= config.ambiguityPenalty;
    const runnerLabel = runnerUp.kind === 'custom' ? targetLabel(profile, runnerUp.target) : conceptLabel(profile, runnerUp.concept);
    reasons.push(`Could also be “${runnerLabel}”.`);
  }

  return mapWithTarget(field, profile, target, 'auto', score, reasons, config);
}

/**
 * Builds the final mapping once a target is known: looks up the value,
 * falls back if needed, formats it for the field, and sets the level.
 * Also used when the user picks a target by hand.
 */
export function mapWithTarget(
  field: FormField,
  profile: UserProfile,
  chosen: TargetKey,
  source: FieldMapping['source'],
  startScore: number,
  startReasons: string[],
  config: ConfidenceConfig = DEFAULT_CONFIDENCE,
): FieldMapping {
  let target = chosen;
  let score = startScore;
  const reasons = [...startReasons];
  const result = (extra: Partial<FieldMapping>): FieldMapping => {
    const confidence = clamp01(score);
    return {
      elementId: field.elementId,
      target,
      confidence,
      level: levelFor(confidence, config),
      reasons,
      sensitive: field.sensitive || isSensitiveTarget(profile, target),
      source,
      ...extra,
    };
  };

  let raw = resolveTargetValue(profile, target);
  const fallback = FALLBACKS[target];
  if (raw === undefined && fallback && resolveTargetValue(profile, fallback) !== undefined) {
    reasons.push(`You haven’t saved “${targetLabel(profile, target)}”, so your “${targetLabel(profile, fallback)}” is used instead.`);
    target = fallback;
    raw = resolveTargetValue(profile, fallback);
    score = Math.min(score, config.assumptionCap);
  }
  if (raw === undefined) {
    reasons.push(`Your profile has no “${targetLabel(profile, target)}” saved.`);
    return result({ unavailable: 'no-value' });
  }

  const formatted = formatValue(field, target, raw);
  if (!formatted.ok) {
    reasons.push(
      formatted.reason === 'no-option'
        ? 'None of the site’s choices match your saved value.'
        : `Your saved value is longer than this field allows (${field.maxLength} characters).`,
    );
    return result({ unavailable: formatted.reason });
  }
  reasons.push(...formatted.notes);
  if (formatted.assumed) score = Math.min(score, config.assumptionCap);
  return result({ value: formatted.value, displayValue: formatted.displayValue });
}

// ---------- Clues and candidates ----------

function collectClues(field: FormField, config: ConfidenceConfig): TextClue[] {
  const clues: TextClue[] = [];
  const add = (text: string | undefined, tokens: string[], weight: number, what: string, visible = true) => {
    if (!text || tokens.length === 0) return;
    // The label often IS the placeholder or the name; count each text once.
    if (clues.some((c) => c.tokens.join(' ') === tokens.join(' '))) return;
    clues.push({ tokens, weight, description: `${what} “${text}”`, visible });
  };

  const weights = config.attributeWeights;
  const labelTokens = field.labelSource === 'name' || field.labelSource === 'id' ? tokenizeIdentifier(field.label) : tokenize(field.label);
  const labelVisible = field.labelSource !== 'name' && field.labelSource !== 'id';
  add(field.label, labelTokens, config.labelSourceWeights[field.labelSource], LABEL_SOURCE_NAMES[field.labelSource], labelVisible);
  add(field.ariaLabel, tokenize(field.ariaLabel), weights.ariaLabel, 'Accessible label');
  add(field.placeholder, tokenize(field.placeholder), weights.placeholder, 'Placeholder');
  add(field.title, tokenize(field.title), weights.title, 'Tooltip');
  add(field.name, tokenizeIdentifier(field.name), weights.name, 'Field name', false);
  add(field.id, tokenizeIdentifier(field.id), weights.id, 'Field id', false);
  return clues;
}

/**
 * Scores one set of phrases against every clue. The best clue sets the
 * score; each additional clue that agrees strongly adds a small bonus.
 */
function scoreAgainstClues(
  clues: TextClue[],
  scoreTokens: (tokens: string[]) => number,
  targetName: string,
  config: ConfidenceConfig,
): { score: number; reasons: string[] } {
  let best = 0;
  let bestClue: TextClue | null = null;
  let agreeing = 0;
  for (const clue of clues) {
    const raw = scoreTokens(clue.tokens);
    if (raw >= 0.75) agreeing++;
    if (raw * clue.weight > best) {
      best = raw * clue.weight;
      bestClue = clue;
    }
  }
  if (!bestClue) return { score: 0, reasons: [] };

  const reasons = [`${bestClue.description} matches “${targetName}”.`];
  const bonus = Math.min(config.maxAgreementBonus, config.agreementBonus * Math.max(0, agreeing - 1));
  if (bonus > 0) reasons.push('Other attributes of the field agree.');
  return { score: best + bonus, reasons };
}

function scoreCandidates(field: FormField, profile: UserProfile, clues: TextClue[], config: ConfidenceConfig): Candidate[] {
  const candidates: Candidate[] = [];
  const autocompleteTokens = (field.autocomplete ?? '').toLowerCase().split(/\s+/);

  for (const concept of CONCEPTS) {
    // What the user SEES wins: "Emergency Phone" isn't your phone, even if
    // the id is "em-phone". Programmer ids don't get a veto ("user_full_name").
    if (clues.some((clue) => clue.visible && clue.tokens.some((word) => concept.exclude.has(word)))) continue;
    const name = conceptLabel(profile, concept.id);
    let { score, reasons } = scoreAgainstClues(clues, (tokens) => conceptScore(concept, tokens), name, config);

    const hint = concept.autocomplete.find((token) => autocompleteTokens.includes(token));
    if (hint && config.autocompleteScore > score) {
      score = config.autocompleteScore;
      reasons = [`The site marks this field as autocomplete="${hint}".`];
    }
    if (score === 0) continue;

    const fit = TYPE_FIT[field.type];
    if (fit?.concepts.includes(concept.id)) {
      score += config.typeMatchBonus;
      reasons.push(`The input type (${field.type}) fits.`);
    } else if (fit) {
      score -= fit.hard ? config.typeConflictPenalty : config.softTypeConflictPenalty;
      reasons.push(`The input type (${field.type}) doesn’t fit well.`);
    }
    if (field.type === 'textarea' && (concept.id === 'fullAddress' || concept.id === 'skills')) {
      score += config.agreementBonus;
    }
    candidates.push({ kind: 'concept', concept: concept.id, score, reasons });
  }

  for (const custom of profile.customFields) {
    const phrase = tokenize(custom.label);
    const { score, reasons } = scoreAgainstClues(clues, (tokens) => phraseScore(tokens, phrase), `Custom: ${custom.label}`, config);
    if (score > 0) candidates.push({ kind: 'custom', target: `custom:${custom.id}`, score, reasons });
  }
  return candidates;
}

function sameTarget(a: Candidate, b: Candidate): boolean {
  if (a.kind === 'custom') return b.kind === 'custom' && a.target === b.target;
  return b.kind === 'concept' && a.concept === b.concept;
}

function conceptLabel(profile: UserProfile, concept: ConceptId): string {
  const path = CONCEPT_PATHS[concept];
  if (path) return targetLabel(profile, path);
  return targetLabel(profile, `currentAddress.${ADDRESS_FIELDS[concept]}` as TargetKey).replace(/^Current address: /, '');
}

/**
 * Picks current vs permanent address. Uses nearby text when it says which;
 * otherwise only accepts the choice confidently when it can't matter
 * (just one address saved, or both are the same).
 */
function resolveAddress(
  field: FormField,
  profile: UserProfile,
  part: string,
): { target: TargetKey; reason: string; assumed: boolean } {
  const context = detectAddressSection(field);
  if (context) {
    const title = context.section === 'permanentAddress' ? 'permanent' : 'current';
    return { target: `${context.section}.${part}` as TargetKey, reason: `Uses your ${title} address because of the ${context.evidence}.`, assumed: false };
  }

  const current = resolveTargetValue(profile, `currentAddress.${part}` as TargetKey);
  const permanent = resolveTargetValue(profile, `permanentAddress.${part}` as TargetKey);
  if (current === undefined && permanent !== undefined) {
    return { target: `permanentAddress.${part}` as TargetKey, reason: 'Only your permanent address has this value.', assumed: false };
  }
  if (current === permanent) {
    return { target: `currentAddress.${part}` as TargetKey, reason: 'Nothing says which address; your two addresses agree here anyway.', assumed: false };
  }
  return {
    target: `currentAddress.${part}` as TargetKey,
    reason: 'Nothing near this field says which address it wants; assuming your current address.',
    assumed: true,
  };
}
