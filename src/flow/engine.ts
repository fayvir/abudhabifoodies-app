/**
 * Pure discovery-flow logic ported from the website (src/lib/discovery/flow.ts
 * and DiscoveryFlow.tsx). No React, no fetch. The site walks the same tree to
 * build the snapshot, so findStartQuestion/findNextQuestion and the snapshot
 * keys must stay identical to flow.ts.
 */
import type {
  Availability,
  DiscoveryOption,
  DiscoveryQuestionWithOptions as Q,
  DiscoverySnapshot,
  ResultCard,
  Selections,
} from '../api/types';

export const SKIP_LABEL = 'No preference';

const VIBE_PREFIX = 'what_kind_of_vibe_are_you_after';
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function weekdayIndex(value: string): number {
  const v = value.toLowerCase();
  return WEEKDAYS.findIndex((d) => v === d || v.startsWith(d.slice(0, 3)));
}

/** flow.ts findStartQuestion */
export function findStartQuestion(questions: Q[]): Q | null {
  if (questions.length === 0) return null;
  const targeted = new Set<string>();
  for (const q of questions) for (const o of q.options) if (o.next_question_id) targeted.add(o.next_question_id);
  return questions.find((q) => !targeted.has(q.id)) ?? questions[0];
}

/** DiscoveryFlow.tsx:123-127 */
export function sortOptionsForQuestion(question: Pick<Q, 'key'>, options: DiscoveryOption[]): DiscoveryOption[] {
  if (question.key === 'budget') return [...options];
  if (options.filter((o) => weekdayIndex(o.value) >= 0).length >= 4) {
    return [...options].sort((a, b) => {
      const ia = weekdayIndex(a.value);
      const ib = weekdayIndex(b.value);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }
  return [...options].sort((a, b) => a.label.localeCompare(b.label));
}

/** flow.ts findNextQuestion */
export function findNextQuestion(
  questions: Q[],
  from: Q,
  chosen: DiscoveryOption | null,
  asked: ReadonlySet<string>,
): Q | null {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const hasBranching = questions.some((q) => q.options.some((o) => o.next_question_id !== null && byId.has(o.next_question_id)));

  if (hasBranching) {
    if (chosen) {
      const target = chosen.next_question_id ? byId.get(chosen.next_question_id) : undefined;
      return target && !asked.has(target.id) ? target : null;
    }
    const targets = new Set<string>();
    for (const o of from.options) if (o.next_question_id !== null && byId.has(o.next_question_id)) targets.add(o.next_question_id);
    if (targets.size === 1) {
      const target = byId.get(Array.from(targets)[0]);
      return target && !asked.has(target.id) ? target : null;
    }
    return null;
  }

  const idx = questions.findIndex((q) => q.id === from.id);
  for (let i = idx + 1; i < questions.length; i += 1) {
    if (!asked.has(questions[i].id)) return questions[i];
  }
  return null;
}

/** gating.ts:20-24 */
export function isGatedQuestion(q: Q): boolean {
  return (
    q.key === 'budget' ||
    q.options.some((o) => o.filter_field === 'price_range') ||
    q.key.startsWith(VIBE_PREFIX)
  );
}

/** DiscoveryFlow.tsx:474-477 — fail open, never an empty list. */
export function applyAvailability(options: DiscoveryOption[], availability: Availability): DiscoveryOption[] {
  if (!availability.gated) return options;
  const filtered = options.filter((o) => availability.available.includes(o.value));
  return filtered.length > 0 ? filtered : options;
}

export function isRefinerQuestion(q: Q): boolean {
  return q.role !== 'primary';
}

/** DiscoveryFlow.tsx:145-156 */
export function chevronOptionIds(allOptions: DiscoveryOption[]): Set<string> {
  const counts = new Map<string, number>();
  for (const o of allOptions) {
    const k = o.next_question_id ?? '__no_branch__';
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (counts.size <= 1) return new Set();
  let modeKey = '';
  let modeCount = -1;
  counts.forEach((c, k) => {
    if (c > modeCount) {
      modeKey = k;
      modeCount = c;
    }
  });
  if (modeCount / allOptions.length < 0.5) return new Set();
  return new Set(allOptions.filter((o) => (o.next_question_id ?? '__no_branch__') !== modeKey).map((o) => o.id));
}

export function selectOption(
  selections: Selections,
  question: Pick<Q, 'key'>,
  option: Pick<DiscoveryOption, 'value'>,
): Selections {
  return { ...selections, [question.key]: option.value };
}

/** resolve.ts:124-137 */
export function buildQueryLabel(questions: Q[], selections: Selections): string {
  const labels = new Map<string, string>();
  for (const q of questions) for (const o of q.options) labels.set(`${q.key}:${o.value}`, o.label);
  return Object.entries(selections)
    .filter(([, value]) => value)
    .map(([key, value]) => labels.get(`${key}:${value}`) ?? value)
    .join(', ');
}

/** flow.ts selectionsKey: keys sorted, `key=value` joined by `&`, both URI-encoded. Must match the site. */
export function selectionsKey(selections: Selections): string {
  return Object.keys(selections)
    .filter((k) => selections[k])
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(selections[k])}`)
    .join('&');
}

/** flow.ts availabilityKey. Must match the site. */
export function availabilityKey(questionKey: string, selections: Selections): string {
  return `${encodeURIComponent(questionKey)}|${selectionsKey(selections)}`;
}

/** Which options of `question` the snapshot says to show; missing means show all (fail open). */
export function snapshotAvailability(snapshot: DiscoverySnapshot, question: Q, selections: Selections): Availability {
  if (!isGatedQuestion(question)) return { gated: false };
  const available = snapshot.availability[availabilityKey(question.key, selections)];
  return Array.isArray(available) ? { gated: true, available } : { gated: false };
}

export type SnapshotResult =
  | { kind: 'pick'; picks: ResultCard[]; pickIds: string[] }
  | { kind: 'no_match'; note: string }
  /** The answers aren't in the snapshot (it doesn't match this flow). */
  | { kind: 'missing' };

/**
 * resolve.ts resolveTier1, on the phone: one random editorial card, then one
 * random live sponsored card if any. The site already chose the candidates.
 */
export function resolveFromSnapshot(
  snapshot: DiscoverySnapshot,
  selections: Selections,
  random: () => number = Math.random,
): SnapshotResult {
  const entry = snapshot.results[selectionsKey(selections)];
  if (!entry) return { kind: 'missing' };
  const choose = (ids: string[] | undefined): string | null => {
    const usable = (ids ?? []).filter((id) => snapshot.cards[id]);
    return usable.length > 0 ? usable[Math.floor(random() * usable.length)] : null;
  };
  const pickIds = [choose(entry.editorial), choose(entry.sponsored)].filter((id): id is string => id !== null);
  if (pickIds.length === 0) return { kind: 'no_match', note: snapshot.no_match_note };
  return { kind: 'pick', picks: pickIds.map((id) => snapshot.cards[id]), pickIds };
}
