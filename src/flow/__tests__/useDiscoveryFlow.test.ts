import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import { AppState } from 'react-native';

import * as client from '../../api/client';
import type { DiscoveryOption, DiscoveryQuestionWithOptions as Q, DiscoverySnapshot } from '../../api/types';
import { SNAPSHOT_STORAGE_KEY } from '../../snapshot/store';
import { opt, pick, question, snapshot } from '../../testing/builders';
import { FLOW_PACING } from '../pacing';
import { useDiscoveryFlow } from '../useDiscoveryFlow';
import { __resetSnapshotForTests } from '../../snapshot/useSnapshot';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../api/client', () => ({
  SNAPSHOT_VERSION: 1,
  getSnapshot: jest.fn(),
  trackFlowEvent: jest.fn(),
  reportCompletion: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

const api = jest.mocked(client);
const uuid = jest.mocked(randomUUID);

const VIBE_KEY = 'what_kind_of_vibe_are_you_after_low';
const FALAFEL = pick();
const SUSHI = pick({ restaurant_name: 'Sushi Bar', restaurant_id: 'rest-2' });

/** cuisine (primary, labels deliberately unsorted) -> budget (refiner) -> vibe (refiner). */
function graph(): Q[] {
  const cuisine = question('q-cuisine', 'cuisine', [
    opt('b', { label: 'Zebra grill', next_question_id: 'q-budget' }),
    opt('a', { label: 'Apple cafe', next_question_id: 'q-budget' }),
  ], { label: 'What are you in the mood for?' });
  const budget = question('q-budget', 'budget', [
    opt('budget_1', { label: 'Low', next_question_id: 'q-vibe' }),
    opt('budget_2', { label: 'Mid', next_question_id: 'q-vibe' }),
    opt('budget_3', { label: 'High', next_question_id: 'q-vibe' }),
  ], { role: 'refiner', label: 'Budget?' });
  const vibe = question('q-vibe', VIBE_KEY, [
    opt('trendy', { label: 'Trendy' }),
    opt('casual', { label: 'Casual' }),
  ], { role: 'refiner', label: 'Vibe?' });
  return [cuisine, budget, vibe];
}

function fixture(questions: Q[], overrides: Partial<DiscoverySnapshot> = {}): DiscoverySnapshot {
  return snapshot(questions, {
    results: {
      [`budget=budget_2&cuisine=a&${VIBE_KEY}=trendy`]: { editorial: ['p-falafel'], sponsored: [] },
      [`budget=budget_1&cuisine=b&${VIBE_KEY}=casual`]: { editorial: ['p-sushi'], sponsored: [] },
      [`cuisine=a&${VIBE_KEY}=trendy`]: { editorial: ['p-falafel'], sponsored: [] },
      [`budget=budget_2&cuisine=a&${VIBE_KEY}=casual`]: { editorial: [], sponsored: [] },
    },
    cards: { 'p-falafel': FALAFEL, 'p-sushi': SUSHI },
    ...overrides,
  });
}

function optionOf(qs: Q[], qKey: string, value: string): DiscoveryOption {
  const o = qs.find((q) => q.key === qKey)?.options.find((x) => x.value === value);
  if (!o) throw new Error('fixture option missing');
  return o;
}

let qs: Q[];
let snap: DiscoverySnapshot;

beforeEach(async () => {
  __resetSnapshotForTests();
  // Not resetAllMocks: that also wipes the AsyncStorage mock's in-memory store.
  jest.clearAllMocks();
  api.getSnapshot.mockReset();
  api.trackFlowEvent.mockReset();
  api.reportCompletion.mockReset();
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
  await AsyncStorage.clear();
  qs = graph();
  snap = fixture(qs);
  let n = 0;
  uuid.mockImplementation(() => `session-${(n += 1)}`);
  api.getSnapshot.mockResolvedValue({ ok: true, data: snap });
  api.trackFlowEvent.mockResolvedValue(undefined);
  api.reportCompletion.mockResolvedValue(undefined);
});

async function ready() {
  const hook = await renderHook(() => useDiscoveryFlow());
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  return hook;
}

type Hook = Awaited<ReturnType<typeof ready>>;

async function answerAs(hook: Hook, qKey: string, value: string) {
  await act(async () => {
    hook.result.current.answer(optionOf(qs, qKey, value));
  });
}

describe('useDiscoveryFlow loading', () => {
  it('is loading until the snapshot arrives, then shows the start question', async () => {
    let release: (v: { ok: true; data: DiscoverySnapshot }) => void = () => undefined;
    api.getSnapshot.mockReturnValueOnce(new Promise((r) => { release = r; }));
    const hook = await renderHook(() => useDiscoveryFlow());
    expect(hook.result.current.status).toBe('loading');
    await act(async () => release({ ok: true, data: snap }));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(api.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it('shows the start question with its options sorted alphabetically by label', async () => {
    const { result } = await ready();
    expect(result.current.question?.key).toBe('cuisine');
    expect(result.current.options.map((o) => o.label)).toEqual(['Apple cafe', 'Zebra grill']);
  });

  it('starts from the stored snapshot without waiting for the download', async () => {
    await AsyncStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify({ fetchedAt: Date.now(), snapshot: snap }));
    api.getSnapshot.mockReturnValue(new Promise(() => undefined));
    const { result } = await ready();
    expect(result.current.question?.key).toBe('cuisine');
  });

  it('reports a load error with no snapshot at all, and retry downloads again', async () => {
    api.getSnapshot.mockResolvedValueOnce({ ok: false, message: 'offline' });
    const hook = await renderHook(() => useDiscoveryFlow());
    await waitFor(() => expect(hook.result.current.status).toBe('load_error'));
    expect(hook.result.current.loadError).toBeTruthy();
    expect(hook.result.current.question).toBeNull();

    await act(async () => {
      hook.result.current.retry();
    });
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(api.getSnapshot).toHaveBeenCalledTimes(2);
  });

  it('is a load error, not a crash, when the snapshot data is malformed', async () => {
    const broken = question('q-x', 'cuisine', []);
    (broken as unknown as { options: unknown }).options = null;
    api.getSnapshot.mockResolvedValue({ ok: true, data: fixture([broken]) });
    const hook = await renderHook(() => useDiscoveryFlow());
    await waitFor(() => expect(hook.result.current.status).toBe('load_error'));
    expect(api.trackFlowEvent).not.toHaveBeenCalled();
  });

  it('is a load error when the snapshot has no questions', async () => {
    api.getSnapshot.mockResolvedValue({ ok: true, data: fixture([]) });
    const hook = await renderHook(() => useDiscoveryFlow());
    await waitFor(() => expect(hook.result.current.status).toBe('load_error'));
  });
});

describe('useDiscoveryFlow tracking', () => {
  it('fires started then question_seen for the first question with one session id', async () => {
    await ready();
    expect(api.trackFlowEvent.mock.calls).toEqual([
      ['session-1', 'started', 'cuisine'],
      ['session-1', 'question_seen', 'cuisine'],
    ]);
  });

  it('fires question_seen for each following question, and never a second started', async () => {
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    expect(api.trackFlowEvent.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ['started', 'cuisine'],
      ['question_seen', 'cuisine'],
      ['question_seen', 'budget'],
    ]);
  });
});

describe('useDiscoveryFlow availability from the snapshot', () => {
  it('moves to the next question at once, with no loading state', async () => {
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    expect(hook.result.current.status).toBe('ready');
    expect(hook.result.current.question?.key).toBe('budget');
  });

  it('keeps only the available options, in their own order for the budget question', async () => {
    api.getSnapshot.mockResolvedValue({
      ok: true,
      data: fixture(qs, { availability: { 'budget|cuisine=a': ['budget_3', 'budget_1'] } }),
    });
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    expect(hook.result.current.options.map((o) => o.value)).toEqual(['budget_1', 'budget_3']);
  });

  it('looks availability up with the answers so far', async () => {
    api.getSnapshot.mockResolvedValue({
      ok: true,
      data: fixture(qs, { availability: { [`${VIBE_KEY}|budget=budget_2&cuisine=a`]: ['casual'] } }),
    });
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    await answerAs(hook, 'budget', 'budget_2');
    expect(hook.result.current.options.map((o) => o.value)).toEqual(['casual']);
  });

  it('fails open: no entry shows every option', async () => {
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    expect(hook.result.current.options).toHaveLength(3);
  });

  it('fails open when none of the available values match the options', async () => {
    api.getSnapshot.mockResolvedValue({ ok: true, data: fixture(qs, { availability: { 'budget|cuisine=a': ['nope'] } }) });
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    expect(hook.result.current.options).toHaveLength(3);
  });
});

describe('useDiscoveryFlow answering', () => {
  it('records each answered question in the transcript, with the option label', async () => {
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'b');
    expect(hook.result.current.transcript).toEqual([
      { questionKey: 'cuisine', questionLabel: 'What are you in the mood for?', answerLabel: 'Zebra grill' },
    ]);
  });

  it('offers Skip only on refiner questions', async () => {
    const hook = await ready();
    expect(hook.result.current.canSkip).toBe(false);
    await answerAs(hook, 'cuisine', 'a');
    expect(hook.result.current.canSkip).toBe(true);
  });

  it('skipping adds a "No preference" transcript entry and records no selection', async () => {
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    await act(async () => {
      hook.result.current.skip();
    });
    expect(hook.result.current.question?.key).toBe(VIBE_KEY);
    expect(hook.result.current.transcript[1]).toEqual({
      questionKey: 'budget',
      questionLabel: 'Budget?',
      answerLabel: 'No preference',
    });
    await answerAs(hook, VIBE_KEY, 'trendy');
    expect(hook.result.current.outcome).toEqual({ kind: 'pick', picks: [FALAFEL] });
    expect(api.reportCompletion).toHaveBeenCalledWith({ cuisine: 'a', [VIBE_KEY]: 'trendy' }, 'session-1', ['p-falafel']);
  });

  it('exposes the chevron option ids from the engine rule', async () => {
    const odd = question('q-root', 'cuisine', [
      opt('x', { next_question_id: 'q-two' }),
      opt('y', { next_question_id: 'q-two' }),
      opt('z', { next_question_id: 'q-brunch' }),
    ]);
    api.getSnapshot.mockResolvedValue({
      ok: true,
      data: fixture([odd, question('q-two', 'two', [opt('t')]), question('q-brunch', 'brunch', [opt('u')])]),
    });
    const { result } = await ready();
    const z = odd.options.find((o) => o.value === 'z');
    expect([...result.current.chevronIds]).toEqual([z?.id]);
  });

  it('ignores a tap on an option of a question already answered (double tap)', async () => {
    const hook = await ready();
    const a = optionOf(qs, 'cuisine', 'a');
    const b = optionOf(qs, 'cuisine', 'b');
    await act(async () => {
      hook.result.current.answer(a);
      hook.result.current.answer(b);
    });
    expect(hook.result.current.transcript).toHaveLength(1);
    expect(hook.result.current.transcript[0].answerLabel).toBe('Apple cafe');
    expect(hook.result.current.question?.key).toBe('budget');
  });
});

describe('useDiscoveryFlow resolving', () => {
  async function finish(hook: Hook, vibe = 'trendy') {
    await answerAs(hook, 'cuisine', 'a');
    await answerAs(hook, 'budget', 'budget_2');
    await answerAs(hook, VIBE_KEY, vibe);
  }

  it('does not resolve or report before the last question is answered', async () => {
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    expect(hook.result.current.outcome).toBeNull();
    expect(api.reportCompletion).not.toHaveBeenCalled();
  });

  it('shows the pick from the snapshot at once and reports it with the answers and session id', async () => {
    const hook = await ready();
    await finish(hook);
    expect(hook.result.current.status).toBe('done');
    expect(hook.result.current.outcome).toEqual({ kind: 'pick', picks: [FALAFEL] });
    expect(hook.result.current.question).toBeNull();
    expect(api.reportCompletion).toHaveBeenCalledTimes(1);
    expect(api.reportCompletion).toHaveBeenCalledWith(
      { cuisine: 'a', budget: 'budget_2', [VIBE_KEY]: 'trendy' },
      'session-1',
      ['p-falafel'],
    );
  });

  it('is no_match with the snapshot note when the combination has no picks, and still reports the search', async () => {
    const hook = await ready();
    await finish(hook, 'casual');
    expect(hook.result.current.outcome).toEqual({ kind: 'no_match', note: 'Nothing for this combination yet.' });
    expect(api.reportCompletion).toHaveBeenCalledWith(
      { cuisine: 'a', budget: 'budget_2', [VIBE_KEY]: 'casual' },
      'session-1',
      [],
    );
  });

  it('is the generic error, with nothing reported, when the answers are missing from the snapshot', async () => {
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'b');
    await answerAs(hook, 'budget', 'budget_3');
    await answerAs(hook, VIBE_KEY, 'trendy');
    expect(hook.result.current.outcome).toEqual({ kind: 'error', message: 'Something went wrong — please try again.' });
    expect(api.reportCompletion).not.toHaveBeenCalled();
  });

  it('a report that fails or throws never affects the result', async () => {
    api.reportCompletion.mockImplementation(() => {
      throw new Error('boom');
    });
    const hook = await ready();
    await finish(hook);
    expect(hook.result.current.outcome).toEqual({ kind: 'pick', picks: [FALAFEL] });
  });
});

describe('useDiscoveryFlow restart', () => {
  it('starts a clean run with a new session id and fresh started event, without downloading again', async () => {
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    api.trackFlowEvent.mockClear();

    await act(async () => {
      hook.result.current.restart();
    });
    expect(hook.result.current.question?.key).toBe('cuisine');
    expect(hook.result.current.transcript).toEqual([]);
    expect(hook.result.current.outcome).toBeNull();
    expect(api.getSnapshot).toHaveBeenCalledTimes(1);
    expect(api.trackFlowEvent.mock.calls).toEqual([
      ['session-2', 'started', 'cuisine'],
      ['session-2', 'question_seen', 'cuisine'],
    ]);
  });

  it('reports the next run with the new session id and only the new selections', async () => {
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    await act(async () => {
      hook.result.current.restart();
    });
    await answerAs(hook, 'cuisine', 'b');
    await answerAs(hook, 'budget', 'budget_1');
    await answerAs(hook, VIBE_KEY, 'casual');
    expect(hook.result.current.outcome).toEqual({ kind: 'pick', picks: [SUSHI] });
    expect(api.reportCompletion).toHaveBeenCalledWith(
      { cuisine: 'b', budget: 'budget_1', [VIBE_KEY]: 'casual' },
      'session-2',
      ['p-sushi'],
    );
  });
});

describe('useDiscoveryFlow snapshot refresh', () => {
  it('a fresher download replaces the stored copy before the first answer, without a second started event', async () => {
    const stored = fixture(qs, { availability: { 'budget|cuisine=a': ['budget_1'] } });
    await AsyncStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify({ fetchedAt: Date.now(), snapshot: stored }));
    let release: (v: { ok: true; data: DiscoverySnapshot }) => void = () => undefined;
    api.getSnapshot.mockReturnValueOnce(new Promise((r) => { release = r; }));
    const hook = await ready();
    await act(async () => release({ ok: true, data: snap }));

    await answerAs(hook, 'cuisine', 'a');
    expect(hook.result.current.options).toHaveLength(3); // the fresh snapshot has no budget gating
    expect(api.trackFlowEvent.mock.calls.filter((c) => c[1] === 'started')).toHaveLength(1);
  });

  it('a download that lands mid-run leaves the run alone; the next run uses it', async () => {
    const stored = fixture(qs);
    await AsyncStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify({ fetchedAt: Date.now(), snapshot: stored }));
    let release: (v: { ok: true; data: DiscoverySnapshot }) => void = () => undefined;
    api.getSnapshot.mockReturnValueOnce(new Promise((r) => { release = r; }));
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');

    const fresh = fixture(qs, { availability: { 'budget|cuisine=a': ['budget_2'] } });
    await act(async () => release({ ok: true, data: fresh }));
    expect(hook.result.current.question?.key).toBe('budget');
    expect(hook.result.current.options).toHaveLength(3);

    await act(async () => {
      hook.result.current.restart();
    });
    await answerAs(hook, 'cuisine', 'a');
    expect(hook.result.current.options.map((o) => o.value)).toEqual(['budget_2']);
  });
});

describe('useDiscoveryFlow unexpected failures', () => {
  it('turns an unexpected throw while advancing into the generic error outcome and can restart', async () => {
    // A malformed next question (options not an array) makes the engine throw.
    const hook = await ready();
    const budget = qs.find((q) => q.key === 'budget');
    if (!budget) throw new Error('fixture');
    const goodOptions = budget.options;
    (budget as unknown as { options: unknown }).options = null;
    await answerAs(hook, 'cuisine', 'a');
    expect(hook.result.current.status).toBe('done');
    expect(hook.result.current.outcome).toEqual({
      kind: 'error',
      message: 'Something went wrong — please try again.',
    });

    budget.options = goodOptions; // the data recovers
    await act(async () => {
      hook.result.current.restart();
    });
    expect(hook.result.current.status).toBe('ready');
    await answerAs(hook, 'cuisine', 'a');
    expect(hook.result.current.question?.key).toBe('budget');
  });
});

describe('useDiscoveryFlow chat pacing', () => {
  beforeEach(() => {
    FLOW_PACING.questionMs = 700;
    FLOW_PACING.resultMs = 1200;
  });
  afterEach(() => {
    FLOW_PACING.questionMs = 0;
    FLOW_PACING.resultMs = 0;
    jest.useRealTimers();
  });

  async function readyWithFakeTimers() {
    const hook = await ready();
    jest.useFakeTimers();
    return hook;
  }

  it('shows the typing state, not the next question, until the question pause is over', async () => {
    const hook = await readyWithFakeTimers();
    await answerAs(hook, 'cuisine', 'a');
    expect(hook.result.current.status).toBe('thinking');
    expect(hook.result.current.question).toBeNull();
    expect(hook.result.current.transcript).toHaveLength(1); // the answer bubble is there at once
    expect(api.trackFlowEvent.mock.calls.filter((c) => c[1] === 'question_seen')).toHaveLength(1);

    await act(async () => jest.advanceTimersByTime(699));
    expect(hook.result.current.status).toBe('thinking');
    await act(async () => jest.advanceTimersByTime(1));
    expect(hook.result.current.status).toBe('ready');
    expect(hook.result.current.question?.key).toBe('budget');
    expect(api.trackFlowEvent.mock.calls.filter((c) => c[1] === 'question_seen')).toHaveLength(2);
  });

  it('waits the longer result pause before the recommendation and only then reports it', async () => {
    const hook = await readyWithFakeTimers();
    await answerAs(hook, 'cuisine', 'a');
    await act(async () => jest.advanceTimersByTime(700));
    await answerAs(hook, 'budget', 'budget_2');
    await act(async () => jest.advanceTimersByTime(700));
    await answerAs(hook, VIBE_KEY, 'trendy');
    await act(async () => jest.advanceTimersByTime(1199));
    expect(hook.result.current.outcome).toBeNull();
    expect(api.reportCompletion).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(1));
    expect(hook.result.current.outcome).toEqual({ kind: 'pick', picks: [FALAFEL] });
    expect(api.reportCompletion).toHaveBeenCalledTimes(1);
  });

  it('ignores taps during the pause', async () => {
    const hook = await readyWithFakeTimers();
    await answerAs(hook, 'cuisine', 'a');
    await answerAs(hook, 'cuisine', 'b');
    await act(async () => jest.advanceTimersByTime(700));
    expect(hook.result.current.transcript).toHaveLength(1);
    expect(hook.result.current.question?.key).toBe('budget');
  });

  it('restarting during the pause cancels it: the old question never appears', async () => {
    const hook = await readyWithFakeTimers();
    await answerAs(hook, 'cuisine', 'a');
    await act(async () => {
      hook.result.current.restart();
    });
    expect(hook.result.current.status).toBe('ready');
    await act(async () => jest.advanceTimersByTime(2000));
    expect(hook.result.current.question?.key).toBe('cuisine');
    expect(hook.result.current.transcript).toEqual([]);
  });

  it('unmounting during the pause is safe', async () => {
    const hook = await readyWithFakeTimers();
    await answerAs(hook, 'cuisine', 'a');
    await hook.unmount();
    await act(async () => jest.advanceTimersByTime(2000));
    expect(api.trackFlowEvent.mock.calls.filter((c) => c[1] === 'question_seen')).toHaveLength(1);
  });
});
