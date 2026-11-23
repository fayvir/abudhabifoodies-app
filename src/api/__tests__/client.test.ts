import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BASE_URL,
  getRestaurantsByIds,
  getSnapshot,
  reportCompletion,
  SNAPSHOT_VERSION,
  trackFlowEvent,
} from '../client';
import questionsFixture from '../__fixtures__/questions.json';
import { __resetAnalyticsForTests, saveAnalyticsPreference } from '../../settings/analyticsPreference';
import { callAt, fakeResponse, installFetch } from '../../testing/fetch';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The analytics switch is read from storage: never let one test's saved choice leak into the next.
afterEach(async () => {
  __resetAnalyticsForTests();
  await AsyncStorage.clear();
});

const LOAD_NOTE = 'Something went wrong loading the guide.';

function snapshotBody(overrides: Record<string, unknown> = {}) {
  return {
    version: SNAPSHOT_VERSION,
    generated_at: '2026-11-23T00:00:00Z',
    questions: questionsFixture.questions,
    availability: {},
    results: {},
    cards: {},
    no_match_note: 'Nothing yet.',
    ...overrides,
  };
}

describe('base URL and headers', () => {
  it('is exactly the www host (the apex 308-redirects)', () => {
    expect(BASE_URL).toBe('https://www.abudhabifoodies.ae');
  });

  it.each([
    ['getSnapshot', () => getSnapshot()],
    ['reportCompletion', () => reportCompletion({ cuisine: 'arabic' }, 's1', [])],
    ['trackFlowEvent', () => trackFlowEvent('s1', 'started', 'cuisine')],
    ['getRestaurantsByIds', () => getRestaurantsByIds(['a'])],
  ])('%s sends a Mobile User-Agent to the www host', async (_name, call) => {
    const fetchMock = installFetch();
    await call();
    expect(fetchMock).toHaveBeenCalled();
    const req = callAt(fetchMock);
    expect(req.url.origin).toBe('https://www.abudhabifoodies.ae');
    expect(req.headers['user-agent']).toContain('Mobile');
  });

  it('sends JSON content-type on POST requests', async () => {
    const fetchMock = installFetch();
    await reportCompletion({ cuisine: 'arabic' }, 's1', []);
    expect(callAt(fetchMock).headers['content-type']).toContain('application/json');
  });
});

describe('getSnapshot', () => {
  it('GETs /api/discovery/snapshot and returns the snapshot', async () => {
    const body = snapshotBody();
    const fetchMock = installFetch(async () => fakeResponse({ body }));
    const result = await getSnapshot();
    const req = callAt(fetchMock);
    expect(req.method).toBe('GET');
    expect(req.url.pathname).toBe('/api/discovery/snapshot');
    expect(result).toEqual({ ok: true, data: body });
  });

  it.each([
    ['a 500', fakeResponse({ status: 500, body: { error: 'x' } })],
    ['another snapshot version', fakeResponse({ body: snapshotBody({ version: SNAPSHOT_VERSION + 1 }) })],
    ['questions missing', fakeResponse({ body: snapshotBody({ questions: undefined }) })],
    ['results missing', fakeResponse({ body: snapshotBody({ results: null }) })],
    ['cards missing', fakeResponse({ body: snapshotBody({ cards: undefined }) })],
    ['availability missing', fakeResponse({ body: snapshotBody({ availability: undefined }) })],
    ['malformed JSON', fakeResponse({ badJson: true })],
  ])('returns a typed failure on %s', async (_name, response) => {
    installFetch(async () => response);
    await expect(getSnapshot()).resolves.toEqual({ ok: false, message: LOAD_NOTE });
  });

  it('returns a typed failure on a network error', async () => {
    installFetch(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(getSnapshot()).resolves.toEqual({ ok: false, message: LOAD_NOTE });
  });

  it('is not gated by the analytics switch', async () => {
    const fetchMock = installFetch(async () => fakeResponse({ body: snapshotBody() }));
    await saveAnalyticsPreference(false);
    await getSnapshot();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('reportCompletion', () => {
  it('POSTs the answers, the pick ids shown and the session id to /api/discovery/complete', async () => {
    const fetchMock = installFetch();
    await reportCompletion({ cuisine: 'arabic', budget: 'budget_2' }, 's1', ['pick-1']);
    const req = callAt(fetchMock);
    expect(req.method).toBe('POST');
    expect(req.url.pathname).toBe('/api/discovery/complete');
    expect(req.body).toEqual({ selections: { cuisine: 'arabic', budget: 'budget_2' }, pickIds: ['pick-1'], sessionId: 's1' });
  });

  it('makes no request at all when analytics is off', async () => {
    const fetchMock = installFetch();
    await saveAnalyticsPreference(false);
    await reportCompletion({ cuisine: 'arabic' }, 's1', []);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('makes no request when "off" is saved and nothing has loaded the preference yet', async () => {
    await AsyncStorage.setItem('abf_analytics', 'off');
    const fetchMock = installFetch();
    await reportCompletion({ cuisine: 'arabic' }, 's1', []);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows network errors and error statuses', async () => {
    installFetch(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(reportCompletion({ cuisine: 'arabic' }, 's1', [])).resolves.toBeUndefined();
    installFetch(async () => fakeResponse({ status: 429 }));
    await expect(reportCompletion({ cuisine: 'arabic' }, 's1', [])).resolves.toBeUndefined();
  });
});

describe('analytics switch before the saved choice has loaded (app start)', () => {
  afterEach(async () => {
    __resetAnalyticsForTests();
    await AsyncStorage.clear(); // saved "off" must not leak into later tests
  });

  it('sends no tracking request when "off" is saved, even if the call comes before anything loaded the preference', async () => {
    await AsyncStorage.setItem('abf_analytics', 'off');
    const fetchMock = installFetch();
    await trackFlowEvent('s1', 'started', 'cuisine');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still tracks at start when nothing is saved (default on)', async () => {
    const fetchMock = installFetch();
    await trackFlowEvent('s1', 'started', 'cuisine');
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe('trackFlowEvent analytics switch', () => {
  afterEach(() => __resetAnalyticsForTests()); // the switch is module state: never leak off into other tests

  it('makes no request at all when analytics is off', async () => {
    const fetchMock = installFetch();
    await saveAnalyticsPreference(false);
    await trackFlowEvent('s1', 'started', 'cuisine');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends again as soon as it is switched back on, with no restart', async () => {
    const fetchMock = installFetch();
    await saveAnalyticsPreference(false);
    await trackFlowEvent('s1', 'started');
    await saveAnalyticsPreference(true);
    await trackFlowEvent('s1', 'started');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not gate the other endpoints', async () => {
    const fetchMock = installFetch();
    await saveAnalyticsPreference(false);
    await getRestaurantsByIds(['a']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('trackFlowEvent', () => {
  it('POSTs sessionId, eventType and questionKey to /api/discovery/track', async () => {
    const fetchMock = installFetch();
    await trackFlowEvent('s1', 'question_seen', 'budget');
    const req = callAt(fetchMock);
    expect(req.method).toBe('POST');
    expect(req.url.pathname).toBe('/api/discovery/track');
    expect(req.body).toEqual({ sessionId: 's1', eventType: 'question_seen', questionKey: 'budget' });
  });

  it('omits questionKey when none is given', async () => {
    const fetchMock = installFetch();
    await trackFlowEvent('s1', 'started');
    expect(callAt(fetchMock).body).toEqual({ sessionId: 's1', eventType: 'started' });
  });

  it('swallows a network error', async () => {
    installFetch(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(trackFlowEvent('s1', 'started', 'cuisine')).resolves.toBeUndefined();
  });

  it('swallows a 429 and a 500', async () => {
    installFetch(async () => fakeResponse({ status: 429, body: { ok: false } }));
    await expect(trackFlowEvent('s1', 'started')).resolves.toBeUndefined();
    installFetch(async () => fakeResponse({ status: 500 }));
    await expect(trackFlowEvent('s1', 'started')).resolves.toBeUndefined();
  });

  it('swallows a synchronous throw from fetch itself', async () => {
    globalThis.fetch = jest.fn(() => {
      throw new Error('boom');
    }) as unknown as typeof fetch;
    await expect(trackFlowEvent('s1', 'started')).resolves.toBeUndefined();
  });
});

describe('getRestaurantsByIds', () => {
  const restaurant = (id: string) => ({ id, name: id, slug: id, cuisine: [], area: 'Saadiyat', price_range: 2, rating: 4, phone: null, website: null, google_maps: null, photos: [], lat: null, lng: null, is_gem: false, hours: null });

  it('makes no request and returns an empty success for an empty list', async () => {
    const fetchMock = installFetch();
    await expect(getRestaurantsByIds([])).resolves.toEqual({ ok: true, data: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('GETs /api/restaurants with comma-joined ids and limit=500', async () => {
    const fetchMock = installFetch(async () => fakeResponse({ body: { restaurants: [restaurant('a'), restaurant('b')] } }));
    const result = await getRestaurantsByIds(['a', 'b']);
    const req = callAt(fetchMock);
    expect(req.method).toBe('GET');
    expect(req.url.pathname).toBe('/api/restaurants');
    expect(req.url.searchParams.get('ids')).toBe('a,b');
    expect(req.url.searchParams.get('limit')).toBe('500');
    expect(result).toEqual({ ok: true, data: [restaurant('a'), restaurant('b')] });
  });

  it('chunks long id lists into requests of at most 40 ids and merges the results', async () => {
    const ids = Array.from({ length: 85 }, (_, i) => `id-${i}`);
    const fetchMock = installFetch(async (url) => {
      const requested = (new URL(url).searchParams.get('ids') ?? '').split(',');
      return fakeResponse({ body: { restaurants: requested.map(restaurant) } });
    });
    const result = await getRestaurantsByIds(ids);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 3; i += 1) {
      const count = (callAt(fetchMock, i).url.searchParams.get('ids') ?? '').split(',').length;
      expect(count).toBeLessThanOrEqual(40);
    }
    expect(result.ok && result.data.map((r) => r.id)).toEqual(ids);
  });

  it('returns a typed failure on a 500', async () => {
    installFetch(async () => fakeResponse({ status: 500, body: { error: 'x', code: 'DB_ERROR' } }));
    await expect(getRestaurantsByIds(['a'])).resolves.toMatchObject({ ok: false });
  });

  it('returns a typed failure on a network error', async () => {
    installFetch(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(getRestaurantsByIds(['a'])).resolves.toMatchObject({ ok: false });
  });

  it('returns a typed failure when any chunk fails', async () => {
    let n = 0;
    installFetch(async () => {
      n += 1;
      return n === 2 ? fakeResponse({ status: 500 }) : fakeResponse({ body: { restaurants: [] } });
    });
    const ids = Array.from({ length: 85 }, (_, i) => `id-${i}`);
    await expect(getRestaurantsByIds(ids)).resolves.toMatchObject({ ok: false });
  });
});

describe('request timeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /** A fetch that never resolves but rejects (like the real one) when its signal aborts. */
  function hangingFetch() {
    return installFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
  }

  it.each([
    ['getSnapshot', () => getSnapshot(), { ok: false, message: LOAD_NOTE }],
    ['reportCompletion', () => reportCompletion({ cuisine: 'arabic' }, 's1', []), undefined],
    ['trackFlowEvent', () => trackFlowEvent('s1', 'started', 'cuisine'), undefined],
    ['getRestaurantsByIds', () => getRestaurantsByIds(['a']), { ok: false, message: "Couldn't load your favourites." }],
  ])('%s gives up after 15s like a network failure', async (_name, call, expected) => {
    const fetchMock = hangingFetch();
    const promise = call();
    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    await jest.advanceTimersByTimeAsync(14_000);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1_500);
    await expect(promise).resolves.toEqual(expected);
    expect(fetchMock.mock.calls[0][1]?.signal).toBeDefined();
  });

  describe('abort while the body is being read', () => {
    /** Headers arrive at once; json() hangs until the signal aborts, then rejects. */
    function stallingBodyFetch(status = 200) {
      return installFetch(async (_url, init) => ({
        ok: status >= 200 && status < 300,
        status,
        json: () =>
          new Promise<unknown>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      }) as unknown as Response);
    }

    it.each([
      ['getSnapshot', 200, () => getSnapshot(), { ok: false, message: LOAD_NOTE }],
      ['getRestaurantsByIds', 200, () => getRestaurantsByIds(['a']), { ok: false, message: "Couldn't load your favourites." }],
    ])('%s fails like a network error after 15s', async (_name, status, call, expected) => {
      stallingBodyFetch(status);
      const promise = call();
      await jest.advanceTimersByTimeAsync(15_500);
      await expect(promise).resolves.toEqual(expected);
    });
  });
});
