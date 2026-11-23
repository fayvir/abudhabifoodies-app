import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

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

/**
 * The discovery snapshot: the stored copy straight away (so a relaunch never
 * waits on the network), then a fresh download on every launch, and again
 * whenever the app comes back to the foreground with a copy over an hour old.
 * A failed refresh keeps the copy in hand; only with no copy at all is it an
 * error (the screen offers Try again).
 */
export function useSnapshot(): SnapshotState {
  const [snapshot, setSnapshot] = useState<DiscoverySnapshot | null>(null);
  const [status, setStatus] = useState<SnapshotStatus>('loading');
  const fetchedAt = useRef(0);
  const inFlight = useRef(false);
  const hasSnapshot = useRef(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await getSnapshot();
      if (!mounted.current) return;
      if (res.ok) {
        fetchedAt.current = Date.now();
        hasSnapshot.current = true;
        setSnapshot(res.data);
        setStatus('ready');
        void saveSnapshot({ fetchedAt: fetchedAt.current, snapshot: res.data });
      } else if (!hasSnapshot.current) {
        setStatus('error');
      }
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void loadStoredSnapshot().then((stored) => {
      // A fresh download that already landed wins over the stored copy.
      if (!mounted.current || !stored || hasSnapshot.current) return;
      fetchedAt.current = stored.fetchedAt;
      hasSnapshot.current = true;
      setSnapshot(stored.snapshot);
      setStatus('ready');
    });
    void refresh();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - fetchedAt.current > REFRESH_AFTER_MS) void refresh();
    });
    return () => {
      mounted.current = false;
      sub.remove();
    };
  }, [refresh]);

  const retry = useCallback(() => {
    setStatus('loading');
    void refresh().then(() => {
      if (mounted.current && !hasSnapshot.current) setStatus('error');
    });
  }, [refresh]);

  return { snapshot, status, retry };
}
