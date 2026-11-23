import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AppState, type NativeEventSubscription } from 'react-native';

import { getSnapshot } from '../api/client';
import type { DiscoverySnapshot } from '../api/types';
import { loadStoredSnapshot, saveSnapshot } from './store';

/** Returning to the app refreshes the snapshot when it is older than this. */
export const REFRESH_AFTER_MS = 60 * 60 * 1000;

export type SnapshotStatus = 'loading' | 'ready' | 'error';

export interface SnapshotState {
  snapshot: DiscoverySnapshot | null;
  status: SnapshotStatus;
  retry(): void;
}

/*
 * One snapshot for the whole app, shared by the splash screen (root layout) and
 * the Discover flow: the stored copy straight away (a relaunch never waits on the
 * network), then a fresh download on every launch, and again whenever the app
 * comes back to the foreground with a copy over an hour old. A failed refresh
 * keeps the copy in hand; only with no copy at all is it an error (Discover
 * offers Try again). Loading starts when the first component subscribes.
 */
interface State {
  snapshot: DiscoverySnapshot | null;
  status: SnapshotStatus;
}

let state: State = { snapshot: null, status: 'loading' };
let fetchedAt = 0;
let inFlight: Promise<void> | null = null;
let started = false;
let generation = 0;
let appStateSub: NativeEventSubscription | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<State>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/** One download at a time; a second call shares the one in flight. */
function refresh(): Promise<void> {
  const gen = generation;
  inFlight ??= (async () => {
    try {
      const res = await getSnapshot();
      if (gen !== generation) return;
      if (res.ok) {
        fetchedAt = Date.now();
        set({ snapshot: res.data, status: 'ready' });
        void saveSnapshot({ fetchedAt, snapshot: res.data });
      } else if (!state.snapshot) {
        set({ status: 'error' });
      }
    } finally {
      if (gen === generation) inFlight = null;
    }
  })();
  return inFlight;
}

function start(): void {
  if (started) return;
  started = true;
  const gen = generation;
  void loadStoredSnapshot().then((stored) => {
    // A fresh download that already landed wins over the stored copy.
    if (gen !== generation || !stored || state.snapshot) return;
    fetchedAt = stored.fetchedAt;
    set({ snapshot: stored.snapshot, status: 'ready' });
  });
  void refresh();
  appStateSub = AppState.addEventListener('change', (next) => {
    if (next === 'active' && Date.now() - fetchedAt > REFRESH_AFTER_MS) void refresh();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getState = (): State => state;

function retry(): void {
  set({ status: 'loading' });
  void refresh().then(() => {
    if (!state.snapshot) set({ status: 'error' });
  });
}

export function useSnapshot(): SnapshotState {
  const current = useSyncExternalStore(subscribe, getState, getState);
  useEffect(start, []);
  const retryCb = useCallback(retry, []);
  return { snapshot: current.snapshot, status: current.status, retry: retryCb };
}

/** Tests only: forget everything, as on a fresh app start. */
export function __resetSnapshotForTests(): void {
  generation += 1;
  appStateSub?.remove();
  appStateSub = null;
  state = { snapshot: null, status: 'loading' };
  fetchedAt = 0;
  inFlight = null;
  started = false;
  listeners.clear();
}
