import AsyncStorage from '@react-native-async-storage/async-storage';

export interface IdListState {
  ids: string[];
  loaded: boolean;
}

function parse(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * A persisted list of restaurant ids (JSON array under one AsyncStorage key)
 * with an in-memory copy that components subscribe to. Reads and writes never
 * throw: corrupt/missing data is an empty list, a failed write keeps the
 * in-memory change. Used for both "Want to try" and "Been there".
 */
export function createIdListStore(key: string) {
  let state: IdListState = { ids: [], loaded: false };
  let loading: Promise<string[]> | null = null;
  let generation = 0;
  const listeners = new Set<() => void>();

  function set(next: IdListState): void {
    state = next;
    listeners.forEach((l) => l());
  }

  function load(): Promise<string[]> {
    if (state.loaded) return Promise.resolve(state.ids);
    if (loading) return loading;
    const gen = generation;
    const p = (async () => {
      let ids: string[] = [];
      try {
        ids = parse(await AsyncStorage.getItem(key));
      } catch {
        ids = [];
      }
      if (gen === generation) {
        loading = null;
        set({ ids, loaded: true });
      }
      return ids;
    })();
    loading = p;
    return p;
  }

  async function persist(ids: string[]): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(ids));
    } catch {
      // Keep the in-memory change; the next successful write persists it.
    }
  }

  /** Applies `change` to the current ids (after the initial load) and saves. */
  async function update(change: (ids: string[]) => string[]): Promise<string[]> {
    await load();
    const ids = change(state.ids);
    if (ids.length === state.ids.length && ids.every((id, i) => id === state.ids[i])) return state.ids;
    set({ ids, loaded: true });
    await persist(ids);
    return ids;
  }

  return {
    key,
    get: (): string[] => state.ids,
    getState: (): IdListState => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load,
    toggle: (id: string) => update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])),
    add: (id: string) => update((ids) => (ids.includes(id) ? ids : [...ids, id])),
    clear: () => update(() => []),
    remove: (id: string) => update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids)),
    reset(): void {
      generation += 1;
      loading = null;
      state = { ids: [], loaded: false };
      listeners.clear();
    },
  };
}
