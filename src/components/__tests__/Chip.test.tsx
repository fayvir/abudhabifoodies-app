import { StyleSheet } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';

import { Chip } from '../Chip';

describe('Chip', () => {
  it('is a button named by its label', async () => {
    const view = await render(<Chip label="Casual" onPress={() => undefined} />);
    expect(view.getByRole('button', { name: 'Casual' })).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    const view = await render(<Chip label="Casual" onPress={onPress} />);
    await fireEvent.press(view.getByRole('button', { name: 'Casual' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows a trailing chevron when chevron is set', async () => {
    const view = await render(<Chip label="Brunch" chevron onPress={() => undefined} />);
    expect(within(view.getByRole('button', { name: 'Brunch' })).getByTestId('chip-chevron')).toBeTruthy();
  });

  it('shows no chevron by default', async () => {
    const view = await render(<Chip label="Casual" onPress={() => undefined} />);
    expect(view.queryByTestId('chip-chevron')).toBeNull();
  });

  it('stays within the screen width and lets a long label wrap', async () => {
    const view = await render(
      <Chip label="A very long option label that would otherwise run off the edge of a narrow phone" onPress={() => undefined} />,
    );
    const button = view.getByRole('button');
    const wrap = button.parent;
    expect(StyleSheet.flatten(wrap?.props.style)).toMatchObject({ maxWidth: '100%' });
    expect(StyleSheet.flatten(button.props.style)).toMatchObject({ flexShrink: 1 });
    expect(StyleSheet.flatten(view.getByText(/A very long option/).props.style)).toMatchObject({ flexShrink: 1 });
  });
});
