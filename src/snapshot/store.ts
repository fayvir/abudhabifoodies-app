import AsyncStorage from '@react-native-async-storage/async-storage';

import { SNAPSHOT_VERSION } from '../api/client';
import type { DiscoverySnapshot } from '../api/types';

export const SNAPSHOT_STORAGE_KEY = 'abf_discovery_snapshot';

export interface StoredSnapshot {
  /** When this phone downloaded it (ms since epoch). */
  fetchedAt: number;
  snapshot: DiscoverySnapshot;
}

/** The last downloaded snapshot, or null if none, unreadable, or from another snapshot version. Never throws. */
export async function loadStoredSnapshot(): Promise<StoredSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (raw === null) return null;
    const value = JSON.parse(raw) as Partial<StoredSnapshot> | null;
    if (
      typeof value?.fetchedAt === 'number' &&
      value.snapshot?.version === SNAPSHOT_VERSION &&
      Array.isArray(value.snapshot.questions)
    ) {
      return value as StoredSnapshot;
    }
  } catch {
    // corrupt: treat as missing
  }
  return null;
}

/** Best effort; never throws (the in-memory copy still works this session). */
export async function saveSnapshot(stored: StoredSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // ignore
  }
}
