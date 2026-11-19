import { act, renderHook, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';

import * as client from '../../api/client';
import type { DiscoveryOption, DiscoveryQuestionWithOptions as Q } from '../../api/types';
import { opt, pick, question } from '../../testing/builders';
import { useDiscoveryFlow } from '../useDiscoveryFlow';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../api/client');
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

const api = jest.mocked(client);
const uuid = jest.mocked(randomUUID);

const VIBE_KEY = 'what_kind_of_vibe_are_you_after_low';

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

function optionOf(qs: Q[], qKey: string, value: string): DiscoveryOption {
  const o = qs.find((q) => q.key === qKey)?.options.find((x) => x.value === value);
  if (!o) throw new Error('fixture option missing');
  return o;
}

let qs: Q[];

beforeEach(() => {
  jest.resetAllMocks();
  qs = graph();
  let n = 0;
  uuid.mockImplementation(() => `session-${(n += 1)}`);
  api.getQuestions.mockResolvedValue({ ok: true, data: qs });
  api.getAvailability.mockResolvedValue({ gated: false });
  api.trackFlowEvent.mockResolvedValue(undefined);
  api.resolveDiscovery.mockResolvedValue({
    ok: true,
    result: { tier: 1, source: 'curated', picks: [pick()], note: null },
  });
});

async function ready() {
  const hook = await renderHook(() => useDiscoveryFlow());
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  return hook;
}

async function answerAs(hook: Awaited<ReturnType<typeof ready>>, qKey: string, value: string) {
  await act(async () => {
    hook.result.current.answer(optionOf(qs, qKey, value));
  });
}

describe('useDiscoveryFlow loading', () => {
  it('starts in the loading state and asks for the questions once', async () => {
    let release: (v: { ok: true; data: Q[] }) => void = () => undefined;
    api.getQuestions.mockReturnValueOnce(new Promise((r) => { release = r; }));
    const hook = await renderHook(() => useDiscoveryFlow());
    expect(hook.result.current.status).toBe('loading');
    expect(api.getQuestions).toHaveBeenCalledTimes(1);
    await act(async () => release({ ok: true, data: qs }));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(api.getQuestions).toHaveBeenCalledTimes(1);
  });

  it('shows the start question with its options sorted alphabetically by label', async () => {
    const { result } = await ready();
    expect(result.current.question?.key).toBe('cuisine');
    expect(result.current.options.map((o) => o.label)).toEqual(['Apple cafe', 'Zebra grill']);
  });

  it('reports a load error with the client message, and retry loads again', async () => {
    api.getQuestions.mockResolvedValueOnce({ ok: false, message: 'offline' });
    const hook = await renderHook(() => useDiscoveryFlow());
    await waitFor(() => expect(hook.result.current.status).toBe('load_error'));
    expect(hook.result.current.loadError).toBeTruthy();
    expect(hook.result.current.question).toBeNull();

    await act(async () => {
      hook.result.current.retry();
    });
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(api.getQuestions).toHaveBeenCalledTimes(2);
    expect(hook.result.current.question?.key).toBe('cuisine');
  });
});

describe('useDiscoveryFlow tracking', () => {
  it('fires started then question_seen for the first question with one session id', async () => {
    await ready();
    await waitFor(() => expect(api.trackFlowEvent).toHaveBeenCalledTimes(2));
    expect(api.trackFlowEvent.mock.calls[0]).toEqual(['session-1', 'started', 'cuisine']);
    expect(api.trackFlowEvent.mock.calls[1]).toEqual(['session-1', 'question_seen', 'cuisine']);
  });

  it('fires question_seen for each following question, and never a second started', async () => {
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    await waitFor(() => expect(hook.result.current.question?.key).toBe('budget'));
    const kinds = api.trackFlowEvent.mock.calls.map((c) => [c[1], c[2]]);
    expect(kinds).toEqual([
      ['started', 'cuisine'],
      ['question_seen', 'cuisine'],
      ['question_seen', 'budget'],
    ]);
  });
});

describe('useDiscoveryFlow availability gating', () => {
  it('does not call availability for the ungated first question', async () => {
    await ready();
    expect(api.getAvailability).not.toHaveBeenCalled();
  });

  it('asks availability for the next gated question with the selections including the answer just given', async () => {
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    await waitFor(() => expect(hook.result.current.question?.key).toBe('budget'));
    expect(api.getAvailability).toHaveBeenCalledTimes(1);
    expect(api.getAvailability).toHaveBeenCalledWith('budget', { cuisine: 'a' });
  });

  it('is busy (no question) while availability is pending', async () => {
    let release: (v: { gated: false }) => void = () => undefined;
    api.getAvailability.mockReturnValueOnce(new Promise((r) => { release = r; }));
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    expect(hook.result.current.status).toBe('busy');
    expect(hook.result.current.question).toBeNull();
    await act(async () => release({ gated: false }));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  });

  it('keeps only the available options, in server order for the budget question', async () => {
    api.getAvailability.mockResolvedValue({ gated: true, available: ['budget_3', 'budget_1'] });
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    await waitFor(() => expect(hook.result.current.question?.key).toBe('budget'));
    expect(hook.result.current.options.map((o) => o.value)).toEqual(['budget_1', 'budget_3']);
  });

  it('fails open: an ungated answer shows every option', async () => {
    api.getAvailability.mockResolvedValue({ gated: false });
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    await waitFor(() => expect(hook.result.current.question?.key).toBe('budget'));
    expect(hook.result.current.options).toHaveLength(3);
  });

  it('fails open when none of the available values match the options', async () => {
    api.getAvailability.mockResolvedValue({ gated: true, available: ['nope'] });
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    await waitFor(() => expect(hook.result.current.question?.key).toBe('budget'));
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
    await waitFor(() => expect(hook.result.current.question?.key).toBe('budget'));
    expect(hook.result.current.canSkip).toBe(true);
  });

  it('skipping adds a "No preference" transcript entry and records no selection', async () => {
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    await waitFor(() => expect(hook.result.current.question?.key).toBe('budget'));
    await act(async () => {
      hook.result.current.skip();
    });
    await waitFor(() => expect(hook.result.current.question?.key).toBe(VIBE_KEY));
    expect(hook.result.current.transcript[1]).toEqual({
      questionKey: 'budget',
      questionLabel: 'Budget?',
      answerLabel: 'No preference',
    });
    await answerAs(hook, VIBE_KEY, 'trendy');
    await waitFor(() => expect(api.resolveDiscovery).toHaveBeenCalled());
    expect(api.resolveDiscovery).toHaveBeenCalledWith({ cuisine: 'a', [VIBE_KEY]: 'trendy' }, 'session-1');
  });

  it('exposes the chevron option ids from the engine rule', async () => {
    const odd = question('q-root', 'cuisine', [
      opt('x', { next_question_id: 'q-two' }),
      opt('y', { next_question_id: 'q-two' }),
      opt('z', { next_question_id: 'q-brunch' }),
    ]);
    api.getQuestions.mockResolvedValue({
      ok: true,
      data: [odd, question('q-two', 'two', [opt('t')]), question('q-brunch', 'brunch', [opt('u')])],
    });
    const { result } = await ready();
    const z = odd.options.find((o) => o.value === 'z');
    expect([...result.current.chevronIds]).toEqual([z?.id]);
  });
});

describe('useDiscoveryFlow resolving', () => {
  async function finish(hook: Awaited<ReturnType<typeof ready>>) {
    await answerAs(hook, 'cuisine', 'a');
    await waitFor(() => expect(hook.result.current.question?.key).toBe('budget'));
    await answerAs(hook, 'budget', 'budget_2');
    await waitFor(() => expect(hook.result.current.question?.key).toBe(VIBE_KEY));
    await answerAs(hook, VIBE_KEY, 'trendy');
  }

  it('does not resolve before the last question is answered', async () => {
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    await waitFor(() => expect(hook.result.current.question?.key).toBe('budget'));
    expect(api.resolveDiscovery).not.toHaveBeenCalled();
  });

  it('resolves with all selections and the session id when the last question is answered', async () => {
    const hook = await ready();
    await finish(hook);
    await waitFor(() => expect(hook.result.current.status).toBe('done'));
    expect(api.resolveDiscovery).toHaveBeenCalledTimes(1);
    expect(api.resolveDiscovery).toHaveBeenCalledWith(
      { cuisine: 'a', budget: 'budget_2', [VIBE_KEY]: 'trendy' },
      'session-1',
    );
  });

  it('exposes a pick outcome with the picks', async () => {
    const hook = await ready();
    await finish(hook);
    await waitFor(() => expect(hook.result.current.status).toBe('done'));
    expect(hook.result.current.outcome).toEqual({ kind: 'pick', picks: [pick()] });
    expect(hook.result.current.question).toBeNull();
  });

  it('exposes a no_match outcome carrying the server note', async () => {
    api.resolveDiscovery.mockResolvedValue({
      ok: true,
      result: { tier: 1, source: 'none', picks: [], note: 'Nothing for this combination yet.' },
    });
    const hook = await ready();
    await finish(hook);
    await waitFor(() => expect(hook.result.current.status).toBe('done'));
    expect(hook.result.current.outcome).toEqual({ kind: 'no_match', note: 'Nothing for this combination yet.' });
  });

  it('exposes a rate_limited outcome with the client message', async () => {
    api.resolveDiscovery.mockResolvedValue({ ok: false, reason: 'rate_limited', message: 'Slow down.' });
    const hook = await ready();
    await finish(hook);
    await waitFor(() => expect(hook.result.current.status).toBe('done'));
    expect(hook.result.current.outcome).toEqual({ kind: 'rate_limited', message: 'Slow down.' });
  });

  it('exposes an error outcome with the client message', async () => {
    api.resolveDiscovery.mockResolvedValue({ ok: false, reason: 'error', message: 'Broke.' });
    const hook = await ready();
    await finish(hook);
    await waitFor(() => expect(hook.result.current.status).toBe('done'));
    expect(hook.result.current.outcome).toEqual({ kind: 'error', message: 'Broke.' });
  });

  it('ignores a second answer while the first is still advancing (double tap)', async () => {
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    await waitFor(() => expect(hook.result.current.question?.key).toBe('budget'));
    await answerAs(hook, 'budget', 'budget_2');
    await waitFor(() => expect(hook.result.current.question?.key).toBe(VIBE_KEY));
    const trendy = optionOf(qs, VIBE_KEY, 'trendy');
    const casual = optionOf(qs, VIBE_KEY, 'casual');
    await act(async () => {
      hook.result.current.answer(trendy);
      hook.result.current.answer(casual);
    });
    await waitFor(() => expect(hook.result.current.status).toBe('done'));
    expect(api.resolveDiscovery).toHaveBeenCalledTimes(1);
    expect(api.resolveDiscovery.mock.calls[0][0]).toMatchObject({ [VIBE_KEY]: 'trendy' });
  });
});

describe('useDiscoveryFlow restart', () => {
  it('starts a clean run with a new session id and fresh started event, without refetching questions', async () => {
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    await waitFor(() => expect(hook.result.current.question?.key).toBe('budget'));
    api.trackFlowEvent.mockClear();

    await act(async () => {
      hook.result.current.restart();
    });
    await waitFor(() => expect(hook.result.current.question?.key).toBe('cuisine'));
    expect(hook.result.current.transcript).toEqual([]);
    expect(hook.result.current.outcome).toBeNull();
    expect(api.getQuestions).toHaveBeenCalledTimes(1);
    expect(api.trackFlowEvent.mock.calls.slice(0, 2)).toEqual([
      ['session-2', 'started', 'cuisine'],
      ['session-2', 'question_seen', 'cuisine'],
    ]);
  });

  it('resolves the next run with the new session id and only the new selections', async () => {
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    await waitFor(() => expect(hook.result.current.question?.key).toBe('budget'));
    await act(async () => {
      hook.result.current.restart();
    });
    await waitFor(() => expect(hook.result.current.question?.key).toBe('cuisine'));
    await answerAs(hook, 'cuisine', 'b');
    await waitFor(() => expect(hook.result.current.question?.key).toBe('budget'));
    await answerAs(hook, 'budget', 'budget_1');
    await waitFor(() => expect(hook.result.current.question?.key).toBe(VIBE_KEY));
    await answerAs(hook, VIBE_KEY, 'casual');
    await waitFor(() => expect(api.resolveDiscovery).toHaveBeenCalled());
    expect(api.resolveDiscovery).toHaveBeenCalledWith(
      { cuisine: 'b', budget: 'budget_1', [VIBE_KEY]: 'casual' },
      'session-2',
    );
  });
});

describe('useDiscoveryFlow unexpected failures', () => {
  it('turns an unexpected throw in the advance path into the generic error outcome and can restart', async () => {
    // A malformed next question (options not an array) makes the engine throw
    // synchronously inside advance(), outside every try/catch around the client.
    const hook = await ready();
    const budget = qs.find((q) => q.key === 'budget');
    if (!budget) throw new Error('fixture');
    const goodOptions = budget.options;
    (budget as unknown as { options: unknown }).options = null;
    await answerAs(hook, 'cuisine', 'a');
    await waitFor(() => expect(hook.result.current.status).toBe('done'));
    expect(hook.result.current.outcome).toEqual({
      kind: 'error',
      message: 'Something went wrong — please try again.',
    });

    budget.options = goodOptions; // the data recovers
    await act(async () => {
      hook.result.current.restart();
    });
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(hook.result.current.question?.key).toBe('cuisine');
    await answerAs(hook, 'cuisine', 'a');
    await waitFor(() => expect(hook.result.current.question?.key).toBe('budget'));
  });

  it('a client that throws synchronously from resolveDiscovery ends in the error outcome', async () => {
    api.resolveDiscovery.mockImplementation(() => {
      throw new Error('boom');
    });
    const hook = await ready();
    await answerAs(hook, 'cuisine', 'a');
    await answerAs(hook, 'budget', 'budget_1');
    await answerAs(hook, VIBE_KEY, 'casual');
    await waitFor(() => expect(hook.result.current.status).toBe('done'));
    expect(hook.result.current.outcome?.kind).toBe('error');
    await act(async () => {
      hook.result.current.restart();
    });
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  });
});
