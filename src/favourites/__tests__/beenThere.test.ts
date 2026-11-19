import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  BEEN_THERE_KEY,
  FAVOURITES_KEY,
  __resetFavouritesForTests,
  addBeenThere,
  clearBeenThere,
  clearWantToTry,
  getBeenThere,
  getFavourites,
  loadBeenThere,
  loadFavourites,
  moveBackToWantToTry,
  moveToBeenThere,
  removeBeenThere,
  subscribeBeenThere,
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

async function stored(key: string): Promise<unknown> {
  const raw = await AsyncStorage.getItem(key);
  return raw === null ? null : JSON.parse(raw);
}

describe('been-there store', () => {
  it('uses its own key and leaves the favourites key alone', () => {
    expect(BEEN_THERE_KEY).toBe('abf_been_there');
    expect(FAVOURITES_KEY).toBe('abf_favourites');
  });

  it('loads an empty list when nothing is stored', async () => {
    await expect(loadBeenThere()).resolves.toEqual([]);
  });

  it('loads a stored array of ids, keeping only strings', async () => {
    await AsyncStorage.setItem(BEEN_THERE_KEY, JSON.stringify(['a', 7, 'b']));
    await expect(loadBeenThere()).resolves.toEqual(['a', 'b']);
  });

  it.each(['{not json', '{"a":1}', '"x"'])('treats the corrupt value %j as empty', async (raw) => {
    await AsyncStorage.setItem(BEEN_THERE_KEY, raw);
    await expect(loadBeenThere()).resolves.toEqual([]);
  });

  it('does not throw when reading or writing storage rejects', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    await expect(loadBeenThere()).resolves.toEqual([]);
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('full'));
    await expect(addBeenThere('a')).resolves.not.toThrow();
    expect(getBeenThere()).toEqual(['a']);
  });

  it('add persists, is idempotent, and remove persists', async () => {
    await addBeenThere('a');
    await addBeenThere('a');
    await addBeenThere('b');
    expect(getBeenThere()).toEqual(['a', 'b']);
    expect(await stored(BEEN_THERE_KEY)).toEqual(['a', 'b']);
    await removeBeenThere('a');
    expect(await stored(BEEN_THERE_KEY)).toEqual(['b']);
  });

  it('notifies subscribers, and not after unsubscribing', async () => {
    await loadBeenThere();
    const listener = jest.fn();
    const off = subscribeBeenThere(listener);
    await addBeenThere('a');
    expect(listener).toHaveBeenCalled();
    listener.mockClear();
    off();
    await addBeenThere('b');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('moving between lists', () => {
  it('moveToBeenThere removes from Want to try, adds to Been there, persists both', async () => {
    await AsyncStorage.setItem(FAVOURITES_KEY, JSON.stringify(['a', 'b']));
    await moveToBeenThere('a');
    expect(getFavourites()).toEqual(['b']);
    expect(getBeenThere()).toEqual(['a']);
    expect(await stored(FAVOURITES_KEY)).toEqual(['b']);
    expect(await stored(BEEN_THERE_KEY)).toEqual(['a']);
  });

  it('moveBackToWantToTry is the reverse', async () => {
    await AsyncStorage.setItem(BEEN_THERE_KEY, JSON.stringify(['a']));
    await AsyncStorage.setItem(FAVOURITES_KEY, JSON.stringify(['b']));
    await moveBackToWantToTry('a');
    expect(getBeenThere()).toEqual([]);
    expect(getFavourites()).toEqual(['b', 'a']);
    expect(await stored(BEEN_THERE_KEY)).toEqual([]);
    expect(await stored(FAVOURITES_KEY)).toEqual(['b', 'a']);
  });

  it('never leaves an id in both lists, even if it was already in Been there', async () => {
    await AsyncStorage.setItem(BEEN_THERE_KEY, JSON.stringify(['a']));
    await AsyncStorage.setItem(FAVOURITES_KEY, JSON.stringify(['a']));
    await moveToBeenThere('a');
    expect(getFavourites()).toEqual([]);
    expect(getBeenThere()).toEqual(['a']);
  });

  it('does not touch the existing favourites storage format for plain hearts', async () => {
    await loadFavourites();
    await toggleFavourite('x');
    expect(await stored(FAVOURITES_KEY)).toEqual(['x']);
    expect(await stored(BEEN_THERE_KEY)).toBeNull();
  });
});

describe('hearting a place that is in Been there', () => {
  it('moves it to Want to try instead of putting it in both lists', async () => {
    await addBeenThere('r1');
    await toggleFavourite('r1');
    expect(getFavourites()).toContain('r1');
    expect(getBeenThere()).not.toContain('r1');
    expect(await stored(BEEN_THERE_KEY)).toEqual([]);
  });
});

describe('clearing one list', () => {
  it('clearWantToTry and clearBeenThere each empty only their own list', async () => {
    await toggleFavourite('a');
    await addBeenThere('b');
    await clearWantToTry();
    expect(getFavourites()).toEqual([]);
    expect(getBeenThere()).toEqual(['b']);
    expect(await AsyncStorage.getItem(FAVOURITES_KEY)).toBe('[]');
    await clearBeenThere();
    expect(getBeenThere()).toEqual([]);
    expect(await AsyncStorage.getItem(BEEN_THERE_KEY)).toBe('[]');
  });
});
