import questionsFixture from '../../api/__fixtures__/questions.json';
import type { Availability, DiscoveryOption, DiscoveryQuestionWithOptions } from '../../api/types';
import { opt, pick, question, snapshot } from '../../testing/builders';
import {
  SKIP_LABEL,
  applyAvailability,
  availabilityKey,
  resolveFromSnapshot,
  selectionsKey,
  snapshotAvailability,
  buildQueryLabel,
  chevronOptionIds,
  findNextQuestion,
  findStartQuestion,
  isGatedQuestion,
  isRefinerQuestion,
  selectOption,
  sortOptionsForQuestion,
} from '../engine';

// Typed view of the real fixture (compile-time check that api/types matches the live JSON).
const live: DiscoveryQuestionWithOptions[] = questionsFixture.questions as DiscoveryQuestionWithOptions[];
const byKey = (key: string): DiscoveryQuestionWithOptions => {
  const q = live.find((x) => x.key === key);
  if (!q) throw new Error(`fixture has no ${key}`);
  return q;
};
const values = (options: DiscoveryOption[]): string[] => options.map((o) => o.value);
const NONE: ReadonlySet<string> = new Set();

describe('findStartQuestion', () => {
  it('picks the one question no option points to in the live fixture (cuisine, not the array-first vibe_mid)', () => {
    expect(live[0].key).not.toBe('cuisine'); // proves it is not just "first in array"
    expect(findStartQuestion(live)?.key).toBe('cuisine');
  });

  it('returns null for an empty list', () => {
    expect(findStartQuestion([])).toBeNull();
  });

  it('returns the first untargeted question in array order when there are several roots', () => {
    const a = question('a', 'a', [opt('x')]);
    const b = question('b', 'b', [opt('y')]);
    expect(findStartQuestion([a, b])?.key).toBe('a');
    expect(findStartQuestion([b, a])?.key).toBe('b');
  });

  it('falls back to the first question when the graph is fully cyclic', () => {
    // DiscoveryFlow.tsx:336  `?? qs[0]`
    const a = question('a', 'a', [opt('x', { next_question_id: 'b' })]);
    const b = question('b', 'b', [opt('y', { next_question_id: 'a' })]);
    expect(findStartQuestion([a, b])?.key).toBe('a');
  });

  it('finds the root of a graph whose root is not first in the array', () => {
    const leaf = question('leaf', 'leaf', [opt('l')]);
    const mid = question('mid', 'mid', [opt('m', { next_question_id: 'leaf' })]);
    const root = question('root', 'root', [opt('r', { next_question_id: 'mid' })]);
    expect(findStartQuestion([leaf, mid, root])?.key).toBe('root');
  });
});

describe('sortOptionsForQuestion', () => {
  it('keeps server order for budget even when it is not alphabetical', () => {
    // DiscoveryFlow.tsx:123 `if (questionKey === 'budget') return options`
    const budget = byKey('budget');
    expect(values(sortOptionsForQuestion(budget, budget.options))).toEqual(['budget_1', 'budget_2', 'budget_3']);
    expect(sortOptionsForQuestion(budget, budget.options).map((o) => o.label)).toEqual(['Low', 'Mid', 'High']);
  });

  it('does not reorder budget options that arrive in another order', () => {
    const b = question('b', 'budget', [opt('z', { label: 'Zed' }), opt('a', { label: 'Aye' })]);
    expect(values(sortOptionsForQuestion(b, b.options))).toEqual(['z', 'a']);
  });

  it('sorts every other question alphabetically by label', () => {
    const cuisine = byKey('cuisine');
    const sorted = sortOptionsForQuestion(cuisine, cuisine.options).map((o) => o.label);
    expect(sorted).toEqual([...cuisine.options.map((o) => o.label)].sort((a, b) => a.localeCompare(b)));
    expect(sorted[0]).toBe('American');
  });

  it('sorts by label, not by value (Emirati has value "turkish")', () => {
    const cuisine = byKey('cuisine');
    const labels = sortOptionsForQuestion(cuisine, cuisine.options).map((o) => o.label);
    expect(labels.indexOf('Emirati')).toBeLessThan(labels.indexOf('Filipino'));
  });

  it('sorts weekday options Monday to Sunday regardless of label order', () => {
    const days = ['sunday', 'friday', 'monday', 'wednesday', 'saturday', 'tuesday', 'thursday'];
    const q = question('d', 'day', days.map((d) => opt(d, { label: d.toUpperCase() })));
    expect(values(sortOptionsForQuestion(q, q.options))).toEqual([
      'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    ]);
  });

  it('recognises weekdays by 3-letter prefix (mon, tue ...)', () => {
    const q = question('d', 'day', ['fri', 'mon', 'thu', 'tue'].map((d) => opt(d)));
    expect(values(sortOptionsForQuestion(q, q.options))).toEqual(['mon', 'tue', 'thu', 'fri']);
  });

  it('treats an option set with fewer than 4 weekday values as ordinary (alphabetical)', () => {
    const q = question('d', 'x', [opt('v1', { label: 'Zebra' }), opt('monday', { label: 'Monday' }), opt('friday', { label: 'Friday' }), opt('v2', { label: 'Apple' })]);
    expect(sortOptionsForQuestion(q, q.options).map((o) => o.label)).toEqual(['Apple', 'Friday', 'Monday', 'Zebra']);
  });

  it('does not mutate the input array', () => {
    const cuisine = byKey('cuisine');
    const before = cuisine.options.map((o) => o.id);
    sortOptionsForQuestion(cuisine, cuisine.options);
    expect(cuisine.options.map((o) => o.id)).toEqual(before);
  });

  it('sorts the availability-filtered subset it is given, not the full question', () => {
    const vibe = byKey('what_kind_of_vibe_are_you_after_low');
    const subset = vibe.options.filter((o) => ['trendy', 'casual'].includes(o.value));
    expect(sortOptionsForQuestion(vibe, subset)).toHaveLength(2);
  });
});

describe('findNextQuestion', () => {
  it('follows next_question_id for the chosen option (live fixture: cuisine -> budget)', () => {
    const cuisine = byKey('cuisine');
    const next = findNextQuestion(live, cuisine, cuisine.options[0], new Set([cuisine.id]));
    expect(next?.key).toBe('budget');
  });

  it('follows each budget option to its own vibe question', () => {
    const budget = byKey('budget');
    const asked = new Set([byKey('cuisine').id, budget.id]);
    const keys = budget.options.map((o) => findNextQuestion(live, budget, o, asked)?.key);
    expect(keys).toEqual([
      'what_kind_of_vibe_are_you_after_low',
      'what_kind_of_vibe_are_you_after_mid',
      'what_kind_of_vibe_are_you_after_high',
    ]);
  });

  it('ends the flow (null) after a vibe question with no links', () => {
    const vibe = byKey('what_kind_of_vibe_are_you_after_low');
    expect(findNextQuestion(live, vibe, vibe.options[0], new Set([vibe.id]))).toBeNull();
  });

  describe('branching graph', () => {
    const brunchDay = question('q-day', 'day', [opt('monday')]);
    const budget = question('q-budget', 'budget', [opt('budget_1')]);
    const root = question('q-root', 'cuisine', [
      opt('italian', { next_question_id: 'q-budget' }),
      opt('brunch', { next_question_id: 'q-day' }),
      opt('dead_end'),
    ]);
    const graph = [root, budget, brunchDay];
    const asked = new Set(['q-root']);

    it('sends two options to different next questions', () => {
      expect(findNextQuestion(graph, root, root.options[0], asked)?.id).toBe('q-budget');
      expect(findNextQuestion(graph, root, root.options[1], asked)?.id).toBe('q-day');
    });

    it('ends early when the chosen option has no link, even though later questions exist (no linear fallthrough)', () => {
      expect(findNextQuestion(graph, root, root.options[2], asked)).toBeNull();
    });

    it('ends the flow when the link points to a question that is not loaded (inactive/missing)', () => {
      const ghost = question('g', 'g', [opt('x', { next_question_id: 'missing' }), opt('y', { next_question_id: 'q-budget' })]);
      expect(findNextQuestion([ghost, budget], ghost, ghost.options[0], new Set(['g']))).toBeNull();
    });

    it('ends the flow instead of looping back to an already-asked question', () => {
      const a = question('a', 'a', [opt('x', { next_question_id: 'b' })]);
      const b = question('b', 'b', [opt('y', { next_question_id: 'a' })]);
      expect(findNextQuestion([a, b], b, b.options[0], new Set(['a', 'b']))).toBeNull();
    });

    it('chains three deep following only the chosen links', () => {
      const c = question('c', 'c', [opt('end')]);
      const b = question('b', 'b', [opt('go', { next_question_id: 'c' })]);
      const a = question('a', 'a', [opt('go', { next_question_id: 'b' })]);
      const all = [a, b, c];
      const first = findNextQuestion(all, a, a.options[0], new Set(['a']));
      expect(first?.id).toBe('b');
      const second = findNextQuestion(all, b, b.options[0], new Set(['a', 'b']));
      expect(second?.id).toBe('c');
      expect(findNextQuestion(all, c, c.options[0], new Set(['a', 'b', 'c']))).toBeNull();
    });
  });

  describe('skip (chosen = null) in branching mode', () => {
    it('goes to the single distinct target when all linked options agree', () => {
      const t = question('t', 't', [opt('z')]);
      const s = question('s', 's', [opt('a', { next_question_id: 't' }), opt('b', { next_question_id: 't' }), opt('c')]);
      expect(findNextQuestion([s, t], s, null, new Set(['s']))?.id).toBe('t');
    });

    it('ends the flow when linked options point at different targets', () => {
      const budget = byKey('budget');
      expect(findNextQuestion(live, budget, null, new Set([budget.id]))).toBeNull();
    });

    it('ends the flow when the single target was already asked', () => {
      const t = question('t', 't', [opt('z')]);
      const s = question('s', 's', [opt('a', { next_question_id: 't' })]);
      expect(findNextQuestion([s, t], s, null, new Set(['s', 't']))).toBeNull();
    });
  });

  describe('linear mode (no links anywhere)', () => {
    const one = question('1', 'one', [opt('a')], { step_order: 1 });
    const two = question('2', 'two', [opt('b')], { step_order: 2 });
    const three = question('3', 'three', [opt('c')], { step_order: 3 });
    const all = [one, two, three];

    it('moves to the next question in array order', () => {
      expect(findNextQuestion(all, one, one.options[0], new Set(['1']))?.id).toBe('2');
    });

    it('skips questions already asked', () => {
      expect(findNextQuestion(all, one, one.options[0], new Set(['1', '2']))?.id).toBe('3');
    });

    it('ends after the last question', () => {
      expect(findNextQuestion(all, three, three.options[0], new Set(['1', '2', '3']))).toBeNull();
    });

    it('also advances on skip', () => {
      expect(findNextQuestion(all, one, null, new Set(['1']))?.id).toBe('2');
    });
  });

  it('returns null for an empty question list', () => {
    const lonely = question('x', 'x', [opt('a')]);
    expect(findNextQuestion([], lonely, lonely.options[0], NONE)).toBeNull();
  });
});

describe('isGatedQuestion', () => {
  it('gates budget', () => {
    expect(isGatedQuestion(byKey('budget'))).toBe(true);
  });

  it.each(['low', 'mid', 'high'])('gates the %s vibe variant by key prefix', (suffix) => {
    expect(isGatedQuestion(byKey(`what_kind_of_vibe_are_you_after_${suffix}`))).toBe(true);
  });

  it('gates any question whose key starts with the vibe prefix, even an unseen variant', () => {
    expect(isGatedQuestion(question('v', 'what_kind_of_vibe_are_you_after_ultra', [opt('a')]))).toBe(true);
  });

  it('gates a question with a price_range filter option even under another key', () => {
    // Same gating rule as the website.
    const q = question('p', 'price', [opt('x', { filter_field: 'price_range', filter_value: '1' })]);
    expect(isGatedQuestion(q)).toBe(true);
  });

  it('never gates the root cuisine question (it mixes cuisines with sub-flows)', () => {
    expect(isGatedQuestion(byKey('cuisine'))).toBe(false);
  });

  it('does not gate a vibe-like key that does not start with the prefix', () => {
    expect(isGatedQuestion(question('v', 'the_what_kind_of_vibe_are_you_after', [opt('a')]))).toBe(false);
  });
});

describe('applyAvailability', () => {
  // Fail-open rules: DiscoveryFlow.tsx:474 (gated !== true) and :477
  // (filtered.length > 0 ? filtered : q.options). The website NEVER renders an empty
  // chip list: even gated:true with an empty/non-matching list shows every option.
  const options = [opt('budget_1'), opt('budget_2'), opt('budget_3')];

  it('shows everything when not gated', () => {
    const a: Availability = { gated: false };
    expect(applyAvailability(options, a)).toEqual(options);
  });

  it('keeps only options whose value the server listed, preserving input order', () => {
    expect(values(applyAvailability(options, { gated: true, available: ['budget_3', 'budget_1'] }))).toEqual(['budget_1', 'budget_3']);
  });

  it('shows everything when gated but the list is empty (never filters to zero)', () => {
    expect(applyAvailability(options, { gated: true, available: [] })).toEqual(options);
  });

  it('shows everything when gated but no listed value matches any option', () => {
    expect(applyAvailability(options, { gated: true, available: ['nope'] })).toEqual(options);
  });

  it('keeps a single-option result (the server narrowed to one)', () => {
    expect(values(applyAvailability(options, { gated: true, available: ['budget_2'] }))).toEqual(['budget_2']);
  });

  it('does not mutate the input', () => {
    const copy = [...options];
    applyAvailability(options, { gated: true, available: ['budget_1'] });
    expect(options).toEqual(copy);
  });
});

describe('isRefinerQuestion (Skip chip rule)', () => {
  // DiscoveryFlow.tsx:175 `isRefiner &&` with isRefiner = role !== 'primary'
  it('is true for budget and every vibe variant in the live fixture', () => {
    for (const key of ['budget', 'what_kind_of_vibe_are_you_after_low', 'what_kind_of_vibe_are_you_after_mid', 'what_kind_of_vibe_are_you_after_high']) {
      expect(isRefinerQuestion(byKey(key))).toBe(true);
    }
  });

  it('is false for the primary cuisine question', () => {
    expect(isRefinerQuestion(byKey('cuisine'))).toBe(false);
  });

  it('is decided by role alone, not by key', () => {
    expect(isRefinerQuestion(question('r', 'anything', [opt('a')], { role: 'refiner' }))).toBe(true);
    expect(isRefinerQuestion(question('p', 'budget', [opt('a')], { role: 'primary' }))).toBe(false);
  });

  it('exposes the skip bubble text used by the website', () => {
    expect(SKIP_LABEL).toBe('No preference'); // DiscoveryFlow.tsx:559
  });
});

describe('chevronOptionIds', () => {
  it('flags nothing when every option goes to the same place', () => {
    const cuisine = byKey('cuisine');
    expect(chevronOptionIds(cuisine.options).size).toBe(0);
  });

  it('flags nothing when every option branches somewhere different (no majority)', () => {
    const budget = byKey('budget');
    expect(chevronOptionIds(budget.options).size).toBe(0);
  });

  it('flags the minority options when one target covers at least half', () => {
    const a = opt('a', { next_question_id: 'budget' });
    const b = opt('b', { next_question_id: 'budget' });
    const c = opt('c', { next_question_id: 'day' });
    const d = opt('d');
    expect(chevronOptionIds([a, b, c, d])).toEqual(new Set([c.id, d.id]));
  });

  it('flags nothing when the most common target is under 50%', () => {
    const o = [opt('a', { next_question_id: 'x' }), opt('b', { next_question_id: 'x' }), opt('c', { next_question_id: 'y' }), opt('d', { next_question_id: 'z' }, ), opt('e', { next_question_id: 'w' })];
    expect(chevronOptionIds(o).size).toBe(0);
  });
});

describe('selectOption (selections payload)', () => {
  it('records the option value under the question key', () => {
    const cuisine = byKey('cuisine');
    expect(selectOption({}, cuisine, cuisine.options[0])).toEqual({ cuisine: cuisine.options[0].value });
  });

  it('adds to existing selections without mutating them', () => {
    const before = { cuisine: 'arabic' };
    const after = selectOption(before, byKey('budget'), byKey('budget').options[1]);
    expect(after).toEqual({ cuisine: 'arabic', budget: 'budget_2' });
    expect(before).toEqual({ cuisine: 'arabic' });
  });

  it('uses the option VALUE, not the label or id', () => {
    const o = opt('turkish', { label: 'Emirati' });
    const q = question('q', 'cuisine', [o]);
    expect(selectOption({}, q, q.options[0])).toEqual({ cuisine: 'turkish' });
  });

  it('a skipped question simply has no entry (callers pass selections through unchanged)', () => {
    const s = { cuisine: 'arabic' };
    expect(Object.keys(s)).not.toContain('budget');
  });
});

describe('buildQueryLabel', () => {
  // Same as the website's selections label: option label, comma-joined,
  // in selection order; falls back to the raw value; empty values dropped.
  it('joins the option labels in selection order', () => {
    expect(buildQueryLabel(live, { cuisine: 'arabic', budget: 'budget_2', what_kind_of_vibe_are_you_after_mid: 'casual_relaxed' })).toBe('Arabic, Mid, Casual & Relaxed');
  });

  it('uses the label, not the value, even when they differ (Emirati is "turkish")', () => {
    expect(buildQueryLabel(live, { cuisine: 'turkish' })).toBe('Emirati');
  });

  it('falls back to the raw value for an unknown option', () => {
    expect(buildQueryLabel(live, { cuisine: 'martian' })).toBe('martian');
  });

  it('falls back to the raw value for an unknown question key', () => {
    expect(buildQueryLabel(live, { mystery: 'abc' })).toBe('abc');
  });

  it('drops empty values', () => {
    expect(buildQueryLabel(live, { cuisine: 'arabic', budget: '' })).toBe('Arabic');
  });

  it('is an empty string for no selections', () => {
    expect(buildQueryLabel(live, {})).toBe('');
  });

  it('looks options up by question key + value, so equal values under different keys do not collide', () => {
    const q1 = question('1', 'k1', [opt('same', { label: 'First' })]);
    const q2 = question('2', 'k2', [opt('same', { label: 'Second' })]);
    expect(buildQueryLabel([q1, q2], { k2: 'same', k1: 'same' })).toBe('Second, First');
  });
});

// The site builds these exact strings (src/lib/discovery/flow.ts, pinned by
// scripts/test-discovery-flow.ts there). Both sides test the same literals.
describe('snapshot keys (shared with the site)', () => {
  it('selectionsKey sorts keys and joins key=value with &', () => {
    expect(selectionsKey({ what_kind_of_vibe_are_you_after_low: 'casual', cuisine: 'arabic', budget: 'budget_1' })).toBe(
      'budget=budget_1&cuisine=arabic&what_kind_of_vibe_are_you_after_low=casual',
    );
  });

  it('selectionsKey URI-encodes and drops empty values', () => {
    expect(selectionsKey({ b: 'x&y=z', a: '', c: 'é' })).toBe('b=x%26y%3Dz&c=%C3%A9');
    expect(selectionsKey({})).toBe('');
  });

  it('availabilityKey is question key, a bar, then the answers so far', () => {
    expect(availabilityKey('what_kind_of_vibe_are_you_after_low', { cuisine: 'arabic', budget: 'budget_1' })).toBe(
      'what_kind_of_vibe_are_you_after_low|budget=budget_1&cuisine=arabic',
    );
    expect(availabilityKey('budget', { cuisine: 'arabic' })).toBe('budget|cuisine=arabic');
  });
});

describe('snapshotAvailability', () => {
  const budget = question('q-b', 'budget', [opt('budget_1'), opt('budget_2')], { role: 'refiner' });
  const plain = question('q-p', 'cuisine', [opt('arabic')]);

  it('returns the listed values for a gated question', () => {
    const snap = snapshot([budget], { availability: { 'budget|cuisine=arabic': ['budget_2'] } });
    expect(snapshotAvailability(snap, budget, { cuisine: 'arabic' })).toEqual({ gated: true, available: ['budget_2'] });
  });

  it('fails open when the snapshot has no entry', () => {
    expect(snapshotAvailability(snapshot([budget]), budget, { cuisine: 'arabic' })).toEqual({ gated: false });
  });

  it('never gates a question the site does not gate', () => {
    const snap = snapshot([plain], { availability: { 'cuisine|': ['nothing'] } });
    expect(snapshotAvailability(snap, plain, {})).toEqual({ gated: false });
  });
});

describe('resolveFromSnapshot', () => {
  const a = pick({ restaurant_name: 'A', restaurant_id: 'r-a' });
  const b = pick({ restaurant_name: 'B', restaurant_id: 'r-b' });
  const s = pick({ restaurant_name: 'S', restaurant_id: 'r-s', is_sponsored: true, advertiser_name: 'Ad Co' });
  const snap = snapshot([], {
    results: {
      'cuisine=arabic': { editorial: ['p-a', 'p-b'], sponsored: [] },
      'cuisine=thai': { editorial: ['p-a'], sponsored: ['p-s'] },
      'cuisine=french': { editorial: [], sponsored: [] },
      'cuisine=korean': { editorial: ['p-gone'], sponsored: [] },
    },
    cards: { 'p-a': a, 'p-b': b, 'p-s': s },
  });

  it('picks one editorial card at random', () => {
    expect(resolveFromSnapshot(snap, { cuisine: 'arabic' }, () => 0)).toEqual({ kind: 'pick', picks: [a], pickIds: ['p-a'] });
    expect(resolveFromSnapshot(snap, { cuisine: 'arabic' }, () => 0.99)).toEqual({ kind: 'pick', picks: [b], pickIds: ['p-b'] });
  });

  it('adds a sponsored card after the editorial one', () => {
    expect(resolveFromSnapshot(snap, { cuisine: 'thai' }, () => 0)).toEqual({
      kind: 'pick',
      picks: [a, s],
      pickIds: ['p-a', 'p-s'],
    });
  });

  it('is no_match with the snapshot note when the combination has no picks', () => {
    expect(resolveFromSnapshot(snap, { cuisine: 'french' })).toEqual({ kind: 'no_match', note: snap.no_match_note });
  });

  it('skips pick ids with no card', () => {
    expect(resolveFromSnapshot(snap, { cuisine: 'korean' })).toEqual({ kind: 'no_match', note: snap.no_match_note });
  });

  it('is missing when the answers are not in the snapshot at all', () => {
    expect(resolveFromSnapshot(snap, { cuisine: 'mexican' })).toEqual({ kind: 'missing' });
  });
});
