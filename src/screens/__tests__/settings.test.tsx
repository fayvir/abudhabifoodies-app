import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Appearance, Linking, StyleSheet } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import Settings from '../../../app/(tabs)/settings';
import { __resetFavouritesForTests } from '../../favourites/store';
import { __resetAnalyticsForTests, isAnalyticsEnabled } from '../../settings/analyticsPreference';

jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '3.1' }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

let setScheme: jest.SpyInstance;

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  __resetAnalyticsForTests();
  __resetFavouritesForTests();
  setScheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => undefined);
});

const openMenu = async (view: Awaited<ReturnType<typeof render>>) =>
  fireEvent.press(view.getByRole('button', { name: 'Appearance' }));

describe('Settings screen: appearance dropdown', () => {
  it('has an Appearance section with one dropdown instead of three rows', async () => {
    const view = await render(<Settings />);
    expect(view.getByText('Appearance')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Appearance' })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Dark' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Light' })).toBeNull();
    expect(view.queryByRole('button', { name: 'System' })).toBeNull();
  });

  it('shows System as the current value when nothing is saved', async () => {
    const view = await render(<Settings />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Appearance' }).props.accessibilityValue).toEqual({ text: 'System' }));
  });

  it('shows the saved option as the current value', async () => {
    await AsyncStorage.setItem('abf_theme', 'dark');
    const view = await render(<Settings />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Appearance' }).props.accessibilityValue).toEqual({ text: 'Dark' }));
  });

  it('opens to System, Light and Dark, with a check mark on the current one only', async () => {
    await AsyncStorage.setItem('abf_theme', 'dark');
    const view = await render(<Settings />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Appearance' }).props.accessibilityValue).toEqual({ text: 'Dark' }));
    await openMenu(view);
    expect(view.getByRole('button', { name: 'Appearance', expanded: true })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Dark', selected: true })).toBeTruthy();
    expect(view.getByRole('button', { name: 'System', selected: false })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Light', selected: false })).toBeTruthy();
    expect(view.getAllByTestId('theme-check')).toHaveLength(1);
  });

  it('tapping Dark persists dark, applies it immediately and closes the menu', async () => {
    const view = await render(<Settings />);
    await openMenu(view);
    await fireEvent.press(view.getByRole('button', { name: 'Dark' }));
    expect(setScheme).toHaveBeenCalledWith('dark');
    await waitFor(() => expect(AsyncStorage.getItem('abf_theme')).resolves.toBe('dark'));
    expect(view.queryByRole('button', { name: 'Light' })).toBeNull();
    expect(view.getByRole('button', { name: 'Appearance' }).props.accessibilityValue).toEqual({ text: 'Dark' });
  });

  it('shows no value until the saved choice has loaded', async () => {
    let release: (v: string | null) => void = () => undefined;
    jest.spyOn(AsyncStorage, 'getItem').mockReturnValueOnce(new Promise((r) => (release = r)));
    const view = await render(<Settings />);
    expect(view.getByRole('button', { name: 'Appearance' }).props.accessibilityValue).toEqual({ text: '' });
    await act(async () => release('dark'));
    await waitFor(() => expect(view.getByRole('button', { name: 'Appearance' }).props.accessibilityValue).toEqual({ text: 'Dark' }));
  });

  it('a tap made before the saved choice loads is not overwritten by the late load', async () => {
    let release: (v: string | null) => void = () => undefined;
    jest.spyOn(AsyncStorage, 'getItem').mockReturnValueOnce(new Promise((r) => (release = r)));
    const view = await render(<Settings />);
    await openMenu(view);
    await fireEvent.press(view.getByRole('button', { name: 'Light' }));
    await act(async () => release('dark'));
    await waitFor(() => expect(view.getByRole('button', { name: 'Appearance' }).props.accessibilityValue).toEqual({ text: 'Light' }));
  });

  it('gives each option a hint that screen readers announce', async () => {
    const view = await render(<Settings />);
    await openMenu(view);
    expect(view.getByRole('button', { name: 'Dark' }).props.accessibilityHint).toBe('Always dark');
    expect(view.getByRole('button', { name: 'System' }).props.accessibilityHint).toBe('Follow your phone');
  });

  it('tapping System applies auto (drop the override, follow the phone)', async () => {
    await AsyncStorage.setItem('abf_theme', 'light');
    const view = await render(<Settings />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Appearance' }).props.accessibilityValue).toEqual({ text: 'Light' }));
    await openMenu(view);
    await fireEvent.press(view.getByRole('button', { name: 'System' }));
    expect(setScheme).toHaveBeenLastCalledWith('auto');
    await waitFor(() => expect(AsyncStorage.getItem('abf_theme')).resolves.toBe('system'));
  });
});

describe('Settings screen: header and About', () => {
  const SITE = 'https://www.abudhabifoodies.ae';

  beforeEach(() => {
    jest.clearAllMocks(); // Linking.openURL is already a jest.fn: spyOn keeps its call history
    jest.mocked(WebBrowser.openBrowserAsync).mockResolvedValue({ type: 'opened' } as never);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('shows the fixed brand header', async () => {
    const view = await render(<Settings />);
    expect(view.getByTestId('app-header-bar')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'New search' })).toBeNull();
  });

  it('has the community-focused About paragraph but no @abudhabifoodies heading, tagline or Advertise row', async () => {
    const view = await render(<Settings />);
    expect(view.getByText('About')).toBeTruthy();
    expect(view.getByText(/Every pick in this app comes from the Abu Dhabi Foodies community/)).toBeTruthy();
    expect(view.queryByText(/most trusted food discovery account/)).toBeNull();
    expect(view.queryByRole('header', { name: '@abudhabifoodies' })).toBeNull();
    expect(view.queryByText('Answer a few questions. Find the best. Eat well.')).toBeNull();
    expect(view.queryByText('Advertise with us')).toBeNull();
  });

  it('links to Instagram with the icon and the @abudhabifoodies handle beside it', async () => {
    const view = await render(<Settings />);
    const link = view.getByRole('link', { name: 'Instagram @abudhabifoodies' });
    expect(view.getByText('@abudhabifoodies')).toBeTruthy();
    expect(StyleSheet.flatten(link.props.style).minHeight).toBeGreaterThanOrEqual(44);
  });

  it('puts About first, above Appearance and Privacy', async () => {
    const view = await render(<Settings />);
    const tree = JSON.stringify(view.toJSON());
    expect(tree.indexOf('"About"')).toBeGreaterThan(-1);
    expect(tree.indexOf('"About"')).toBeLessThan(tree.indexOf('"Appearance"'));
    expect(tree.indexOf('"Appearance"')).toBeLessThan(tree.indexOf('"Privacy"'));
  });

  it('Instagram opens through Linking', async () => {
    const view = await render(<Settings />);
    await fireEvent.press(view.getByRole('link', { name: 'Instagram @abudhabifoodies' }));
    expect(Linking.openURL).toHaveBeenCalledWith('https://www.instagram.com/abudhabifoodies');
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('shows Terms and Privacy as small footer links, not rows', async () => {
    const view = await render(<Settings />);
    expect(view.getByRole('link', { name: 'Terms' })).toBeTruthy();
    expect(view.getByRole('link', { name: 'Privacy' })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Terms' })).toBeNull();
    expect(view.getByText('·')).toBeTruthy();
    for (const name of ['Terms', 'Privacy']) {
      expect(StyleSheet.flatten(view.getByRole('link', { name }).props.style).minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  it.each([
    ['Terms', `${SITE}/terms`],
    ['Privacy', `${SITE}/privacy`],
  ])('%s opens the live page in the in-app browser', async (label, url) => {
    const view = await render(<Settings />);
    await fireEvent.press(view.getByRole('link', { name: label }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(url);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('shows the short alert when the browser fails to open', async () => {
    jest.mocked(WebBrowser.openBrowserAsync).mockRejectedValue(new Error('no'));
    const view = await render(<Settings />);
    await fireEvent.press(view.getByRole('link', { name: 'Terms' }));
    await Promise.resolve();
    expect(Alert.alert).toHaveBeenCalledWith("Couldn't open that link");
  });

  it('shows the short alert when Instagram fails to open', async () => {
    jest.mocked(Linking.openURL).mockRejectedValue(new Error('no'));
    const view = await render(<Settings />);
    await fireEvent.press(view.getByRole('link', { name: 'Instagram @abudhabifoodies' }));
    await Promise.resolve();
    expect(Alert.alert).toHaveBeenCalledWith("Couldn't open that link");
  });
});

describe('Settings screen: data, feedback and version', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('shows the app version and build', async () => {
    const view = await render(<Settings />);
    expect(view.getByText('Version 1.0.0 (3.1)')).toBeTruthy();
  });

  it('Send feedback opens an email to contact@abudhabifoodies.ae that names the build', async () => {
    const view = await render(<Settings />);
    await fireEvent.press(view.getByRole('button', { name: 'Send feedback' }));
    const url = jest.mocked(Linking.openURL).mock.calls[0][0];
    expect(url.startsWith('mailto:contact@abudhabifoodies.ae?')).toBe(true);
    expect(decodeURIComponent(url)).toContain('App 1.0.0 (3.1)');
  });

  it('Send feedback tells the visitor the address when no email app can open', async () => {
    jest.mocked(Linking.openURL).mockRejectedValue(new Error('no mail'));
    const view = await render(<Settings />);
    await fireEvent.press(view.getByRole('button', { name: 'Send feedback' }));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith("Couldn't open your email app", 'Please write to contact@abudhabifoodies.ae.'),
    );
  });

  it('has no Clear saved lists row (it lives in the Saved tab header)', async () => {
    const view = await render(<Settings />);
    expect(view.queryByRole('button', { name: 'Clear saved lists' })).toBeNull();
    expect(view.queryByText('Your data')).toBeNull();
  });
});

describe('Settings screen privacy', () => {
  const LABEL = 'Share anonymous usage stats';

  it('has a Privacy section with the switch and no explanation text', async () => {
    const view = await render(<Settings />);
    expect(view.getByRole('header', { name: 'Privacy' })).toBeTruthy();
    expect(view.getByText(LABEL)).toBeTruthy();
    expect(view.queryByText(/Lets us see how people move/)).toBeNull();
  });

  it('is on by default', async () => {
    const view = await render(<Settings />);
    await waitFor(() => expect(view.getByLabelText(LABEL).props.value).toBe(true));
  });

  it('shows off when saved off', async () => {
    await AsyncStorage.setItem('abf_analytics', 'off');
    const view = await render(<Settings />);
    await waitFor(() => expect(view.getByLabelText(LABEL).props.value).toBe(false));
  });

  it('toggling off applies immediately and persists; toggling back on does the same', async () => {
    const view = await render(<Settings />);
    await fireEvent(view.getByLabelText(LABEL), 'valueChange', false);
    expect(isAnalyticsEnabled()).toBe(false);
    await waitFor(() => expect(AsyncStorage.getItem('abf_analytics')).resolves.toBe('off'));
    await waitFor(() => expect(view.getByLabelText(LABEL).props.value).toBe(false));
    await fireEvent(view.getByLabelText(LABEL), 'valueChange', true);
    expect(isAnalyticsEnabled()).toBe(true);
    await waitFor(() => expect(AsyncStorage.getItem('abf_analytics')).resolves.toBe('on'));
  });
});
