import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { addBeenThere, getBeenThereState, loadBeenThere, removeBeenThere, subscribeBeenThere } from './store';

export function useBeenThere(): {
  ids: string[];
  loaded: boolean;
  isBeenThere(id: string): boolean;
  add(id: string): Promise<void>;
  remove(id: string): Promise<void>;
} {
  const state = useSyncExternalStore(subscribeBeenThere, getBeenThereState, getBeenThereState);
  useEffect(() => {
    void loadBeenThere();
  }, []);
  const isBeenThere = useCallback((id: string) => state.ids.includes(id), [state.ids]);
  const add = useCallback(async (id: string) => {
    await addBeenThere(id);
  }, []);
  const remove = useCallback(async (id: string) => {
    await removeBeenThere(id);
  }, []);
  return { ids: state.ids, loaded: state.loaded, isBeenThere, add, remove };
}
