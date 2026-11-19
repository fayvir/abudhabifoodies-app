import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

import {
  THEME_PREFERENCE_KEY,
  applyThemePreference,
  loadThemePreference,
  saveThemePreference,
} from '../themePreference';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

let setScheme: jest.SpyInstance;

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  setScheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => undefined);
});

describe('theme preference storage', () => {
  it('uses the abf_theme key', () => {
    expect(THEME_PREFERENCE_KEY).toBe('abf_theme');
  });

  it('defaults to system when nothing is stored', async () => {
    await expect(loadThemePreference()).resolves.toBe('system');
  });

  it.each(['system', 'light', 'dark'] as const)('loads a saved %s', async (value) => {
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, value);
    await expect(loadThemePreference()).resolves.toBe(value);
  });

  it.each(['purple', '', '"dark"', '{not json', 'DARK'])('treats the corrupt value %j as system', async (raw) => {
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, raw);
    await expect(loadThemePreference()).resolves.toBe('system');
  });

  it('saves the choice under abf_theme', async () => {
    await saveThemePreference('dark');
    await expect(AsyncStorage.getItem('abf_theme')).resolves.toBe('dark');
  });

  it('swallows a storage read failure and falls back to system', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValue(new Error('disk'));
    await expect(loadThemePreference()).resolves.toBe('system');
  });

  it('swallows a storage write failure', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValue(new Error('disk'));
    await expect(saveThemePreference('light')).resolves.toBeUndefined();
  });
});

describe('applyThemePreference', () => {
  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
    // RN 0.88: null is not a valid ColorSchemeOverride (and Android's native method takes a non-null
    // String); 'auto' is the documented way to drop the override and follow the phone.
    ['system', 'auto'],
  ] as const)('%s calls Appearance.setColorScheme(%s)', (pref, arg) => {
    applyThemePreference(pref);
    expect(setScheme).toHaveBeenCalledWith(arg);
  });

  it('does not throw when setColorScheme throws', () => {
    setScheme.mockImplementation(() => {
      throw new Error('native');
    });
    expect(() => applyThemePreference('dark')).not.toThrow();
  });
});
