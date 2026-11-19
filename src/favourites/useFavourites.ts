import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { getFavouritesState, loadFavourites, subscribeFavourites, toggleFavourite } from './store';

export function useFavourites(): {
  ids: string[];
  loaded: boolean;
  isFavourite(id: string): boolean;
  toggle(id: string): Promise<void>;
} {
  const state = useSyncExternalStore(subscribeFavourites, getFavouritesState, getFavouritesState);
  useEffect(() => {
    void loadFavourites();
  }, []);
  const isFavourite = useCallback((id: string) => state.ids.includes(id), [state.ids]);
  const toggle = useCallback(async (id: string) => {
    await toggleFavourite(id);
  }, []);
  return { ids: state.ids, loaded: state.loaded, isFavourite, toggle };
}
