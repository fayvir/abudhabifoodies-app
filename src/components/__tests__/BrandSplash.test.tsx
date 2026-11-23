import { act, render } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AppState } from 'react-native';

import * as client from '../../api/client';
import type { DiscoverySnapshot } from '../../api/types';
import { __resetSnapshotForTests } from '../../snapshot/useSnapshot';
import { question, snapshot } from '../../testing/builders';
import { BrandSplash, SPLASH_MAX_MS, SPLASH_MIN_MS } from '../BrandSplash';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(() => Promise.resolve()), preventAutoHideAsync: jest.fn() }));
jest.mock('../../api/client', () => ({ SNAPSHOT_VERSION: 1, getSnapshot: jest.fn() }));

const api = jest.mocked(client);
const snap: DiscoverySnapshot = snapshot([question('q', 'cuisine', [])]);

beforeEach(() => {
  __resetSnapshotForTests();
  jest.clearAllMocks();
  api.getSnapshot.mockReset();
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Lets fades finish (Animated runs on timers in tests). */
async function settle() {
  await act(async () => jest.advanceTimersByTime(1000));
}

describe('BrandSplash', () => {
  it('shows the brand name, and hides the native splash once it has drawn', async () => {
    api.getSnapshot.mockReturnValue(new Promise(() => undefined));
    const view = await render(<BrandSplash />);
    expect(view.getByText('Abu Dhabi Foodies')).toBeTruthy();
    await act(async () => {
      view.getByTestId('brand-splash').props.onLayout?.({ nativeEvent: { layout: {} } });
    });
    expect(SplashScreen.hideAsync).toHaveBeenCalled();
  });

  it('stays at least the minimum time even when the guide is ready at once', async () => {
    api.getSnapshot.mockResolvedValue({ ok: true, data: snap });
    const view = await render(<BrandSplash />);
    await act(async () => jest.advanceTimersByTime(SPLASH_MIN_MS - 100));
    expect(view.queryByTestId('brand-splash')).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(100));
    await settle();
    expect(view.queryByTestId('brand-splash')).toBeNull();
  });

  it('stays while the guide is still loading after the minimum', async () => {
    let release: (v: { ok: true; data: DiscoverySnapshot }) => void = () => undefined;
    api.getSnapshot.mockReturnValue(new Promise((r) => { release = r; }));
    const view = await render(<BrandSplash />);
    await act(async () => jest.advanceTimersByTime(SPLASH_MIN_MS + 1000));
    expect(view.queryByTestId('brand-splash')).toBeTruthy();
    await act(async () => release({ ok: true, data: snap }));
    await settle();
    expect(view.queryByTestId('brand-splash')).toBeNull();
  });

  it('leaves on a load error, so Discover can show Try again', async () => {
    api.getSnapshot.mockResolvedValue({ ok: false, message: 'offline' });
    const view = await render(<BrandSplash />);
    await act(async () => jest.advanceTimersByTime(SPLASH_MIN_MS));
    await settle();
    expect(view.queryByTestId('brand-splash')).toBeNull();
  });

  it('never stays longer than the maximum, even if the download hangs', async () => {
    api.getSnapshot.mockReturnValue(new Promise(() => undefined));
    const view = await render(<BrandSplash />);
    await act(async () => jest.advanceTimersByTime(SPLASH_MAX_MS));
    await settle();
    expect(view.queryByTestId('brand-splash')).toBeNull();
  });
});
