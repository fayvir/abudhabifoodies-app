import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { BEEN_THERE_KEY, __resetFavouritesForTests } from '../store';
import { useBeenThere } from '../useBeenThere';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetFavouritesForTests();
});

describe('useBeenThere', () => {
  it('loads stored ids on mount', async () => {
    await AsyncStorage.setItem(BEEN_THERE_KEY, JSON.stringify(['a']));
    const { result } = await renderHook(() => useBeenThere());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.ids).toEqual(['a']);
  });

  it('two components stay in sync', async () => {
    const one = await renderHook(() => useBeenThere());
    const two = await renderHook(() => useBeenThere());
    await waitFor(() => expect(one.result.current.loaded).toBe(true));
    await act(async () => {
      await one.result.current.add('z');
    });
    expect(two.result.current.ids).toEqual(['z']);
    await act(async () => {
      await two.result.current.remove('z');
    });
    expect(one.result.current.ids).toEqual([]);
  });
});
