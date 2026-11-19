import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { FAVOURITES_KEY, __resetFavouritesForTests } from '../store';
import { useFavourites } from '../useFavourites';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetFavouritesForTests();
});

describe('useFavourites', () => {
  it('starts not loaded and loads the stored ids on mount', async () => {
    let release: (v: string | null) => void = () => undefined;
    jest.spyOn(AsyncStorage, 'getItem').mockReturnValueOnce(new Promise((r) => { release = r; }));
    const { result } = await renderHook(() => useFavourites());
    expect(result.current.loaded).toBe(false);
    await act(async () => release(JSON.stringify(['a', 'b'])));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.ids).toEqual(['a', 'b']);
    expect(result.current.isFavourite('a')).toBe(true);
    expect(result.current.isFavourite('z')).toBe(false);
  });

  it('is loaded with no ids when storage is empty', async () => {
    const { result } = await renderHook(() => useFavourites());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.ids).toEqual([]);
  });

  it('is loaded with no ids when storage is corrupt', async () => {
    await AsyncStorage.setItem(FAVOURITES_KEY, 'oops');
    const { result } = await renderHook(() => useFavourites());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.ids).toEqual([]);
  });

  it('toggle saves and unsaves', async () => {
    const { result } = await renderHook(() => useFavourites());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await result.current.toggle('a');
    });
    expect(result.current.isFavourite('a')).toBe(true);
    await act(async () => {
      await result.current.toggle('a');
    });
    expect(result.current.isFavourite('a')).toBe(false);
    expect(await AsyncStorage.getItem(FAVOURITES_KEY)).toBe('[]');
  });

  it('keeps two components in sync when one toggles', async () => {
    const first = await renderHook(() => useFavourites());
    const second = await renderHook(() => useFavourites());
    await waitFor(() => expect(first.result.current.loaded && second.result.current.loaded).toBe(true));
    await act(async () => {
      await first.result.current.toggle('a');
    });
    expect(second.result.current.isFavourite('a')).toBe(true);
    expect(second.result.current.ids).toEqual(['a']);
  });
});
