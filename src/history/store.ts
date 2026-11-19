import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ResultCard } from '../api/types';

export const HISTORY_KEY = 'abf_history';
/** Newest first; older entries fall off the end. */
export const HISTORY_LIMIT = 30;

/** A recommendation the visitor was shown, with the answers that led to it. On the phone only. */
export interface HistoryEntry {
  /** restaurant id, or the name for a pick with no catalogue record: one entry per restaurant. */
  key: string;
  name: string;
  area: string | null;
  price_range: number | null;
  phone: string | null;
  google_maps: string | null;
  website: string | null;
  answers: string[];
}

export interface HistoryState {
  entries: HistoryEntry[];
  loaded: boolean;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function parse(raw: string | null): HistoryEntry[] {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const out: HistoryEntry[] = [];
    for (const v of value as Record<string, unknown>[]) {
      const key = str(v?.key);
      const name = str(v?.name);
      if (!key || !name) continue;
      out.push({
        key,
        name,
        area: str(v.area),
        price_range: typeof v.price_range === 'number' ? v.price_range : null,
        phone: str(v.phone),
        google_maps: str(v.google_maps),
        website: str(v.website),
        answers: Array.isArray(v.answers) ? v.answers.filter((a): a is string => typeof a === 'string') : [],
      });
    }
    return out.slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

let state: HistoryState = { entries: [], loaded: false };
let loading: Promise<HistoryEntry[]> | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function set(next: HistoryState): void {
  state = next;
  listeners.forEach((l) => l());
}

export const getHistoryState = (): HistoryState => state;

export function subscribeHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function loadHistory(): Promise<HistoryEntry[]> {
  if (state.loaded) return Promise.resolve(state.entries);
  if (loading) return loading;
  const gen = generation;
  const p = (async () => {
    let entries: HistoryEntry[] = [];
    try {
      entries = parse(await AsyncStorage.getItem(HISTORY_KEY));
    } catch {
      entries = [];
    }
    if (gen === generation) {
      loading = null;
      set({ entries, loaded: true });
    }
    return entries;
  })();
  loading = p;
  return p;
}

async function persist(entries: HistoryEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // Keep the in-memory change; the next successful write persists it.
  }
}

/** Remembers a shown pick: newest first, one entry per restaurant, at most HISTORY_LIMIT. */
export async function recordPick(card: ResultCard, answers: readonly string[]): Promise<void> {
  await loadHistory();
  const key = card.restaurant_id ?? card.restaurant_name;
  const entry: HistoryEntry = {
    key,
    name: card.restaurant_name,
    area: card.area ?? null,
    price_range: card.price_range ?? null,
    phone: card.phone ?? null,
    google_maps: card.google_maps ?? null,
    website: card.website ?? null,
    answers: [...answers],
  };
  const entries = [entry, ...state.entries.filter((e) => e.key !== key)].slice(0, HISTORY_LIMIT);
  set({ entries, loaded: true });
  await persist(entries);
}

/** Saved > Recent: the trash button on one card. */
export async function removeHistoryEntry(key: string): Promise<void> {
  await loadHistory();
  if (!state.entries.some((e) => e.key === key)) return;
  const entries = state.entries.filter((e) => e.key !== key);
  set({ entries, loaded: true });
  await persist(entries);
}

export async function clearHistory(): Promise<void> {
  await loadHistory();
  set({ entries: [], loaded: true });
  await persist([]);
}

export function __resetHistoryForTests(): void {
  generation += 1;
  loading = null;
  state = { entries: [], loaded: false };
  listeners.clear();
}
