import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';

import RootLayout from '../../app/_layout';
import { __resetAnalyticsForTests, isAnalyticsEnabled } from '../settings/analyticsPreference';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({ Stack: () => null }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(() => Promise.resolve()), preventAutoHideAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('../components/BrandSplash', () => ({ BrandSplash: () => null }));

let setScheme: jest.SpyInstance;

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  setScheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => undefined);
});

describe('root layout theme preference', () => {
  it('applies the saved preference at app start', async () => {
    await AsyncStorage.setItem('abf_theme', 'dark');
    await render(<RootLayout />);
    await waitFor(() => expect(setScheme).toHaveBeenCalledWith('dark'));
  });

  it('follows the phone (auto) when nothing is saved', async () => {
    await render(<RootLayout />);
    await waitFor(() => expect(setScheme).toHaveBeenCalledWith('auto'));
  });

  it('loads the preference once, not on every render', async () => {
    const get = jest.spyOn(AsyncStorage, 'getItem');
    get.mockClear(); // the async-storage mock's own jest.fn keeps calls from earlier tests
    const view = await render(<RootLayout />);
    await view.rerender(<RootLayout />);
    await waitFor(() => expect(setScheme).toHaveBeenCalledTimes(1));
    // Only the theme read: the analytics preference is read at start too, but separately.
    expect(get.mock.calls.filter(([key]) => key === 'abf_theme')).toHaveLength(1);
  });
});

describe('root layout analytics preference', () => {
  beforeEach(() => __resetAnalyticsForTests());

  it('loads the saved analytics choice at app start', async () => {
    await AsyncStorage.setItem('abf_analytics', 'off');
    await render(<RootLayout />);
    await waitFor(() => expect(isAnalyticsEnabled()).toBe(false));
  });

  it('stays on when nothing is saved', async () => {
    await render(<RootLayout />);
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith('abf_analytics'));
    expect(isAnalyticsEnabled()).toBe(true);
  });
});

describe('root layout splash', () => {
  it('holds the native splash at start (BrandSplash hides it once drawn)', () => {
    expect(jest.requireMock('expo-splash-screen').preventAutoHideAsync).toHaveBeenCalled();
  });
});
