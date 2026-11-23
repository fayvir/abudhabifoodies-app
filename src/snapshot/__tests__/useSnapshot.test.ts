import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import * as client from '../../api/client';
import type { DiscoverySnapshot } from '../../api/types';
import { question, snapshot } from '../../testing/builders';
import { loadStoredSnapshot, SNAPSHOT_STORAGE_KEY } from '../store';
import { __resetSnapshotForTests, REFRESH_AFTER_MS, useSnapshot } from '../useSnapshot';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../api/client', () => ({ SNAPSHOT_VERSION: 1, getSnapshot: jest.fn() }));

const api = jest.mocked(client);
const one = snapshot([question('q1', 'cuisine', [])], { generated_at: 'one' });
const two = snapshot([question('q1', 'cuisine', [])], { generated_at: 'two' });

let onAppState: (state: AppStateStatus) => void = () => undefined;

beforeEach(async () => {
  __resetSnapshotForTests();
  jest.clearAllMocks();
  api.getSnapshot.mockReset();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    onAppState = handler as (state: AppStateStatus) => void;
    return { remove: jest.fn() } as never;
  });
  await AsyncStorage.clear();
});

afterEach(() => jest.restoreAllMocks());

async function store(snap: DiscoverySnapshot, fetchedAt: number) {
  await AsyncStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify({ fetchedAt, snapshot: snap }));
}

describe('useSnapshot', () => {
  it('downloads on launch, becomes ready, and stores the copy', async () => {
    api.getSnapshot.mockResolvedValue({ ok: true, data: one });
    const { result } = await renderHook(() => useSnapshot());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.snapshot).toBe(one);
    await waitFor(async () => expect((await loadStoredSnapshot())?.snapshot).toEqual(one));
  });

  it('uses the stored copy at once and still downloads a fresh one on launch', async () => {
    await store(one, Date.now());
    let release: (v: { ok: true; data: DiscoverySnapshot }) => void = () => undefined;
    api.getSnapshot.mockReturnValue(new Promise((r) => { release = r; }));
    const { result } = await renderHook(() => useSnapshot());
    await waitFor(() => expect(result.current.snapshot?.generated_at).toBe('one'));
    expect(api.getSnapshot).toHaveBeenCalledTimes(1);
    await act(async () => release({ ok: true, data: two }));
    expect(result.current.snapshot?.generated_at).toBe('two');
  });

  it('keeps the stored copy when the download fails', async () => {
    await store(one, Date.now());
    api.getSnapshot.mockResolvedValue({ ok: false, message: 'offline' });
    const { result } = await renderHook(() => useSnapshot());
    await waitFor(() => expect(result.current.snapshot?.generated_at).toBe('one'));
    await waitFor(() => expect(api.getSnapshot).toHaveBeenCalled());
    expect(result.current.status).toBe('ready');
  });

  it('is an error only with no copy at all; retry downloads again', async () => {
    api.getSnapshot.mockResolvedValueOnce({ ok: false, message: 'offline' });
    const { result } = await renderHook(() => useSnapshot());
    await waitFor(() => expect(result.current.status).toBe('error'));
    api.getSnapshot.mockResolvedValueOnce({ ok: true, data: one });
    await act(async () => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('retry while a download is still running shares it instead of flashing the error', async () => {
    api.getSnapshot.mockResolvedValueOnce({ ok: false, message: 'offline' });
    const { result } = await renderHook(() => useSnapshot());
    await waitFor(() => expect(result.current.status).toBe('error'));
    let release: (v: { ok: true; data: DiscoverySnapshot }) => void = () => undefined;
    api.getSnapshot.mockReturnValueOnce(new Promise((r) => { release = r; }));
    await act(async () => result.current.retry());
    await act(async () => result.current.retry());
    expect(result.current.status).toBe('loading');
    expect(api.getSnapshot).toHaveBeenCalledTimes(2);
    await act(async () => release({ ok: true, data: one }));
    expect(result.current.status).toBe('ready');
  });

  it('ignores a stored copy from another snapshot version', async () => {
    await store({ ...one, version: 99 }, Date.now());
    api.getSnapshot.mockReturnValue(new Promise(() => undefined));
    const { result } = await renderHook(() => useSnapshot());
    await act(async () => undefined);
    expect(result.current.snapshot).toBeNull();
    expect(result.current.status).toBe('loading');
  });

  it('refreshes on return to the foreground only when the copy is over an hour old', async () => {
    const now = jest.spyOn(Date, 'now');
    const t0 = 1_800_000_000_000;
    now.mockReturnValue(t0);
    api.getSnapshot.mockResolvedValueOnce({ ok: true, data: one });
    const { result } = await renderHook(() => useSnapshot());
    await waitFor(() => expect(result.current.snapshot?.generated_at).toBe('one'));

    now.mockReturnValue(t0 + REFRESH_AFTER_MS - 1000);
    await act(async () => onAppState('active'));
    expect(api.getSnapshot).toHaveBeenCalledTimes(1);

    now.mockReturnValue(t0 + REFRESH_AFTER_MS + 1000);
    await act(async () => onAppState('background'));
    expect(api.getSnapshot).toHaveBeenCalledTimes(1);

    api.getSnapshot.mockResolvedValueOnce({ ok: true, data: two });
    await act(async () => onAppState('active'));
    expect(api.getSnapshot).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.snapshot?.generated_at).toBe('two'));
  });

  it('is one download shared by every screen that reads it (splash and Discover)', async () => {
    api.getSnapshot.mockResolvedValue({ ok: true, data: one });
    const a = await renderHook(() => useSnapshot());
    const b = await renderHook(() => useSnapshot());
    await waitFor(() => expect(a.result.current.status).toBe('ready'));
    expect(b.result.current.snapshot).toBe(one);
    expect(api.getSnapshot).toHaveBeenCalledTimes(1);
  });
});
