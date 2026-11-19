import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import * as client from '../api/client';
import TabsLayout from '../../app/(tabs)/_layout';
import Favourites from '../../app/(tabs)/favourites';
import Discover from '../../app/(tabs)/index';
import Settings from '../../app/(tabs)/settings';
import { opt, question } from '../testing/builders';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../api/client');
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'sid') }));

function renderApp(initialUrl = '/') {
  return renderRouter(
    {
      '(tabs)/_layout': TabsLayout,
      '(tabs)/index': Discover,
      '(tabs)/favourites': Favourites,
      '(tabs)/settings': Settings,
    },
    { initialUrl },
  );
}

beforeEach(() => {
  jest.mocked(client.getQuestions).mockReturnValue(new Promise(() => undefined));
  jest.mocked(client.getRestaurantsByIds).mockResolvedValue({ ok: true, data: [] });
});

// Changed from the placeholder version: the screens no longer render the
// `screen-title` testID, so assertions now use each real screen's own content.
describe('tabs', () => {
  it('shows the Discover screen first', async () => {
    let release: (v: Awaited<ReturnType<typeof client.getQuestions>>) => void = () => undefined;
    jest.mocked(client.getQuestions).mockReturnValue(new Promise((r) => { release = r; }));
    jest.mocked(client.trackFlowEvent).mockResolvedValue(undefined);
    const view = await renderApp();
    expect(view.getByTestId('flow-loading')).toBeTruthy();
    await act(async () => {
      release({
        ok: true,
        data: [question('q-c', 'cuisine', [opt('arabic', { label: 'Arabic' })], { label: 'What are you in the mood for?' })],
      });
    });
    await waitFor(() => expect(view.getByText('What are you in the mood for?')).toBeTruthy());
    expect(view.getByRole('button', { name: 'Arabic' })).toBeTruthy();
  });

  it('gives each tab its own icon and both tabs are reachable', async () => {
    const view = await renderApp();
    expect(view.getAllByTestId('tab-icon-discover').length).toBeGreaterThan(0);
    expect(view.getAllByTestId('tab-icon-saved').length).toBeGreaterThan(0);
    await fireEvent.press(view.getByText('Saved'));
    await waitFor(() => expect(view.getByText('Nothing saved yet')).toBeTruthy());
    await fireEvent.press(view.getByText('Discover'));
    expect(view.getByTestId('flow-loading')).toBeTruthy();
  });

  it('has a Saved tab (the former Favourites tab)', async () => {
    const view = await renderApp();
    expect(view.getByText('Saved')).toBeTruthy();
    expect(view.queryByText('Favourites')).toBeNull();
  });

  it('opens the Saved screen', async () => {
    const view = await renderApp('/favourites');
    await waitFor(() => expect(view.getByText('Nothing saved yet')).toBeTruthy());
  });

  it('has no About tab: About lives inside Settings', async () => {
    const view = await renderApp();
    expect(view.queryByText('About')).toBeNull();
        await fireEvent.press(view.getByText('Settings'));
    await waitFor(() => expect(view.getByText('About')).toBeTruthy());
    expect(view.getByRole('link', { name: 'Instagram @abudhabifoodies' })).toBeTruthy();
  });

  it('has a Settings tab with its own icon that opens the Settings screen', async () => {
    const view = await renderApp();
    expect(view.getAllByTestId('tab-icon-settings').length).toBeGreaterThan(0);
    await fireEvent.press(view.getByText('Settings'));
    await waitFor(() => expect(view.getByText('Appearance')).toBeTruthy());
    expect(view.getByRole('header', { name: 'Privacy' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Appearance' })).toBeTruthy();
  });

  it('shows the brand header on every tab (one more header appears as each tab mounts)', async () => {
    const view = await renderApp();
    expect(view.getAllByTestId('app-header-bar', { includeHiddenElements: true })).toHaveLength(1);
    await fireEvent.press(view.getByText('Saved'));
    await waitFor(() => expect(view.getByText('Nothing saved yet')).toBeTruthy());
    expect(view.getAllByTestId('app-header-bar', { includeHiddenElements: true })).toHaveLength(2);
    await fireEvent.press(view.getByText('Settings'));
    await waitFor(() => expect(view.getByText('Appearance')).toBeTruthy());
    expect(view.getAllByTestId('app-header-bar', { includeHiddenElements: true })).toHaveLength(3);
  });

  it('shows no ad on Discover and no ad label anywhere on the tabs', async () => {
    const view = await renderApp();
    expect(view.queryByText('Ad')).toBeNull();
    expect(view.queryByText('Advertisement')).toBeNull();
  });
});
