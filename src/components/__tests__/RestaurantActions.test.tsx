import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';

import { RestaurantActions } from '../RestaurantActions';

const FULL = {
  name: 'Operation Falafel',
  phone: '+97125550100',
  googleMaps: 'https://maps.google.com/?cid=111',
  website: 'https://operationfalafel.example',
};

let openURL: jest.SpyInstance;
beforeEach(() => {
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('RestaurantActions', () => {
  it('Call opens tel: with the raw phone', async () => {
    const view = await render(<RestaurantActions {...FULL} />);
    await fireEvent.press(view.getByRole('button', { name: 'Call Operation Falafel' }));
    expect(openURL).toHaveBeenCalledWith('tel:+97125550100');
  });

  it('Directions opens the google_maps url as-is', async () => {
    const view = await render(<RestaurantActions {...FULL} />);
    await fireEvent.press(view.getByRole('button', { name: 'Directions to Operation Falafel' }));
    expect(openURL).toHaveBeenCalledWith('https://maps.google.com/?cid=111');
  });

  it('Reserve opens the website as-is', async () => {
    const view = await render(<RestaurantActions {...FULL} />);
    await fireEvent.press(view.getByRole('button', { name: 'Visit website for Operation Falafel' }));
    expect(openURL).toHaveBeenCalledWith('https://operationfalafel.example');
  });

  it('shows the visible labels Call, Directions and Reserve', async () => {
    const view = await render(<RestaurantActions {...FULL} />);
    expect(view.getByText('Call')).toBeTruthy();
    expect(view.getByText('Directions')).toBeTruthy();
    expect(view.getByText('Reserve')).toBeTruthy();
  });

  it('hides Call without a phone', async () => {
    const view = await render(<RestaurantActions {...FULL} phone={null} />);
    expect(view.queryByText('Call')).toBeNull();
    expect(view.getByText('Directions')).toBeTruthy();
  });

  it('hides Directions without a maps link', async () => {
    const view = await render(<RestaurantActions {...FULL} googleMaps={null} />);
    expect(view.queryByText('Directions')).toBeNull();
  });

  it('hides Reserve without a website', async () => {
    const view = await render(<RestaurantActions {...FULL} website={undefined} />);
    expect(view.queryByText('Reserve')).toBeNull();
  });

  it('renders no buttons at all when there is no data', async () => {
    const view = await render(<RestaurantActions name="X" phone={null} googleMaps={null} website={null} />);
    expect(view.queryAllByRole('button')).toHaveLength(0);
  });

  it('keeps button labels on one line and shrinks them instead of clipping', async () => {
    const view = await render(<RestaurantActions {...FULL} />);
    for (const label of ['Call', 'Directions', 'Reserve']) {
      const text = view.getByText(label);
      expect(text.props.numberOfLines).toBe(1);
      expect(text.props.adjustsFontSizeToFit).toBe(true);
    }
  });

  it('shows a short alert when a link cannot be opened', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    openURL.mockRejectedValue(new Error('no handler'));
    const view = await render(<RestaurantActions {...FULL} />);
    await fireEvent.press(view.getByRole('button', { name: 'Call Operation Falafel' }));
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    expect(alert.mock.calls[0][0]).toBe("Couldn't open that link");
  });
});
