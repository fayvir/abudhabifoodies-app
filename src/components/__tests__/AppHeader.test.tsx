import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { palettes } from '../../theme/tokens';
import { AppHeader } from '../AppHeader';

describe('AppHeader', () => {
  it('shows the wordmark as the header', async () => {
    const view = await render(<AppHeader />);
    expect(view.getByRole('header', { name: 'Abu Dhabi Foodies' })).toBeTruthy();
  });

  it('draws the brand mark as a decorative image hidden from screen readers', async () => {
    const view = await render(<AppHeader />);
    const mark = view.getByTestId('app-header-mark', { hidden: true });
    expect(mark.props.accessibilityElementsHidden).toBe(true);
    expect(mark.props.importantForAccessibility).toBe('no-hide-descendants');
    const style = StyleSheet.flatten(mark.props.style);
    expect(style.width).toBe(28);
    expect(style.height).toBe(28);
  });

  it('is a 56pt bar on the elevated background with a 1px bottom border (as the website header)', async () => {
    const view = await render(<AppHeader />);
    const bar = StyleSheet.flatten(view.getByTestId('app-header-bar').props.style);
    expect(bar.height).toBe(56);
    expect(bar.backgroundColor).toBe(palettes.light.bgElevated);
    expect(bar.borderBottomWidth).toBe(1);
    expect(bar.borderBottomColor).toBe(palettes.light.border);
  });

  it('extends its background under the status bar: top safe-area edge, same colour', async () => {
    const view = await render(<AppHeader />);
    const safe = view.getByTestId('app-header-safe-area');
    // The native host receives the normalised edge modes: only the top is padded.
    expect(safe.props.edges).toEqual({ top: 'additive', right: 'off', bottom: 'off', left: 'off' });
    expect(StyleSheet.flatten(safe.props.style).backgroundColor).toBe(palettes.light.bgElevated);
  });

  it('has no button unless an action is given', async () => {
    const view = await render(<AppHeader />);
    expect(view.queryByRole('button')).toBeNull();
  });

  it('shows the action as a labelled icon button that calls the handler', async () => {
    const onPress = jest.fn();
    const view = await render(<AppHeader action={{ label: 'New search', text: 'New', icon: 'refresh', onPress }} />);
    const button = view.getByRole('button', { name: 'New search' });
    expect(view.getByText('New').props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(button.props.style).minHeight).toBeGreaterThanOrEqual(44);
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
