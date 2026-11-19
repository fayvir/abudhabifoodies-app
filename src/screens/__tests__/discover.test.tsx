/**
 * Discover screen, driven end to end through the REAL useDiscoveryFlow hook and
 * engine, with only the network client mocked (more honest than mocking the
 * hook: it proves tapping a chip actually reaches resolve). ResultCard is
 * mocked so this file does not depend on that component.
 */
import { ScrollView, StyleSheet } from 'react-native';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';

import { randomUUID } from 'expo-crypto';

import * as client from '../../api/client';
import type { DiscoveryQuestionWithOptions as Q } from '../../api/types';
import { __resetHistoryForTests, getHistoryState } from '../../history/store';
import { opt, pick, question } from '../../testing/builders';
import Discover from '../../../app/(tabs)/index';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../api/client');
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'sid-1') }));
jest.mock('../../components/ResultCard', () => {
  const { Text: T } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ResultCard: ({ card }: { card: { restaurant_name: string } }) => <T>{`card:${card.restaurant_name}`}</T>,
  };
});

const api = jest.mocked(client);
const INTRO = 'Answer a few questions. Find the best. Eat well.';
const SERVER_NO_MATCH = "Abu Dhabi Foodies hasn't covered this combination yet — try a different option.";
const WEB_SOURCE_INTRO_NONE = "Abu Dhabi Foodies hasn't covered this one yet — try a different combination.";

function graph(): Q[] {
  return [
    question('q-c', 'cuisine', [
      opt('italian', { label: 'Italian', next_question_id: 'q-b' }),
      opt('arabic', { label: 'Arabic', next_question_id: 'q-b' }),
    ], { label: 'What are you in the mood for?' }),
    question('q-b', 'budget', [opt('budget_1', { label: 'Low' }), opt('budget_2', { label: 'Mid' })], {
      role: 'refiner',
      label: "What's your budget per person?",
    }),
  ];
}

beforeEach(() => {
  jest.resetAllMocks();
  __resetHistoryForTests();
  jest.mocked(randomUUID).mockReturnValue('sid-1');
  api.getQuestions.mockResolvedValue({ ok: true, data: graph() });
  api.getAvailability.mockResolvedValue({ gated: false });
  api.trackFlowEvent.mockResolvedValue(undefined);
  api.resolveDiscovery.mockResolvedValue({
    ok: true,
    result: { tier: 1, source: 'curated', picks: [pick()], note: null },
  });
});

async function renderReady() {
  const view = await render(<Discover />);
  await waitFor(() => expect(view.getByText('What are you in the mood for?')).toBeTruthy());
  return view;
}

async function tap(view: Awaited<ReturnType<typeof renderReady>>, label: string) {
  await fireEvent.press(view.getByRole('button', { name: label }));
}

async function playThrough(view: Awaited<ReturnType<typeof renderReady>>) {
  await tap(view, 'Arabic');
  await waitFor(() => expect(view.getByText("What's your budget per person?")).toBeTruthy());
  await tap(view, 'Mid');
}

describe('Discover screen: loading', () => {
  it('shows a loading indicator until the questions arrive', async () => {
    api.getQuestions.mockReturnValue(new Promise(() => undefined));
    const view = await render(<Discover />);
    expect(view.getByTestId('flow-loading')).toBeTruthy();
  });

  it('shows the load error with a Try again button that reloads', async () => {
    api.getQuestions.mockResolvedValueOnce({ ok: false, message: 'offline' });
    const view = await render(<Discover />);
    await waitFor(() => expect(view.getByText('Something went wrong loading the guide.')).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(view.getByText('What are you in the mood for?')).toBeTruthy());
    expect(api.getQuestions).toHaveBeenCalledTimes(2);
  });
});

describe('Discover screen: intro and questions', () => {
  it("shows the site's promise as a heading before the first answer", async () => {
    const view = await renderReady();
    expect(view.getByRole('header', { name: INTRO })).toBeTruthy();
  });

  it('shows the question and its options as buttons, alphabetical', async () => {
    const view = await renderReady();
    const labels = view.getAllByRole('button').map((b) => b.props.accessibilityLabel ?? '');
    expect(labels.indexOf('Arabic')).toBeGreaterThanOrEqual(0);
    expect(labels.indexOf('Arabic')).toBeLessThan(labels.indexOf('Italian'));
  });

  it('hides the intro once the first answer is given', async () => {
    const view = await renderReady();
    await tap(view, 'Arabic');
    await waitFor(() => expect(view.getByText("What's your budget per person?")).toBeTruthy());
    expect(view.queryByText(INTRO)).toBeNull();
  });

  it('keeps the answered question and the chosen answer visible', async () => {
    const view = await renderReady();
    await tap(view, 'Arabic');
    await waitFor(() => expect(view.getByText("What's your budget per person?")).toBeTruthy());
    expect(view.getByText('What are you in the mood for?')).toBeTruthy();
    expect(view.getByText('Arabic')).toBeTruthy();
  });

  it('offers Skip on a refiner question and records "No preference"', async () => {
    const view = await renderReady();
    expect(view.queryByRole('button', { name: 'Skip' })).toBeNull();
    await tap(view, 'Arabic');
    await waitFor(() => expect(view.getByRole('button', { name: 'Skip' })).toBeTruthy());
    await tap(view, 'Skip');
    await waitFor(() => expect(view.getByText('No preference')).toBeTruthy());
    expect(api.resolveDiscovery).toHaveBeenCalledWith({ cuisine: 'arabic' }, 'sid-1');
  });
});

describe('Discover screen: results', () => {
  it('resolves with the tapped selections and renders the pick through ResultCard', async () => {
    const view = await renderReady();
    await playThrough(view);
    await waitFor(() => expect(view.getByText('card:Operation Falafel')).toBeTruthy());
    expect(api.resolveDiscovery).toHaveBeenCalledWith({ cuisine: 'arabic', budget: 'budget_2' }, 'sid-1');
    expect(view.getByText("Here's what we'd recommend:")).toBeTruthy();
  });

  it("shows the server's no-match note, not the website's own copy", async () => {
    api.resolveDiscovery.mockResolvedValue({
      ok: true,
      result: { tier: 1, source: 'none', picks: [], note: SERVER_NO_MATCH },
    });
    const view = await renderReady();
    await playThrough(view);
    await waitFor(() => expect(view.getByText(SERVER_NO_MATCH)).toBeTruthy());
    expect(view.queryByText(WEB_SOURCE_INTRO_NONE)).toBeNull();
  });

  it('shows the rate-limit message', async () => {
    api.resolveDiscovery.mockResolvedValue({ ok: false, reason: 'rate_limited', message: 'Slow down a bit.' });
    const view = await renderReady();
    await playThrough(view);
    await waitFor(() => expect(view.getByText('Slow down a bit.')).toBeTruthy());
  });

  it('shows the generic error message', async () => {
    api.resolveDiscovery.mockResolvedValue({ ok: false, reason: 'error', message: 'Something went wrong — please try again.' });
    const view = await renderReady();
    await playThrough(view);
    await waitFor(() => expect(view.getByText('Something went wrong — please try again.')).toBeTruthy());
  });

  it('New search (header) returns from a result to the intro and the first question without refetching', async () => {
    const view = await renderReady();
    await playThrough(view);
    await waitFor(() => expect(view.getByText('card:Operation Falafel')).toBeTruthy());
    await tap(view, 'New search');
    await waitFor(() => expect(view.getByText(INTRO)).toBeTruthy());
    expect(view.getByRole('button', { name: 'Arabic' })).toBeTruthy();
    expect(view.queryByText('card:Operation Falafel')).toBeNull();
    expect(api.getQuestions).toHaveBeenCalledTimes(1);
  });

  it('has a "New search" button under the result card, not on the intro', async () => {
    const view = await renderReady();
    expect(view.queryByRole('button', { name: 'Start a new search' })).toBeNull();
    await playThrough(view);
    await waitFor(() => expect(view.getByText('card:Operation Falafel')).toBeTruthy());
    expect(view.getByRole('button', { name: 'Start a new search' })).toBeTruthy();
    expect(view.getByText('Start a new search')).toBeTruthy();
  });

  it('the button under the result returns to the intro and the first question, scrolled to the top', async () => {
    const view = await renderReady();
    await playThrough(view);
    await waitFor(() => expect(view.getByText('card:Operation Falafel')).toBeTruthy());
    const { instance } = scroller(view);
    await tap(view, 'Start a new search');
    await waitFor(() => expect(view.getByText(INTRO)).toBeTruthy());
    expect(view.getByRole('button', { name: 'Arabic' })).toBeTruthy();
    expect(view.queryByText('card:Operation Falafel')).toBeNull();
    expect(view.queryByRole('button', { name: 'Start a new search' })).toBeNull();
    expect(instance.scrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
    expect(api.getQuestions).toHaveBeenCalledTimes(1);
  });
});


/**
 * RNTL v14 has no instance queries, so the host element comes from testID and
 * the spies from the jest ScrollView mock, whose scrollTo/scrollToEnd are
 * jest.fn on the (shared) prototype: the real component, not a hand-made fake.
 */
function scroller(view: Awaited<ReturnType<typeof renderReady>>) {
  const node = view.getByTestId('discover-scroll');
  const instance = ScrollView.prototype as unknown as { scrollTo: jest.Mock; scrollToEnd: jest.Mock };
  instance.scrollTo.mockClear();
  instance.scrollToEnd.mockClear();
  return { node, instance };
}

describe('Discover screen: search history', () => {
  it('records the pick that was shown with the answers that led to it', async () => {
    const view = await renderReady();
    await playThrough(view);
    await waitFor(() => expect(view.getByText('card:Operation Falafel')).toBeTruthy());
    await waitFor(() => expect(getHistoryState().entries).toHaveLength(1));
    expect(getHistoryState().entries[0]).toMatchObject({ key: 'rest-1', name: 'Operation Falafel', answers: ['Arabic', 'Mid'] });
  });

  it('leaves "No preference" (a skipped question) out of the answers', async () => {
    const view = await renderReady();
    await tap(view, 'Arabic');
    await waitFor(() => expect(view.getByText("What's your budget per person?")).toBeTruthy());
    await tap(view, 'Skip');
    await waitFor(() => expect(getHistoryState().entries).toHaveLength(1));
    expect(getHistoryState().entries[0].answers).toEqual(['Arabic']);
  });

  it('records nothing for a no-match result', async () => {
    api.resolveDiscovery.mockResolvedValue({ ok: true, result: { tier: 1, source: 'none', picks: [], note: null } });
    const view = await renderReady();
    await playThrough(view);
    await waitFor(() => expect(view.getByText(/haven't covered this combination/)).toBeTruthy());
    expect(getHistoryState().entries).toEqual([]);
  });
});

describe('Discover screen: fixed brand header', () => {
  it('shows the brand header with the wordmark', async () => {
    const view = await renderReady();
    expect(view.getByRole('header', { name: 'Abu Dhabi Foodies' })).toBeTruthy();
  });

  it('keeps the header outside the ScrollView so it never scrolls', async () => {
    const view = await renderReady();
    const { node } = scroller(view);
    expect(within(node).queryByText('Abu Dhabi Foodies')).toBeNull();
    expect(within(node).queryByTestId('app-header-bar')).toBeNull();
    expect(view.getByTestId('app-header-bar')).toBeTruthy();
  });

  it('orders the header before the scrolling content, with no ad between them', async () => {
    const view = await renderReady();
    const tree = JSON.stringify(view.toJSON());
    const header = tree.indexOf('Abu Dhabi Foodies');
    const content = tree.indexOf('RCTScrollView');
    expect(header).toBeGreaterThan(-1);
    expect(content).toBeGreaterThan(header);
    expect(view.queryByText('Ad')).toBeNull();
  });
});

describe('Discover screen: header New search button', () => {
  it('is hidden on the intro', async () => {
    const view = await renderReady();
    expect(view.queryByRole('button', { name: 'New search' })).toBeNull();
  });

  it('appears after the first answer, restarts the flow and scrolls back to the top', async () => {
    const view = await renderReady();
    await tap(view, 'Arabic');
    await waitFor(() => expect(view.getByText("What's your budget per person?")).toBeTruthy());
    const { instance } = scroller(view);
    await tap(view, 'New search');
    await waitFor(() => expect(view.getByText(INTRO)).toBeTruthy());
    expect(instance.scrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
    expect(view.queryByRole('button', { name: 'New search' })).toBeNull();
    expect(api.getQuestions).toHaveBeenCalledTimes(1);
  });

  it('stays available next to a result and scrolls back to the top when used there', async () => {
    const view = await renderReady();
    await playThrough(view);
    await waitFor(() => expect(view.getByText('card:Operation Falafel')).toBeTruthy());
    expect(view.getByRole('button', { name: 'New search' })).toBeTruthy();
    const { instance } = scroller(view);
    await tap(view, 'New search');
    expect(instance.scrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
  });
});

describe('Discover screen: chat-like auto-scroll', () => {
  it('does not scroll when the intro loads', async () => {
    const view = await renderReady();
    const { node, instance } = scroller(view);
    await fireEvent(node, 'contentSizeChange', 390, 400);
    await fireEvent(node, 'contentSizeChange', 390, 600);
    expect(instance.scrollToEnd).not.toHaveBeenCalled();
  });

  it('scrolls to the end when content grows after the first answer', async () => {
    const view = await renderReady();
    const { node, instance } = scroller(view);
    await fireEvent(node, 'contentSizeChange', 390, 400);
    await tap(view, 'Arabic');
    await waitFor(() => expect(view.getByText("What's your budget per person?")).toBeTruthy());
    await fireEvent(node, 'contentSizeChange', 390, 650);
    expect(instance.scrollToEnd).toHaveBeenCalledWith({ animated: true });
  });

  it('scrolls the result card into view', async () => {
    const view = await renderReady();
    const { node, instance } = scroller(view);
    await fireEvent(node, 'contentSizeChange', 390, 400);
    await playThrough(view);
    await waitFor(() => expect(view.getByText('card:Operation Falafel')).toBeTruthy());
    await fireEvent(node, 'contentSizeChange', 390, 1200);
    expect(instance.scrollToEnd).toHaveBeenCalledWith({ animated: true });
  });

  it('does not scroll when the content shrinks (restart)', async () => {
    const view = await renderReady();
    const { node, instance } = scroller(view);
    await fireEvent(node, 'contentSizeChange', 390, 400);
    await tap(view, 'Arabic');
    await waitFor(() => expect(view.getByText("What's your budget per person?")).toBeTruthy());
    await fireEvent(node, 'contentSizeChange', 390, 900);
    instance.scrollToEnd.mockClear();
    await fireEvent(node, 'contentSizeChange', 390, 500);
    expect(instance.scrollToEnd).not.toHaveBeenCalled();
  });

  const scrolledUp = {
    nativeEvent: {
      contentOffset: { x: 0, y: 0 },
      contentSize: { width: 390, height: 900 },
      layoutMeasurement: { width: 390, height: 600 },
    },
  };

  it('does not pull a reader back down when they scrolled up and the content grows with no new item', async () => {
    const view = await renderReady();
    const { node, instance } = scroller(view);
    await fireEvent(node, 'contentSizeChange', 390, 400);
    await tap(view, 'Arabic');
    await waitFor(() => expect(view.getByText("What's your budget per person?")).toBeTruthy());
    await fireEvent(node, 'contentSizeChange', 390, 900);
    expect(instance.scrollToEnd).toHaveBeenCalled();
    instance.scrollToEnd.mockClear();
    await fireEvent(node, 'scroll', scrolledUp);
    await fireEvent(node, 'contentSizeChange', 390, 1000); // e.g. an image finished loading
    expect(instance.scrollToEnd).not.toHaveBeenCalled();
  });

  it('keeps following the content while the reader is at the bottom', async () => {
    const view = await renderReady();
    const { node, instance } = scroller(view);
    await fireEvent(node, 'contentSizeChange', 390, 400);
    await tap(view, 'Arabic');
    await waitFor(() => expect(view.getByText("What's your budget per person?")).toBeTruthy());
    await fireEvent(node, 'contentSizeChange', 390, 900);
    instance.scrollToEnd.mockClear();
    await fireEvent(node, 'scroll', {
      nativeEvent: {
        contentOffset: { x: 0, y: 290 },
        contentSize: { width: 390, height: 900 },
        layoutMeasurement: { width: 390, height: 600 },
      },
    });
    await fireEvent(node, 'contentSizeChange', 390, 1000);
    expect(instance.scrollToEnd).toHaveBeenCalledWith({ animated: true });
  });

  it('still scrolls to a newly added result even if the reader had scrolled up', async () => {
    const view = await renderReady();
    const { node, instance } = scroller(view);
    await fireEvent(node, 'contentSizeChange', 390, 400);
    await tap(view, 'Arabic');
    await waitFor(() => expect(view.getByText("What's your budget per person?")).toBeTruthy());
    await fireEvent(node, 'contentSizeChange', 390, 900);
    await fireEvent(node, 'scroll', scrolledUp);
    instance.scrollToEnd.mockClear();
    await tap(view, 'Mid');
    await waitFor(() => expect(view.getByText('card:Operation Falafel')).toBeTruthy());
    await fireEvent(node, 'contentSizeChange', 390, 1500);
    expect(instance.scrollToEnd).toHaveBeenCalledWith({ animated: true });
  });

  it('leaves room under the last item so the card actions are not clipped', async () => {
    const view = await renderReady();
    const { node } = scroller(view);
    const pad = StyleSheet.flatten(node.props.contentContainerStyle).paddingBottom;
    expect(pad).toBeGreaterThanOrEqual(48);
  });
});
