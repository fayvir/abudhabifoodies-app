/** Pure discovery-flow logic ported from the website's DiscoveryFlow.tsx. No React, no fetch. */
import type {
  Availability,
  DiscoveryOption,
  DiscoveryQuestionWithOptions as Q,
  Selections,
} from '../api/types';

export const SKIP_LABEL = 'No preference';

const VIBE_PREFIX = 'what_kind_of_vibe_are_you_after';
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function weekdayIndex(value: string): number {
  const v = value.toLowerCase();
  return WEEKDAYS.findIndex((d) => v === d || v.startsWith(d.slice(0, 3)));
}

/** DiscoveryFlow.tsx:325-336 */
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

/** DiscoveryFlow.tsx:423-453 */
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
