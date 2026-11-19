import { useEffect, useSyncExternalStore } from 'react';

import { getHistoryState, loadHistory, subscribeHistory, type HistoryState } from './store';

export function useHistory(): HistoryState {
  const state = useSyncExternalStore(subscribeHistory, getHistoryState, getHistoryState);
  useEffect(() => {
    void loadHistory();
  }, []);
  return state;
}
