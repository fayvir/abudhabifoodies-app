import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { reportCompletion, trackFlowEvent } from '../api/client';
import type {
  DiscoveryOption,
  DiscoveryQuestionWithOptions as Q,
  DiscoverySnapshot,
  ResultCard,
  Selections,
} from '../api/types';
import { useSnapshot } from '../snapshot/useSnapshot';
import { FLOW_PACING } from './pacing';
import {
  applyAvailability,
  chevronOptionIds,
  findNextQuestion,
  findStartQuestion,
  isRefinerQuestion,
  resolveFromSnapshot,
  selectOption,
  SKIP_LABEL,
  snapshotAvailability,
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
  | { kind: 'error'; message: string };

/** `thinking`: the typing bubble between an answer and what comes next. */
export type FlowStatus = 'loading' | 'load_error' | 'ready' | 'thinking' | 'done';

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

interface Run {
  sessionId: string;
  /** The snapshot this run answers from; a refresh mid-run only affects the next run. */
  snapshot: DiscoverySnapshot;
  selections: Selections;
  asked: Set<string>;
  current: Q | null;
  answered: boolean;
}

function fireAndForget(send: () => Promise<void>): void {
  // Analytics must never break the flow.
  try {
    void Promise.resolve(send()).catch(() => undefined);
  } catch {
    // ignore
  }
}

/**
 * The guided flow, answered entirely from the downloaded snapshot, with no
 * network wait. Each answer shows a short typing pause (FLOW_PACING) so it
 * reads as a chat. Tracking events and the finished search are reported in
 * the background.
 */
export function useDiscoveryFlow(): DiscoveryFlowState {
  const { snapshot, status: snapshotStatus, retry } = useSnapshot();
  const [question, setQuestion] = useState<Q | null>(null);
  const [options, setOptions] = useState<DiscoveryOption[]>([]);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [outcome, setOutcome] = useState<FlowOutcome | null>(null);
  const [badSnapshot, setBadSnapshot] = useState(false);
  const [thinking, setThinking] = useState(false);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPause = useCallback(() => {
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    pauseTimer.current = null;
    setThinking(false);
  }, []);

  /** Runs `then` after `ms` behind the typing bubble, or at once for 0. */
  const pause = useCallback((ms: number, then: () => void) => {
    if (ms <= 0) {
      then();
      return;
    }
    setThinking(true);
    pauseTimer.current = setTimeout(() => {
      pauseTimer.current = null;
      setThinking(false);
      then();
    }, ms);
  }, []);

  useEffect(() => () => {
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
  }, []);

  const runRef = useRef<Run | null>(null);
  const latestSnapshot = useRef<DiscoverySnapshot | null>(null);

  const show = useCallback((q: Q, run: Run) => {
    const visible = applyAvailability(
      sortOptionsForQuestion(q, q.options),
      snapshotAvailability(run.snapshot, q, run.selections),
    );
    setQuestion(q);
    setOptions(visible);
  }, []);

  /**
   * Starts a run. `sessionId` given = same run on a newer snapshot (no new tracking).
   * False when the snapshot has no usable start question; malformed data never throws.
   */
  const seed = useCallback(
    (snap: DiscoverySnapshot, sessionId?: string): boolean => {
      runRef.current = null;
      cancelPause();
      try {
        const start = findStartQuestion(snap.questions);
        if (!start) return false;
        const run: Run = {
          sessionId: sessionId ?? randomUUID(),
          snapshot: snap,
          selections: {},
          asked: new Set([start.id]),
          current: start,
          answered: false,
        };
        show(start, run);
        runRef.current = run;
        if (!sessionId) {
          fireAndForget(() => trackFlowEvent(run.sessionId, 'started', start.key));
          fireAndForget(() => trackFlowEvent(run.sessionId, 'question_seen', start.key));
        }
        setTranscript([]);
        setOutcome(null);
        return true;
      } catch {
        setQuestion(null);
        setOptions([]);
        return false;
      }
    },
    [show, cancelPause],
  );

  // First snapshot starts the flow. A newer one replaces it only while nothing
  // has been answered yet; otherwise the next run picks it up.
  useEffect(() => {
    if (!snapshot) return;
    latestSnapshot.current = snapshot;
    const run = runRef.current;
    if (run && (run.answered || run.snapshot === snapshot)) return;
    const startKey = run?.current?.key;
    const sameStart = run !== null && findStartQuestion(snapshot.questions)?.key === startKey;
    setBadSnapshot(!seed(snapshot, sameStart ? run.sessionId : undefined));
  }, [snapshot, seed]);

  const finish = useCallback((run: Run) => {
    run.current = null;
    setQuestion(null);
    setOptions([]);
    const res = resolveFromSnapshot(run.snapshot, run.selections);
    if (res.kind === 'pick') {
      setOutcome({ kind: 'pick', picks: res.picks });
    } else if (res.kind === 'no_match') {
      setOutcome({ kind: 'no_match', note: res.note });
    } else {
      setOutcome({ kind: 'error', message: GENERIC_ERROR });
      return; // not a real search: nothing to report
    }
    const pickIds = res.kind === 'pick' ? res.pickIds : [];
    fireAndForget(() => reportCompletion(run.selections, run.sessionId, pickIds));
  }, []);

  const advance = useCallback(
    (run: Run, from: Q, chosen: DiscoveryOption | null, answerLabel: string) => {
      run.answered = true;
      // No question is answerable during the pause: taps on the old chips are ignored.
      run.current = null;
      setQuestion(null);
      setOptions([]);
      setTranscript((t) => [...t, { questionKey: from.key, questionLabel: from.label, answerLabel }]);
      const fail = () => {
        // Malformed data must never leave the user stuck: end in the error outcome.
        setOutcome({ kind: 'error', message: GENERIC_ERROR });
      };
      let next: Q | null;
      try {
        if (chosen) run.selections = selectOption(run.selections, from, chosen);
        next = findNextQuestion(run.snapshot.questions, from, chosen, run.asked);
      } catch {
        fail();
        return;
      }
      const step = next;
      pause(step ? FLOW_PACING.questionMs : FLOW_PACING.resultMs, () => {
        if (runRef.current !== run) return; // restarted during the pause
        if (!step) {
          finish(run);
          return;
        }
        try {
          run.asked.add(step.id);
          run.current = step;
          show(step, run);
          fireAndForget(() => trackFlowEvent(run.sessionId, 'question_seen', step.key));
        } catch {
          run.current = null;
          setQuestion(null);
          setOptions([]);
          fail();
        }
      });
    },
    [finish, show, pause],
  );

  const answer = useCallback(
    (option: DiscoveryOption) => {
      const run = runRef.current;
      const from = run?.current;
      // A stale tap (double tap, or a chip from a question already answered) is ignored.
      if (!run || !from || !from.options.some((o) => o.id === option.id)) return;
      advance(run, from, option, option.label);
    },
    [advance],
  );

  const skip = useCallback(() => {
    const run = runRef.current;
    const from = run?.current;
    if (!run || !from || !isRefinerQuestion(from)) return;
    advance(run, from, null, SKIP_LABEL);
  }, [advance]);

  const restart = useCallback(() => {
    if (latestSnapshot.current) setBadSnapshot(!seed(latestSnapshot.current));
  }, [seed]);

  const chevronIds = useMemo<ReadonlySet<string>>(
    () => (question ? chevronOptionIds(question.options) : new Set<string>()),
    [question],
  );

  let status: FlowStatus;
  if (outcome) status = 'done';
  else if (thinking) status = 'thinking';
  else if (question) status = 'ready';
  else if (snapshotStatus === 'error' || badSnapshot) status = 'load_error';
  else status = 'loading';

  return {
    status,
    loadError: status === 'load_error' ? LOAD_ERROR : null,
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
