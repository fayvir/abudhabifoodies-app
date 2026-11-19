import AsyncStorage from '@react-native-async-storage/async-storage';

import { pick } from '../../testing/builders';
import {
  HISTORY_KEY,
  HISTORY_LIMIT,
  __resetHistoryForTests,
  clearHistory,
  getHistoryState,
  loadHistory,
  recordPick,
  removeHistoryEntry,
} from '../store';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  __resetHistoryForTests();
});

const saved = async () => JSON.parse((await AsyncStorage.getItem(HISTORY_KEY)) ?? 'null');

describe('search history store', () => {
  it('starts empty and loaded after the first load', async () => {
    expect(getHistoryState().loaded).toBe(false);
    await loadHistory();
    expect(getHistoryState()).toEqual({ entries: [], loaded: true });
  });

  it('records a pick with the fields the Recent list shows, and persists it', async () => {
    await recordPick(pick(), ['Arabic', 'Mid']);
    const [entry] = getHistoryState().entries;
    expect(entry).toEqual({
      key: 'rest-1',
      name: 'Operation Falafel',
      area: 'Al Reem Island',
      price_range: 2,
      phone: '+97125550100',
      google_maps: 'https://maps.google.com/?cid=111',
      website: 'https://operationfalafel.example',
      answers: ['Arabic', 'Mid'],
    });
    expect(await saved()).toEqual([entry]);
  });

  it('keeps the newest first and one entry per restaurant (a repeat moves to the front with the new answers)', async () => {
    await recordPick(pick({ restaurant_id: 'a', restaurant_name: 'A' }), ['x']);
    await recordPick(pick({ restaurant_id: 'b', restaurant_name: 'B' }), ['y']);
    await recordPick(pick({ restaurant_id: 'a', restaurant_name: 'A' }), ['z']);
    expect(getHistoryState().entries.map((e) => [e.key, e.answers])).toEqual([
      ['a', ['z']],
      ['b', ['y']],
    ]);
  });

  it('keys a pick with no catalogue record by its name', async () => {
    await recordPick(pick({ restaurant_id: null, restaurant_name: 'Pop-up' }), []);
    expect(getHistoryState().entries[0].key).toBe('Pop-up');
  });

  it(`keeps at most ${HISTORY_LIMIT}, dropping the oldest`, async () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      await recordPick(pick({ restaurant_id: `r${i}`, restaurant_name: `R${i}` }), []);
    }
    const entries = getHistoryState().entries;
    expect(entries).toHaveLength(HISTORY_LIMIT);
    expect(entries[0].key).toBe(`r${HISTORY_LIMIT + 4}`);
    expect(entries.at(-1)?.key).toBe('r5');
  });

  it('loads what was saved on a previous run', async () => {
    await recordPick(pick(), ['Arabic']);
    __resetHistoryForTests();
    await loadHistory();
    expect(getHistoryState().entries.map((e) => e.name)).toEqual(['Operation Falafel']);
  });

  it.each([['not json'], ['{"a":1}'], ['[1,null,{"key":"k"}]']])('treats corrupt data %p as empty', async (raw) => {
    await AsyncStorage.setItem(HISTORY_KEY, raw);
    await loadHistory();
    expect(getHistoryState().entries).toEqual([]);
  });

  it('survives a storage failure: the in-memory entry stays', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk'));
    await recordPick(pick(), []);
    expect(getHistoryState().entries).toHaveLength(1);
  });

  it('removeHistoryEntry drops one entry, in memory and on disk', async () => {
    await recordPick(pick({ restaurant_id: 'a', restaurant_name: 'A' }), []);
    await recordPick(pick({ restaurant_id: 'b', restaurant_name: 'B' }), []);
    await removeHistoryEntry('a');
    expect(getHistoryState().entries.map((e) => e.key)).toEqual(['b']);
    expect((await saved()).map((e: { key: string }) => e.key)).toEqual(['b']);
  });

  it('clearHistory empties it in memory and on disk', async () => {
    await recordPick(pick(), []);
    await clearHistory();
    expect(getHistoryState().entries).toEqual([]);
    expect(await saved()).toEqual([]);
  });
});
