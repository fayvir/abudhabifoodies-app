import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  ANALYTICS_PREFERENCE_KEY,
  __resetAnalyticsForTests,
  isAnalyticsEnabled,
  loadAnalyticsPreference,
  saveAnalyticsPreference,
} from '../analyticsPreference';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  __resetAnalyticsForTests();
});

describe('analytics preference', () => {
  it('uses the abf_analytics key', () => {
    expect(ANALYTICS_PREFERENCE_KEY).toBe('abf_analytics');
  });

  it('is on before anything has loaded (default is on)', () => {
    expect(isAnalyticsEnabled()).toBe(true);
  });

  it('loads on when nothing is stored', async () => {
    await expect(loadAnalyticsPreference()).resolves.toBe(true);
    expect(isAnalyticsEnabled()).toBe(true);
  });

  it('loads a saved off and updates the synchronous getter', async () => {
    await AsyncStorage.setItem('abf_analytics', 'off');
    await expect(loadAnalyticsPreference()).resolves.toBe(false);
    expect(isAnalyticsEnabled()).toBe(false);
  });

  it('loads a saved on', async () => {
    await AsyncStorage.setItem('abf_analytics', 'on');
    await expect(loadAnalyticsPreference()).resolves.toBe(true);
  });

  it.each(['OFF', 'false', '', '{x', '0'])('treats the corrupt value %j as on', async (raw) => {
    await AsyncStorage.setItem('abf_analytics', raw);
    await expect(loadAnalyticsPreference()).resolves.toBe(true);
    expect(isAnalyticsEnabled()).toBe(true);
  });

  it('swallows a read failure and stays on', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    await expect(loadAnalyticsPreference()).resolves.toBe(true);
  });

  it('saving off takes effect immediately and persists', async () => {
    const done = saveAnalyticsPreference(false);
    expect(isAnalyticsEnabled()).toBe(false); // synchronous, before storage resolves
    await done;
    await expect(AsyncStorage.getItem('abf_analytics')).resolves.toBe('off');
    await saveAnalyticsPreference(true);
    expect(isAnalyticsEnabled()).toBe(true);
    await expect(AsyncStorage.getItem('abf_analytics')).resolves.toBe('on');
  });

  it('swallows a write failure but keeps the in-memory choice', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk'));
    await expect(saveAnalyticsPreference(false)).resolves.toBeUndefined();
    expect(isAnalyticsEnabled()).toBe(false);
  });

  it('a late load does not overwrite a choice made while it was loading', async () => {
    let release: (v: string | null) => void = () => undefined;
    jest.spyOn(AsyncStorage, 'getItem').mockReturnValueOnce(new Promise((r) => (release = r)));
    const loading = loadAnalyticsPreference();
    await saveAnalyticsPreference(false);
    release('on');
    await loading;
    expect(isAnalyticsEnabled()).toBe(false);
  });
});
