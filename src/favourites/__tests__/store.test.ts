import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  FAVOURITES_KEY,
  __resetFavouritesForTests,
  getFavourites,
  loadFavourites,
  subscribeFavourites,
  toggleFavourite,
} from '../store';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetFavouritesForTests();
  jest.restoreAllMocks();
});

async function stored(): Promise<unknown> {
  const raw = await AsyncStorage.getItem(FAVOURITES_KEY);
  return raw === null ? null : JSON.parse(raw);
}

describe('favourites store', () => {
  it('uses the same storage key as the website', () => {
    expect(FAVOURITES_KEY).toBe('abf_favourites');
  });

  it('loads an empty list when nothing is stored', async () => {
    await expect(loadFavourites()).resolves.toEqual([]);
  });

  it('loads the website format: a JSON array of ids', async () => {
    await AsyncStorage.setItem(FAVOURITES_KEY, JSON.stringify(['a', 'b']));
    await expect(loadFavourites()).resolves.toEqual(['a', 'b']);
  });

  it('treats corrupt JSON as an empty list', async () => {
    await AsyncStorage.setItem(FAVOURITES_KEY, '{not json');
    await expect(loadFavourites()).resolves.toEqual([]);
  });

  it('treats a non-array value as an empty list', async () => {
    await AsyncStorage.setItem(FAVOURITES_KEY, JSON.stringify({ a: 1 }));
    await expect(loadFavourites()).resolves.toEqual([]);
  });

  it('keeps only string ids from a mixed array', async () => {
    await AsyncStorage.setItem(FAVOURITES_KEY, JSON.stringify(['a', 3, null, 'b']));
    await expect(loadFavourites()).resolves.toEqual(['a', 'b']);
  });

  it('does not throw when reading storage rejects', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    await expect(loadFavourites()).resolves.toEqual([]);
  });

  it('toggle adds an id and persists the JSON array', async () => {
    await loadFavourites();
    await toggleFavourite('a');
    expect(getFavourites()).toEqual(['a']);
    expect(await stored()).toEqual(['a']);
  });

  it('toggle on a saved id removes it', async () => {
    await AsyncStorage.setItem(FAVOURITES_KEY, JSON.stringify(['a', 'b']));
    await loadFavourites();
    await toggleFavourite('a');
    expect(getFavourites()).toEqual(['b']);
    expect(await stored()).toEqual(['b']);
  });

  it('toggle before an explicit load still builds on what is stored', async () => {
    await AsyncStorage.setItem(FAVOURITES_KEY, JSON.stringify(['a']));
    await toggleFavourite('b');
    expect(await stored()).toEqual(['a', 'b']);
  });

  it('does not throw when writing storage rejects, and keeps the in-memory change', async () => {
    await loadFavourites();
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('full'));
    await expect(toggleFavourite('a')).resolves.not.toThrow();
    expect(getFavourites()).toEqual(['a']);
  });

  it('notifies subscribers on toggle, and not after unsubscribing', async () => {
    await loadFavourites();
    const listener = jest.fn();
    const off = subscribeFavourites(listener);
    await toggleFavourite('a');
    expect(listener).toHaveBeenCalled();
    listener.mockClear();
    off();
    await toggleFavourite('b');
    expect(listener).not.toHaveBeenCalled();
  });
});
