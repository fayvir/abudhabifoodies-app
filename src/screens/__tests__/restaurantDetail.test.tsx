import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import * as client from '../../api/client';
import { __resetFavouritesForTests, FAVOURITES_KEY } from '../../favourites/store';
import { pick, restaurant, snapshot } from '../../testing/builders';
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
});
