import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking, Share } from 'react-native';

import { __resetFavouritesForTests, FAVOURITES_KEY } from '../../favourites/store';
import { pick } from '../../testing/builders';
import { ResultCard } from '../ResultCard';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

let share: jest.SpyInstance;
let openURL: jest.SpyInstance;

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetFavouritesForTests();
  share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('ResultCard content', () => {
  it('shows name, curly-quoted note, cuisine chip, area and AED price label', async () => {
    const view = await render(<ResultCard card={pick()} />);
    expect(view.getByText('Operation Falafel')).toBeTruthy();
    expect(view.getByText('“Best hummus in town”')).toBeTruthy();
    expect(view.getByText('Lebanese')).toBeTruthy();
    expect(view.getByText('Al Reem Island')).toBeTruthy();
    expect(view.getByText('AED 80–200 pp')).toBeTruthy();
  });

  it('folds price_range 4 into the High label', async () => {
    const view = await render(<ResultCard card={pick({ price_range: 4 })} />);
    expect(view.getByText('AED 200+ pp')).toBeTruthy();
  });

  it('shows the rating pill to one decimal', async () => {
    const view = await render(<ResultCard card={pick({ rating: 4.6 })} />);
    expect(view.getByText('4.6')).toBeTruthy();
    expect(view.getByLabelText('Rated 4.6')).toBeTruthy();
  });

  it('omits the rating pill and the note when absent', async () => {
    const view = await render(<ResultCard card={pick({ rating: null, note: null })} />);
    expect(view.queryByText('4.6')).toBeNull();
    expect(view.queryByText(/“/)).toBeNull();
  });

  it('renders a pick with null cuisine, area and price_range without crashing or printing "null"', async () => {
    const card = pick({ cuisine: null as unknown as string[], area: null, price_range: null, rating: null, note: null });
    const view = await render(<ResultCard card={card} />);
    expect(view.getByText('Operation Falafel')).toBeTruthy();
    expect(view.queryByText(/null|undefined|NaN/)).toBeNull();
    expect(view.queryByText(/AED/)).toBeNull();
  });

  it('renders a name-only pick (empty cuisine, no id, no links) as just the content', async () => {
    const card = pick({
      cuisine: [], area: null, price_range: null, restaurant_id: null, phone: null,
      google_maps: null, website: null, photos: null,
    });
    const view = await render(<ResultCard card={card} />);
    expect(view.getByText('Operation Falafel')).toBeTruthy();
    expect(view.queryByText(/null|undefined|NaN/)).toBeNull();
    expect(view.queryByLabelText(/favourites/i)).toBeNull();
    expect(view.queryByText('Call')).toBeNull();
  });
});

describe('ResultCard sponsored disclosure', () => {
  it('shows the badge with the advertiser', async () => {
    const view = await render(<ResultCard card={pick({ is_sponsored: true, advertiser_name: 'Acme' })} />);
    expect(view.getByText('Sponsored · Acme')).toBeTruthy();
  });

  it('shows the badge without a dot when the advertiser is blank', async () => {
    const view = await render(<ResultCard card={pick({ is_sponsored: true, advertiser_name: null })} />);
    expect(view.getByText('Sponsored')).toBeTruthy();
  });

  it('shows no badge for an editorial pick, even if an advertiser name is present', async () => {
    const view = await render(<ResultCard card={pick({ is_sponsored: false, advertiser_name: 'Acme' })} />);
    expect(view.queryByText(/Sponsored/)).toBeNull();
  });
});

describe('ResultCard photos', () => {
  const urls = (view: Awaited<ReturnType<typeof render>>) =>
    view.queryAllByTestId(/^result-photo-\d+$/).map((n) => n.props.source.uri);

  it('shows every photo in a swipeable carousel, in order', async () => {
    const view = await render(<ResultCard card={pick({ photos: ['https://x/1', 'https://x/2', 'https://x/3'] })} />);
    expect(urls(view)).toEqual(['https://x/1', 'https://x/2', 'https://x/3']);
    const scroller = view.getByTestId('photo-scroller');
    expect(scroller.props.horizontal).toBe(true);
    expect(scroller.props.pagingEnabled).toBe(true);
  });

  it('shows one dot per photo with the first active, and moves the active dot on swipe', async () => {
    const view = await render(<ResultCard card={pick({ photos: ['https://x/1', 'https://x/2', 'https://x/3'] })} />);
    expect(view.getAllByTestId('photo-dot', { includeHiddenElements: true })).toHaveLength(2);
    expect(view.getAllByTestId('photo-dot-active', { includeHiddenElements: true })).toHaveLength(1);
    await fireEvent(view.getByTestId('photo-carousel'), 'layout', { nativeEvent: { layout: { width: 300, height: 169 } } });
    const scroller = view.getByTestId('photo-scroller');
    await fireEvent(scroller, 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 600, y: 0 } } });
    await waitFor(() => expect(view.getAllByTestId(/^photo-dot(-active)?$/, { includeHiddenElements: true }).map((d) => d.props.testID)).toEqual(['photo-dot', 'photo-dot', 'photo-dot-active']));
  });

  it('labels each photo for screen readers and shows a repeated URL once', async () => {
    const view = await render(<ResultCard card={pick({ photos: ['https://x/1', 'https://x/2', 'https://x/1'] })} />);
    expect(urls(view)).toEqual(['https://x/1', 'https://x/2']);
    expect(view.getByTestId('result-photo-1').props.accessibilityLabel).toBe('Photo 2 of 2');
  });

  it('has no dots for a single photo', async () => {
    const view = await render(<ResultCard card={pick({ photos: ['https://x/1'] })} />);
    expect(urls(view)).toEqual(['https://x/1']);
    expect(view.queryByTestId('photo-dots', { includeHiddenElements: true })).toBeNull();
  });

  it('drops a photo that fails to load and keeps the others', async () => {
    const view = await render(<ResultCard card={pick({ photos: ['https://x/1', 'https://x/2', 'https://x/3'] })} />);
    await fireEvent(view.getByTestId('result-photo-0'), 'error');
    expect(urls(view)).toEqual(['https://x/2', 'https://x/3']);
  });

  it('shows the branded placeholder once every photo has failed', async () => {
    const view = await render(<ResultCard card={pick({ photos: ['https://lh3.googleusercontent.com/a'] })} />);
    await fireEvent(view.getByTestId('result-photo-0'), 'error');
    expect(view.queryByTestId('photo-carousel')).toBeNull();
    expect(view.getByTestId('photo-placeholder')).toBeTruthy();
  });

  it.each([[null], [[]]])('shows the placeholder when photos is %p', async (photos) => {
    const view = await render(<ResultCard card={pick({ photos })} />);
    expect(view.getByTestId('photo-placeholder')).toBeTruthy();
    expect(view.queryByTestId('photo-carousel')).toBeNull();
  });

  it('does not show the placeholder while a photo is showing', async () => {
    const view = await render(<ResultCard card={pick()} />);
    expect(view.queryByTestId('photo-placeholder')).toBeNull();
  });
});

describe('ResultCard favourites heart', () => {
  it('is hidden when the pick has no restaurant_id', async () => {
    const view = await render(<ResultCard card={pick({ restaurant_id: null })} />);
    expect(view.queryByRole('button', { name: 'Save to favourites' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Remove from favourites' })).toBeNull();
  });

  it('saves the restaurant id when tapped, and flips its label', async () => {
    const view = await render(<ResultCard card={pick({ restaurant_id: 'rest-9' })} />);
    await fireEvent.press(await view.findByRole('button', { name: 'Save to favourites' }));
    await waitFor(() => expect(view.getByRole('button', { name: 'Remove from favourites' })).toBeTruthy());
    expect(JSON.parse((await AsyncStorage.getItem(FAVOURITES_KEY)) ?? 'null')).toEqual(['rest-9']);
  });

  it('starts as saved when the id is already in favourites', async () => {
    await AsyncStorage.setItem(FAVOURITES_KEY, JSON.stringify(['rest-9']));
    const view = await render(<ResultCard card={pick({ restaurant_id: 'rest-9' })} />);
    expect(await view.findByRole('button', { name: 'Remove from favourites' })).toBeTruthy();
  });
});

describe('ResultCard share and actions', () => {
  it('Share opens the native share sheet with the share text', async () => {
    const view = await render(<ResultCard card={pick()} />);
    await fireEvent.press(view.getByRole('button', { name: 'Share recommendation' }));
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0][0] as { message: string };
    expect(arg.message).toContain('Operation Falafel');
    expect(arg.message).toContain('Find more on Abu Dhabi Foodies: https://abudhabifoodies.ae');
  });

  it('the shared text of a sponsored pick carries the disclosure', async () => {
    const view = await render(<ResultCard card={pick({ is_sponsored: true, advertiser_name: 'Acme' })} />);
    await fireEvent.press(view.getByRole('button', { name: 'Share recommendation' }));
    expect((share.mock.calls[0][0] as { message: string }).message).toContain('Sponsored · Acme');
  });

  it('wires the Call button to the phone number', async () => {
    const view = await render(<ResultCard card={pick()} />);
    await fireEvent.press(view.getByRole('button', { name: 'Call Operation Falafel' }));
    expect(openURL).toHaveBeenCalledWith('tel:+97125550100');
  });

  it('hides the action buttons for a pick with no contact data', async () => {
    const view = await render(<ResultCard card={pick({ phone: null, google_maps: null, website: null })} />);
    expect(view.queryByText('Call')).toBeNull();
    expect(view.queryByText('Directions')).toBeNull();
    expect(view.queryByText('Reserve')).toBeNull();
  });
});

describe('ResultCard Watch on Instagram', () => {
  const URL_OK = 'https://www.instagram.com/reel/XYZ/';

  it('shows the button and opens the link when instagram_url is a valid instagram https url', async () => {
    const view = await render(<ResultCard card={pick({ instagram_url: URL_OK })} />);
    await fireEvent.press(view.getByRole('button', { name: 'Watch Operation Falafel on Instagram' }));
    expect(openURL).toHaveBeenCalledWith(URL_OK);
  });

  it.each([[null], [undefined], ['http://instagram.com/p/x'], ['https://evil.com/p/x'], ['javascript:alert(1)'], ['']])(
    'shows no button for %p',
    async (v) => {
      const view = await render(<ResultCard card={pick({ instagram_url: v as string | null | undefined })} />);
      expect(view.queryByText('Watch on Instagram')).toBeNull();
    },
  );

  it('does not crash on a non-string instagram_url', async () => {
    const view = await render(<ResultCard card={pick({ instagram_url: 5 as unknown as string })} />);
    expect(view.queryByText('Watch on Instagram')).toBeNull();
  });

  it('shows the same alert when the link cannot be opened', async () => {
    const { Alert } = jest.requireActual<typeof import('react-native')>('react-native');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    openURL.mockRejectedValue(new Error('no handler'));
    const view = await render(<ResultCard card={pick({ instagram_url: URL_OK })} />);
    await fireEvent.press(view.getByRole('button', { name: 'Watch Operation Falafel on Instagram' }));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Couldn't open that link"));
  });
});

describe('ResultCard opening hours and other locations', () => {
  const allWeek = (text: string) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((i) => [`day_${i}`, `Day: ${text}`]));

  it('shows open-now status when the card has hours, nothing when it has none', async () => {
    const view = await render(<ResultCard card={pick({ hours: allWeek('Open 24 hours') })} />);
    expect(view.getByText('Open 24 hours')).toBeTruthy();
    const none = await render(<ResultCard card={pick({ hours: undefined })} />);
    expect(none.queryByTestId('open-status')).toBeNull();
  });

  it('lists other locations on tap, each with Call and Directions', async () => {
    const card = pick({
      other_locations: [
        { id: 'l1', name: 'Operation Falafel', area: 'Yas Island', address: 'Yas Mall', phone: '+9712000', google_maps: 'https://maps.google.com/?cid=2', lat: null, lng: null },
        { id: 'l2', name: 'Operation Falafel', area: null, address: null, phone: null, google_maps: 'https://maps.google.com/?cid=3', lat: null, lng: null },
      ],
    });
    const view = await render(<ResultCard card={card} />);
    expect(view.queryByTestId('other-location')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Also at 2 other locations' }));
    expect(view.getAllByTestId('other-location')).toHaveLength(2);
    expect(view.getByText('Yas Mall')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Call Operation Falafel, Yas Island' }));
    expect(openURL).toHaveBeenCalledWith('tel:+9712000');
  });

  it('says "location" for one, and shows nothing without other locations', async () => {
    const one = await render(<ResultCard card={pick({ other_locations: [{ id: 'l1', name: 'X', area: 'Khalifa City', address: null, phone: null, google_maps: null, lat: null, lng: null }] })} />);
    expect(one.getByRole('button', { name: 'Also at 1 other location' })).toBeTruthy();
    const none = await render(<ResultCard card={pick()} />);
    expect(none.queryByText(/Also at/)).toBeNull();
  });
});
