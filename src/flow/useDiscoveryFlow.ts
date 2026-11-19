import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getAvailability, getQuestions, resolveDiscovery, trackFlowEvent } from '../api/client';
import type {
  DiscoveryOption,
  DiscoveryQuestionWithOptions as Q,
  ResultCard,
  Selections,
} from '../api/types';
import {
  applyAvailability,
  chevronOptionIds,
  findNextQuestion,
  findStartQuestion,
  isGatedQuestion,
  isRefinerQuestion,
  selectOption,
  SKIP_LABEL,
  sortOptionsForQuestion,
} from './engine';

export interface TranscriptEntry {
  questionKey: string;
  questionLabel: string;
  answerLabel: string;
}

export type FlowOutcome =
  | { kind: 'pick'; picks: ResultCard[] }
  | { kind: 'no_match'; note: string }
  | { kind: 'rate_limited'; message: string }
  | { kind: 'error'; message: string };

export type FlowStatus = 'loading' | 'load_error' | 'ready' | 'busy' | 'done';

export interface DiscoveryFlowState {
  status: FlowStatus;
  loadError: string | null;
  retry(): void;
  question: Q | null;
  options: DiscoveryOption[];
  chevronIds: ReadonlySet<string>;
  canSkip: boolean;
  transcript: TranscriptEntry[];
  outcome: FlowOutcome | null;
  answer(option: DiscoveryOption): void;
  skip(): void;
  restart(): void;
}

const LOAD_ERROR = 'Something went wrong loading the guide.';
const GENERIC_ERROR = 'Something went wrong — please try again.';
const NO_MATCH_NOTE = "We haven't covered this combination yet — try a different option.";

interface Run {
  token: number;
  sessionId: string;
  selections: Selections;
  asked: Set<string>;
  current: Q | null;
}

function track(sessionId: string, event: 'started' | 'question_seen', questionKey: string): void {
  // Fire-and-forget: analytics must never break the flow.
  try {
    void Promise.resolve(trackFlowEvent(sessionId, event, questionKey)).catch(() => undefined);
  } catch {
    // ignore
  }
}

export function useDiscoveryFlow(): DiscoveryFlowState {
  const [status, setStatus] = useState<FlowStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [question, setQuestion] = useState<Q | null>(null);
  const [options, setOptions] = useState<DiscoveryOption[]>([]);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [outcome, setOutcome] = useState<FlowOutcome | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  // Full option set + flags for the question on screen.
  const [shown, setShown] = useState<Q | null>(null);

  const questionsRef = useRef<Q[]>([]);
  const busyRef = useRef(false);
  const tokenRef = useRef(0);
  const runRef = useRef<Run | null>(null);

  const seed = useCallback((questions: Q[]): boolean => {
    const start = findStartQuestion(questions);
    tokenRef.current += 1;
    if (!start) {
      runRef.current = null;
      return false;
    }
    const run: Run = {
      token: tokenRef.current,
      sessionId: randomUUID(),
      selections: {},
      asked: new Set([start.id]),
      current: start,
    };
    runRef.current = run;
    busyRef.current = false;
    track(run.sessionId, 'started', start.key);
    track(run.sessionId, 'question_seen', start.key);
    setTranscript([]);
    setOutcome(null);
    setQuestion(start);
    setShown(start);
    setOptions(sortOptionsForQuestion(start, start.options));
    setStatus('ready');
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setLoadError(null);
    void getQuestions().then((res) => {
      if (cancelled) return;
      if (res.ok && res.data.length > 0) {
        questionsRef.current = res.data;
        if (seed(res.data)) return;
      }
      setLoadError(res.ok ? LOAD_ERROR : res.message || LOAD_ERROR);
      setStatus('load_error');
    });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt, seed]);

  const retry = useCallback(() => setLoadAttempt((n) => n + 1), []);

  const advanceInner = useCallback(async (run: Run, from: Q, chosen: DiscoveryOption | null, entry: TranscriptEntry) => {
    const token = run.token;
    if (chosen) run.selections = selectOption(run.selections, from, chosen);
    setTranscript((t) => [...t, entry]);
    setQuestion(null);
    setStatus('busy');

    const next = findNextQuestion(questionsRef.current, from, chosen, run.asked);
    if (!next) {
      let result: FlowOutcome;
      try {
        const res = await resolveDiscovery(run.selections, run.sessionId);
        if (res.ok) {
          const r = res.result;
          result =
            r.source === 'curated' && r.picks.length > 0
              ? { kind: 'pick', picks: r.picks }
              : { kind: 'no_match', note: r.note || NO_MATCH_NOTE };
        } else if (res.reason === 'rate_limited') {
          result = { kind: 'rate_limited', message: res.message };
        } else {
          result = { kind: 'error', message: res.message };
        }
      } catch {
        result = { kind: 'error', message: GENERIC_ERROR };
      }
      if (tokenRef.current !== token) return;
      run.current = null;
      setShown(null);
      setOptions([]);
      setOutcome(result);
      setStatus('done');
      return;
    }

    run.asked.add(next.id);
    run.current = next;
    let visible = sortOptionsForQuestion(next, next.options);
    if (isGatedQuestion(next)) {
      try {
        visible = applyAvailability(visible, await getAvailability(next.key, run.selections));
      } catch {
        // fail open
      }
      if (tokenRef.current !== token) return;
    }
    track(run.sessionId, 'question_seen', next.key);
    setShown(next);
    setOptions(visible);
    setQuestion(next);
    setStatus('ready');
  }, []);

  // Whatever happens inside, the busy guard is released and the user is never
  // left on the spinner: an unexpected throw becomes the generic error outcome.
  const advance = useCallback(
    async (from: Q, chosen: DiscoveryOption | null, entry: TranscriptEntry) => {
      const run = runRef.current;
      if (!run) return;
      busyRef.current = true;
      try {
        await advanceInner(run, from, chosen, entry);
      } catch {
        if (tokenRef.current === run.token) {
          run.current = null;
          setShown(null);
          setOptions([]);
          setQuestion(null);
          setOutcome({ kind: 'error', message: GENERIC_ERROR });
          setStatus('done');
        }
      } finally {
        if (tokenRef.current === run.token) busyRef.current = false;
      }
    },
    [advanceInner],
  );

  const answer = useCallback(
    (option: DiscoveryOption) => {
      const run = runRef.current;
      if (busyRef.current || !run?.current) return;
      const from = run.current;
      busyRef.current = true;
      void advance(from, option, { questionKey: from.key, questionLabel: from.label, answerLabel: option.label });
    },
    [advance],
  );

  const skip = useCallback(() => {
    const run = runRef.current;
    if (busyRef.current || !run?.current || !isRefinerQuestion(run.current)) return;
    const from = run.current;
    busyRef.current = true;
    void advance(from, null, { questionKey: from.key, questionLabel: from.label, answerLabel: SKIP_LABEL });
  }, [advance]);

  const restart = useCallback(() => {
    if (questionsRef.current.length > 0) seed(questionsRef.current);
  }, [seed]);

  const chevronIds = useMemo<ReadonlySet<string>>(
    () => (shown ? chevronOptionIds(shown.options) : new Set<string>()),
    [shown],
  );

  return {
    status,
    loadError,
    retry,
    question,
    options,
    chevronIds,
    canSkip: question ? isRefinerQuestion(question) : false,
    transcript,
    outcome,
    answer,
    skip,
    restart,
  };
}
