import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import * as client from '../../api/client';
import { __resetFavouritesForTests, FAVOURITES_KEY } from '../../favourites/store';
import { pick, restaurant, snapshot } from '../../testing/builders';
import { abuDhabiDayIndex } from '../../lib/hours';
import { __resetSnapshotForTests } from '../../snapshot/useSnapshot';
import RestaurantDetail from '../../../app/restaurant/[id]';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../api/client');
const api = jest.mocked(client);

const open = () => renderRouter({ 'restaurant/[id]': RestaurantDetail }, { initialUrl: '/restaurant/a' });

beforeEach(async () => {
  jest.clearAllMocks();
  __resetSnapshotForTests();
  api.getSnapshot.mockResolvedValue({ ok: true, data: snapshot([]) });
  await AsyncStorage.clear();
  __resetFavouritesForTests();
});

describe('Restaurant detail', () => {
  it('loads the restaurant by id and shows photos, info, the week\'s hours and actions', async () => {
    api.getRestaurantsByIds.mockResolvedValue({
      ok: true,
      data: [
        restaurant({
          id: 'a',
          name: 'Alpha Grill',
          area: 'Saadiyat',
          photos: ['https://lh3.googleusercontent.com/p'],
          hours: { day_0: 'Monday: 12:00 – 11:00 PM', day_1: 'Tuesday: Closed' },
        }),
      ],
    });
    const view = await open();
    await waitFor(() => expect(view.getByText('Alpha Grill')).toBeTruthy());
    expect(api.getRestaurantsByIds).toHaveBeenCalledWith(['a']);
    expect(view.getByTestId('result-photo-0')).toBeTruthy();
    expect(view.getByText('Saadiyat')).toBeTruthy();
    expect(view.getByText('12 PM – 11 PM')).toBeTruthy();
    expect(view.getByText('Closed')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Call Alpha Grill' })).toBeTruthy();
  });

  it('the heart saves to Want To Try', async () => {
    api.getRestaurantsByIds.mockResolvedValue({ ok: true, data: [restaurant({ id: 'a', name: 'Alpha Grill' })] });
    const view = await open();
    await fireEvent.press(await view.findByRole('button', { name: 'Save to favourites' }));
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(FAVOURITES_KEY)) ?? '[]')).toEqual(['a']));
    expect(view.getByRole('button', { name: 'Remove from favourites' })).toBeTruthy();
  });

  it('a failed load offers Try again, which reloads', async () => {
    api.getRestaurantsByIds.mockResolvedValueOnce({ ok: false, message: 'x' });
    api.getRestaurantsByIds.mockResolvedValueOnce({ ok: true, data: [restaurant({ id: 'a', name: 'Alpha Grill' })] });
    const view = await open();
    await fireEvent.press(await view.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(view.getByText('Alpha Grill')).toBeTruthy());
  });

  it('says so when the restaurant is no longer listed', async () => {
    api.getRestaurantsByIds.mockResolvedValue({ ok: true, data: [] });
    const view = await open();
    await waitFor(() => expect(view.getByText('This restaurant is no longer listed.')).toBeTruthy());
  });

  it('shows the curator\'s note from the guide, preferring an editorial pick', async () => {
    const snap = snapshot([]);
    snap.cards = {
      p1: pick({ restaurant_id: 'a', note: 'Paid words', is_sponsored: true }),
      p2: pick({ restaurant_id: 'a', note: 'Best teppanyaki show in town' }),
      p3: pick({ restaurant_id: 'other', note: 'Not this one' }),
    };
    api.getSnapshot.mockResolvedValue({ ok: true, data: snap });
    api.getRestaurantsByIds.mockResolvedValue({ ok: true, data: [restaurant({ id: 'a', name: 'Alpha Grill' })] });
    const view = await open();
    await waitFor(() => expect(view.getByText('“Best teppanyaki show in town”')).toBeTruthy());
    expect(view.queryByText(/Paid words|Not this one/)).toBeNull();
  });

  it('never shows a sponsored pick\'s note (it would be unlabelled paid words)', async () => {
    const snap = snapshot([]);
    snap.cards = { p1: pick({ restaurant_id: 'a', note: 'Paid words', is_sponsored: true }) };
    api.getSnapshot.mockResolvedValue({ ok: true, data: snap });
    api.getRestaurantsByIds.mockResolvedValue({ ok: true, data: [restaurant({ id: 'a', name: 'Alpha Grill' })] });
    const view = await open();
    await waitFor(() => expect(view.getByText('Alpha Grill')).toBeTruthy());
    expect(view.queryByText(/Paid words/)).toBeNull();
  });

  it('puts Save beside icon-only Call, Directions and Reserve, all still labelled', async () => {
    api.getRestaurantsByIds.mockResolvedValue({ ok: true, data: [restaurant({ id: 'a', name: 'Alpha Grill' })] });
    const view = await open();
    await waitFor(() => expect(view.getByText('Alpha Grill')).toBeTruthy());
    for (const name of ['Save to favourites', 'Call Alpha Grill', 'Directions to Alpha Grill', 'Visit website for Alpha Grill']) {
      expect(view.getByRole('button', { name })).toBeTruthy();
    }
    expect(view.queryByText('Call')).toBeNull();
    expect(view.queryByText('Reserve')).toBeNull();
    expect(view.queryByText('Save')).toBeNull(); // the heart has no word; "Saved" is the back button
  });

  it('clamps a long note to two lines with More / Less; a short note has no toggle', async () => {
    const long = 'A proper hidden gem with a genuinely talented chef who quietly outclasses plenty of the flashier spots in the city.';
    const snap = snapshot([]);
    snap.cards = { p1: pick({ restaurant_id: 'a', note: long }), p2: pick({ restaurant_id: 'b', note: 'Great shawarma.' }) };
    api.getSnapshot.mockResolvedValue({ ok: true, data: snap });
    api.getRestaurantsByIds.mockResolvedValue({ ok: true, data: [restaurant({ id: 'a', name: 'Alpha Grill' })] });
    const view = await open();
    await waitFor(() => expect(view.getByTestId('note')).toBeTruthy());
    expect(view.getByTestId('note').props.numberOfLines).toBe(2);
    await fireEvent.press(view.getByRole('button', { name: 'More' }));
    expect(view.getByTestId('note').props.numberOfLines).toBeUndefined();
    await fireEvent.press(view.getByRole('button', { name: 'Less' }));
    expect(view.getByTestId('note').props.numberOfLines).toBe(2);
  });

  it('a short note shows no More button', async () => {
    const snap = snapshot([]);
    snap.cards = { p1: pick({ restaurant_id: 'a', note: 'Great shawarma.' }) };
    api.getSnapshot.mockResolvedValue({ ok: true, data: snap });
    api.getRestaurantsByIds.mockResolvedValue({ ok: true, data: [restaurant({ id: 'a', name: 'Alpha Grill' })] });
    const view = await open();
    await waitFor(() => expect(view.getByTestId('note')).toBeTruthy());
    expect(view.queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('highlights today in the opening hours', async () => {
    const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const hours = Object.fromEntries(names.map((d, i) => [`day_${i}`, `${d}: 9:00 AM – 5:00 PM`]));
    api.getRestaurantsByIds.mockResolvedValue({ ok: true, data: [restaurant({ id: 'a', name: 'Alpha Grill', hours })] });
    const view = await open();
    await waitFor(() => expect(view.getByTestId('hours-today')).toBeTruthy());
    expect(view.getAllByTestId('hours-today')).toHaveLength(1);
    expect(view.getByTestId('hours-today').props.accessibilityLabel).toBe(`Today, ${names[abuDhabiDayIndex()]}: 9 AM – 5 PM`);
  });

  it('measured: exactly two lines has no toggle, three lines has one', async () => {
    const snap = snapshot([]);
    snap.cards = { p1: pick({ restaurant_id: 'a', note: 'Short' }) };
    api.getSnapshot.mockResolvedValue({ ok: true, data: snap });
    api.getRestaurantsByIds.mockResolvedValue({ ok: true, data: [restaurant({ id: 'a', name: 'Alpha Grill' })] });
    const view = await open();
    const measure = await view.findByTestId('note-measure', { includeHiddenElements: true }, { timeout: 5000 });
    const layout = (n: number) => ({ nativeEvent: { lines: Array.from({ length: n }, () => ({})) } });
    await act(async () => fireEvent(measure, 'textLayout', layout(2)));
    expect(view.queryByRole('button', { name: 'More' })).toBeNull();
    await act(async () => fireEvent(measure, 'textLayout', layout(3)));
    expect(view.getByRole('button', { name: 'More' })).toBeTruthy();
  });
});
