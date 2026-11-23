import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import * as client from '../../api/client';
import { BEEN_THERE_KEY, __resetFavouritesForTests, FAVOURITES_KEY, toggleFavourite } from '../../favourites/store';
import { __resetHistoryForTests, getHistoryState, recordPick } from '../../history/store';
import { opt, pick, question, restaurant, snapshot } from '../../testing/builders';
import Favourites from '../../../app/(tabs)/favourites';
import Discover from '../../../app/(tabs)/index';
import { __resetSnapshotForTests } from '../../snapshot/useSnapshot';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../api/client');

const api = jest.mocked(client);

async function open(ids: string[] | null, been: string[] | null = null) {
  if (ids) await AsyncStorage.setItem(FAVOURITES_KEY, JSON.stringify(ids));
  if (been) await AsyncStorage.setItem(BEEN_THERE_KEY, JSON.stringify(been));
  return renderRouter({ index: Discover, favourites: Favourites }, { initialUrl: '/favourites' });
}

beforeEach(async () => {
  __resetSnapshotForTests();
  jest.clearAllMocks();
  await AsyncStorage.clear();
  __resetFavouritesForTests();
  __resetHistoryForTests();
  api.getSnapshot.mockResolvedValue({
    ok: true,
    data: snapshot([question('q-c', 'cuisine', [opt('arabic', { label: 'Arabic' })], { label: 'What are you in the mood for?' })]),
  });
  api.trackFlowEvent.mockResolvedValue(undefined);
  api.getRestaurantsByIds.mockResolvedValue({ ok: true, data: [] });
});

describe('Favourites screen', () => {
  it('shows the empty state and makes no request when nothing is saved', async () => {
    const view = await open(null);
    await waitFor(() => expect(view.getByText('Nothing saved yet')).toBeTruthy());
    expect(api.getRestaurantsByIds).not.toHaveBeenCalled();
  });

  it('the empty-state button goes back to Discover', async () => {
    const view = await open([]);
    await fireEvent.press(await view.findByRole('button', { name: /Find somewhere to eat/ }));
    await waitFor(() => expect(view.getByText('What are you in the mood for?')).toBeTruthy());
    expect(view.getByRole('button', { name: 'Arabic' })).toBeTruthy();
  });

  it('shows only a spinner (no message) while the restaurants load', async () => {
    api.getRestaurantsByIds.mockReturnValue(new Promise(() => undefined));
    const view = await open(['rest-1']);
    await waitFor(() => expect(api.getRestaurantsByIds).toHaveBeenCalled());
    expect(view.queryByText(/Loading/)).toBeNull();
    expect(view.queryByText('Nothing saved yet')).toBeNull();
  });

  it('loads the saved ids through getRestaurantsByIds and lists name, area and price symbol', async () => {
    api.getRestaurantsByIds.mockResolvedValue({
      ok: true,
      data: [restaurant({ id: 'a', name: 'Alpha Grill', area: 'Saadiyat', price_range: 3 })],
    });
    const view = await open(['a', 'b']);
    await waitFor(() => expect(view.getByText('Alpha Grill')).toBeTruthy());
    expect(api.getRestaurantsByIds).toHaveBeenCalledWith(['a', 'b']);
    expect(view.getByText('Saadiyat · $$$')).toBeTruthy();
  });

  it('folds price_range 4 into $$$', async () => {
    api.getRestaurantsByIds.mockResolvedValue({ ok: true, data: [restaurant({ price_range: 4 })] });
    const view = await open(['rest-1']);
    await waitFor(() => expect(view.getByText(/\$\$\$$/)).toBeTruthy());
    expect(view.queryByText(/\$\$\$\$/)).toBeNull();
  });

  it('renders a restaurant whose cuisine, area and price_range are all null, without printing "null"', async () => {
    api.getRestaurantsByIds.mockResolvedValue({
      ok: true,
      data: [
        restaurant({
          name: 'Mystery Cafe',
          cuisine: null as unknown as string[],
          area: null as unknown as string,
          price_range: null as unknown as number,
          rating: null,
        }),
      ],
    });
    const view = await open(['rest-1']);
    await waitFor(() => expect(view.getByText('Mystery Cafe')).toBeTruthy());
    expect(view.queryByText(/null|undefined|NaN/)).toBeNull();
  });

  it('removing the heart drops the row and persists, without refetching', async () => {
    api.getRestaurantsByIds.mockResolvedValue({
      ok: true,
      data: [restaurant({ id: 'a', name: 'Alpha Grill' }), restaurant({ id: 'b', name: 'Beta Bar' })],
    });
    const view = await open(['a', 'b']);
    await fireEvent.press(await view.findByRole('button', { name: 'Remove Alpha Grill' }));
    await waitFor(() => expect(view.queryByText('Alpha Grill')).toBeNull());
    expect(view.getByText('Beta Bar')).toBeTruthy();
    expect(JSON.parse((await AsyncStorage.getItem(FAVOURITES_KEY)) ?? 'null')).toEqual(['b']);
    expect(api.getRestaurantsByIds).toHaveBeenCalledTimes(1);
  });

  it('a favourite added while the tab stays mounted appears without a restart', async () => {
    api.getRestaurantsByIds.mockImplementation(async (ids) => ({
      ok: true,
      data: [restaurant({ id: 'a', name: 'Alpha Grill' }), restaurant({ id: 'b', name: 'Beta Bar' })].filter((r) =>
        ids.includes(r.id),
      ),
    }));
    const view = await open(['a']);
    await waitFor(() => expect(view.getByText('Alpha Grill')).toBeTruthy());
    expect(view.queryByText('Beta Bar')).toBeNull();
    await act(async () => {
      await toggleFavourite('b');
    });
    await waitFor(() => expect(view.getByText('Beta Bar')).toBeTruthy());
    expect(view.getByText('Alpha Grill')).toBeTruthy();
    expect(api.getRestaurantsByIds).toHaveBeenLastCalledWith(expect.arrayContaining(['b']));
  });

  it('adding a favourite keeps loaded rows visible while only the new id is fetched, then merges it', async () => {
    let release: (v: Awaited<ReturnType<typeof client.getRestaurantsByIds>>) => void = () => undefined;
    api.getRestaurantsByIds.mockResolvedValueOnce({ ok: true, data: [restaurant({ id: 'a', name: 'Alpha Grill' })] });
    const view = await open(['a']);
    await waitFor(() => expect(view.getByText('Alpha Grill')).toBeTruthy());
    api.getRestaurantsByIds.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    await act(async () => {
      await toggleFavourite('b');
    });
    await waitFor(() => expect(api.getRestaurantsByIds).toHaveBeenCalledTimes(2));
    expect(api.getRestaurantsByIds).toHaveBeenLastCalledWith(['b']);
    expect(view.getByText('Alpha Grill')).toBeTruthy();
    expect(view.queryByText('Loading your saved spots…')).toBeNull();
    await act(async () => {
      release({ ok: true, data: [restaurant({ id: 'b', name: 'Beta Bar' })] });
    });
    await waitFor(() => expect(view.getByText('Beta Bar')).toBeTruthy());
    expect(view.getByText('Alpha Grill')).toBeTruthy();
  });

  it('a failed fetch for a newly added favourite leaves the loaded rows and shows no error screen', async () => {
    api.getRestaurantsByIds.mockResolvedValueOnce({ ok: true, data: [restaurant({ id: 'a', name: 'Alpha Grill' })] });
    const view = await open(['a']);
    await waitFor(() => expect(view.getByText('Alpha Grill')).toBeTruthy());
    api.getRestaurantsByIds.mockResolvedValueOnce({ ok: false, message: 'offline' });
    await act(async () => {
      await toggleFavourite('b');
    });
    await waitFor(() => expect(api.getRestaurantsByIds).toHaveBeenCalledTimes(2));
    expect(view.getByText('Alpha Grill')).toBeTruthy();
    expect(view.queryByText(/couldn't load/i)).toBeNull();
  });

  it('removing the last favourite shows the empty state', async () => {
    api.getRestaurantsByIds.mockResolvedValue({ ok: true, data: [restaurant({ id: 'a', name: 'Alpha Grill' })] });
    const view = await open(['a']);
    await fireEvent.press(await view.findByRole('button', { name: 'Remove Alpha Grill' }));
    await waitFor(() => expect(view.getByText('Nothing saved yet')).toBeTruthy());
  });

  it('a saved id the server no longer returns is simply absent, with no error', async () => {
    api.getRestaurantsByIds.mockResolvedValue({ ok: true, data: [restaurant({ id: 'a', name: 'Alpha Grill' })] });
    const view = await open(['a', 'gone']);
    await waitFor(() => expect(view.getByText('Alpha Grill')).toBeTruthy());
    expect(view.queryByText(/couldn't load/i)).toBeNull();
  });

  it('shows the load failure with Try again, which reloads', async () => {
    api.getRestaurantsByIds.mockResolvedValueOnce({ ok: false, message: 'offline' });
    api.getRestaurantsByIds.mockResolvedValue({ ok: true, data: [restaurant({ id: 'a', name: 'Alpha Grill' })] });
    const view = await open(['a']);
    await waitFor(() => expect(view.getByText("Couldn't load your saved places.")).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(view.getByText('Alpha Grill')).toBeTruthy());
    expect(api.getRestaurantsByIds).toHaveBeenCalledTimes(2);
  });

  it('opens a restaurant\'s Call action with its phone', async () => {
    const { Linking } = jest.requireActual<typeof import('react-native')>('react-native');
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    api.getRestaurantsByIds.mockResolvedValue({ ok: true, data: [restaurant({ id: 'a', name: 'Alpha Grill', phone: '+971 1' })] });
    const view = await open(['a']);
    await fireEvent.press(await view.findByRole('button', { name: 'Call Alpha Grill' }));
    expect(openURL).toHaveBeenCalledWith('tel:+971 1');
  });
});

describe('Saved screen: Want to try / Been there', () => {
  const two = () =>
    api.getRestaurantsByIds.mockImplementation(async (ids) => ({
      ok: true,
      data: [restaurant({ id: 'a', name: 'Alpha Grill' }), restaurant({ id: 'b', name: 'Beta Bar' })].filter((r) =>
        ids.includes(r.id),
      ),
    }));

  it('has a Want to try / Been there control with Want to try selected first', async () => {
    const view = await open(['a']);
    expect(await view.findByRole('tab', { name: 'Want To Try', selected: true })).toBeTruthy();
    expect(view.getByRole('tab', { name: 'Been There', selected: false })).toBeTruthy();
  });

  it('shows each list on its own segment, loading both through one getRestaurantsByIds call', async () => {
    two();
    const view = await open(['a'], ['b']);
    await waitFor(() => expect(view.getByText('Alpha Grill')).toBeTruthy());
    expect(view.queryByText('Beta Bar')).toBeNull();
    expect(api.getRestaurantsByIds).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByRole('tab', { name: 'Been There' }));
    await waitFor(() => expect(view.getByText('Beta Bar')).toBeTruthy());
    expect(view.queryByText('Alpha Grill')).toBeNull();
    expect(api.getRestaurantsByIds).toHaveBeenCalledTimes(1);
  });

  it('has its own empty state on the Been there segment', async () => {
    const view = await open(['a']);
    await fireEvent.press(await view.findByRole('tab', { name: 'Been There' }));
    await waitFor(() => expect(view.getByText("Mark places you've visited")).toBeTruthy());
    expect(view.queryByText('Nothing saved yet')).toBeNull();
  });

  it('Been there ✓ moves a restaurant from Want to try to Been there, persisting both, without refetching', async () => {
    two();
    const view = await open(['a', 'b']);
    await fireEvent.press(await view.findByRole('button', { name: 'Mark Alpha Grill as Been There' }));
    await waitFor(() => expect(view.queryByText('Alpha Grill')).toBeNull());
    expect(view.getByText('Beta Bar')).toBeTruthy();
    expect(JSON.parse((await AsyncStorage.getItem(FAVOURITES_KEY)) ?? 'null')).toEqual(['b']);
    expect(JSON.parse((await AsyncStorage.getItem(BEEN_THERE_KEY)) ?? 'null')).toEqual(['a']);
    await fireEvent.press(view.getByRole('tab', { name: 'Been There' }));
    await waitFor(() => expect(view.getByText('Alpha Grill')).toBeTruthy());
    expect(api.getRestaurantsByIds).toHaveBeenCalledTimes(1);
  });

  it('Move back returns a Been there restaurant to Want to try', async () => {
    two();
    const view = await open([], ['a']);
    await fireEvent.press(await view.findByRole('tab', { name: 'Been There' }));
    await fireEvent.press(await view.findByRole('button', { name: 'Move Alpha Grill back to Want To Try' }));
    await waitFor(() => expect(view.getByText("Mark places you've visited")).toBeTruthy());
    expect(JSON.parse((await AsyncStorage.getItem(BEEN_THERE_KEY)) ?? 'null')).toEqual([]);
    expect(JSON.parse((await AsyncStorage.getItem(FAVOURITES_KEY)) ?? 'null')).toEqual(['a']);
    await fireEvent.press(view.getByRole('tab', { name: 'Want To Try' }));
    await waitFor(() => expect(view.getByText('Alpha Grill')).toBeTruthy());
  });

  it('Remove from Been there drops it from that list only, without refetching', async () => {
    two();
    const view = await open(['a'], ['b']);
    await fireEvent.press(await view.findByRole('tab', { name: 'Been There' }));
    await fireEvent.press(await view.findByRole('button', { name: 'Remove Beta Bar' }));
    await waitFor(() => expect(view.queryByText('Beta Bar')).toBeNull());
    expect(JSON.parse((await AsyncStorage.getItem(BEEN_THERE_KEY)) ?? 'null')).toEqual([]);
    expect(JSON.parse((await AsyncStorage.getItem(FAVOURITES_KEY)) ?? 'null')).toEqual(['a']);
    expect(api.getRestaurantsByIds).toHaveBeenCalledTimes(1);
  });

  it('the heart on a result card still adds to Want to try', async () => {
    const { ResultCard } = jest.requireActual<typeof import('../../components/ResultCard')>('../../components/ResultCard');
    const { render } = jest.requireActual<typeof import('@testing-library/react-native')>('@testing-library/react-native');
    const { pick } = jest.requireActual<typeof import('../../testing/builders')>('../../testing/builders');
    const card = await render(<ResultCard card={pick({ restaurant_id: 'a' })} />);
    await fireEvent.press(card.getByRole('button', { name: 'Save to favourites' }));
    await waitFor(() => expect(AsyncStorage.getItem(FAVOURITES_KEY)).resolves.toBe(JSON.stringify(['a'])));
    expect(await AsyncStorage.getItem(BEEN_THERE_KEY)).toBeNull();
  });

  it('shows the fixed brand header', async () => {
    const view = await open(['a']);
    expect(await view.findByTestId('app-header-bar')).toBeTruthy();
  });

  it('puts the Want to try / Been there buttons below the list, in thumb reach', async () => {
    two();
    const view = await open(['a']);
    await waitFor(() => expect(view.getByText('Alpha Grill')).toBeTruthy());
    const tree = JSON.stringify(view.toJSON());
    expect(tree.indexOf('Alpha Grill')).toBeGreaterThan(-1);
    expect(tree.indexOf('Alpha Grill')).toBeLessThan(tree.indexOf('"tablist"'));
  });

  it('segment buttons are at least 44pt tall', async () => {
    const view = await open(['a']);
    const tab = await view.findByRole('tab', { name: 'Want To Try' });
    const flat = Object.assign({}, ...[tab.props.style].flat(Infinity).filter(Boolean));
    expect(flat.minHeight).toBeGreaterThanOrEqual(44);
  });
});

describe('Saved screen: Recent', () => {
  const two = () =>
    api.getRestaurantsByIds.mockImplementation(async (ids) => ({
      ok: true,
      data: [restaurant({ id: 'a', name: 'Alpha Grill' })].filter((r) => ids.includes(r.id)),
    }));

  it('is the third button, after Want to try and Been there', async () => {
    const view = await open(null);
    expect(await view.findByRole('tab', { name: 'Recent', selected: false })).toBeTruthy();
  });

  it('has an empty state and no Clear button when nothing was shown yet', async () => {
    const view = await open(null);
    await fireEvent.press(await view.findByRole('tab', { name: 'Recent' }));
    await waitFor(() => expect(view.getByText('No history yet.')).toBeTruthy());
    expect(view.queryByRole('button', { name: 'Clear Recent' })).toBeNull();
    expect(api.getRestaurantsByIds).not.toHaveBeenCalled();
  });

  it('lists recent picks newest first with the answers behind them, without a network request', async () => {
    await recordPick(pick({ restaurant_id: 'a', restaurant_name: 'Alpha Grill' }), ['Arabic', 'Mid']);
    await recordPick(pick({ restaurant_id: 'b', restaurant_name: 'Beta Bar' }), ['Italian']);
    const view = await open(null);
    await fireEvent.press(await view.findByRole('tab', { name: 'Recent' }));
    await waitFor(() => expect(view.getByText('Beta Bar')).toBeTruthy());
    const tree = JSON.stringify(view.toJSON());
    expect(tree.indexOf('Beta Bar')).toBeLessThan(tree.indexOf('Alpha Grill'));
    expect(view.getByText('Arabic · Mid')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Call Alpha Grill' })).toBeTruthy();
    expect(api.getRestaurantsByIds).not.toHaveBeenCalled();
  });

  it('the trash button removes one recent pick and leaves the others', async () => {
    await recordPick(pick({ restaurant_id: 'a', restaurant_name: 'Alpha Grill' }), []);
    await recordPick(pick({ restaurant_id: 'b', restaurant_name: 'Beta Bar' }), []);
    const view = await open(null);
    await fireEvent.press(await view.findByRole('tab', { name: 'Recent' }));
    await fireEvent.press(await view.findByRole('button', { name: 'Remove Alpha Grill' }));
    await waitFor(() => expect(view.queryByText('Alpha Grill')).toBeNull());
    expect(view.getByText('Beta Bar')).toBeTruthy();
    expect(getHistoryState().entries.map((e) => e.key)).toEqual(['b']);
  });

  it('Clear in the header asks first; Cancel keeps the list, Clear empties Recent only', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    two();
    await recordPick(pick(), ['Arabic']);
    const view = await open(['a']);
    await waitFor(() => expect(view.getByText('Alpha Grill')).toBeTruthy());
    await fireEvent.press(view.getByRole('tab', { name: 'Recent' }));
    await fireEvent.press(await view.findByRole('button', { name: 'Clear Recent' }));
    expect(alert.mock.calls[0][0]).toBe('Clear Recent?');
    const buttons = alert.mock.calls[0][2] ?? [];
    expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Clear']);
    expect(getHistoryState().entries).toHaveLength(1);
    await act(async () => {
      buttons[1].onPress?.();
    });
    await waitFor(() => expect(view.getByText('No history yet.')).toBeTruthy());
    expect(getHistoryState().entries).toEqual([]);
    expect(view.queryByRole('button', { name: 'Clear Recent' })).toBeNull();
    expect(await AsyncStorage.getItem(FAVOURITES_KEY)).toBe(JSON.stringify(['a']));
  });
});

describe('Saved screen: Clear in the header', () => {
  const both = () =>
    api.getRestaurantsByIds.mockImplementation(async (ids) => ({
      ok: true,
      data: [restaurant({ id: 'a', name: 'Alpha Grill' }), restaurant({ id: 'b', name: 'Beta Bar' })].filter((r) =>
        ids.includes(r.id),
      ),
    }));

  it('Clear on Want To Try empties only that list, after confirming', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    both();
    const view = await open(['a'], ['b']);
    await fireEvent.press(await view.findByRole('button', { name: 'Clear Want To Try' }));
    expect(alert.mock.calls[0][0]).toBe('Clear Want To Try?');
    await act(async () => {
      alert.mock.calls[0][2]?.[1].onPress?.();
    });
    await waitFor(() => expect(view.getByText('Nothing saved yet')).toBeTruthy());
    expect(await AsyncStorage.getItem(FAVOURITES_KEY)).toBe('[]');
    expect(await AsyncStorage.getItem(BEEN_THERE_KEY)).toBe(JSON.stringify(['b']));
  });

  it('Clear on Been There empties only that list', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    both();
    const view = await open(['a'], ['b']);
    await fireEvent.press(await view.findByRole('tab', { name: 'Been There' }));
    await fireEvent.press(await view.findByRole('button', { name: 'Clear Been There' }));
    await act(async () => {
      alert.mock.calls[0][2]?.[1].onPress?.();
    });
    await waitFor(() => expect(AsyncStorage.getItem(BEEN_THERE_KEY)).resolves.toBe('[]'));
    expect(await AsyncStorage.getItem(FAVOURITES_KEY)).toBe(JSON.stringify(['a']));
  });

  it('is hidden while the list on screen is empty', async () => {
    both();
    const view = await open(null, ['b']);
    await waitFor(() => expect(view.getByText('Nothing saved yet')).toBeTruthy());
    expect(view.queryByRole('button', { name: 'Clear Want To Try' })).toBeNull();
    await fireEvent.press(view.getByRole('tab', { name: 'Been There' }));
    expect(await view.findByRole('button', { name: 'Clear Been There' })).toBeTruthy();
  });

  it('is hidden when saved ids exist but none of them load (empty state on screen)', async () => {
    const view = await open(['gone']);
    await waitFor(() => expect(view.getByText('Nothing saved yet')).toBeTruthy());
    expect(view.queryByRole('button', { name: 'Clear Want To Try' })).toBeNull();
  });
});
