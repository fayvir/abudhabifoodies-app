import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BASE_URL,
  getAvailability,
  getQuestions,
  getRestaurantsByIds,
  resolveDiscovery,
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

const RATE_LIMIT_NOTE = "You're going a bit fast — give it a few seconds and try again.";
const GENERIC_NOTE = 'Something went wrong — please try again.';

describe('base URL and headers', () => {
  it('is exactly the www host (the apex 308-redirects)', () => {
    expect(BASE_URL).toBe('https://www.abudhabifoodies.ae');
  });

  it.each([
    ['getQuestions', () => getQuestions()],
    ['getAvailability', () => getAvailability('budget', {})],
    ['resolveDiscovery', () => resolveDiscovery({ cuisine: 'arabic' }, 's1')],
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
    await resolveDiscovery({ cuisine: 'arabic' }, 's1');
    expect(callAt(fetchMock).headers['content-type']).toContain('application/json');
  });
});

describe('getQuestions', () => {
  it('GETs /api/discovery/questions and returns the questions array', async () => {
    const fetchMock = installFetch(async () => fakeResponse({ body: questionsFixture }));
    const result = await getQuestions();
    const req = callAt(fetchMock);
    expect(req.method).toBe('GET');
    expect(req.url.pathname).toBe('/api/discovery/questions');
    expect(result).toEqual({ ok: true, data: questionsFixture.questions });
  });

  it('returns a typed failure (not a throw) on a network error', async () => {
    installFetch(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(getQuestions()).resolves.toMatchObject({ ok: false });
  });

  it('returns a typed failure on a 500', async () => {
    installFetch(async () => fakeResponse({ status: 500, body: { error: 'Could not load questions', code: 'DB_ERROR' } }));
    await expect(getQuestions()).resolves.toMatchObject({ ok: false });
  });

  it('returns a typed failure when the body has no questions array', async () => {
    installFetch(async () => fakeResponse({ body: { nope: true } }));
    await expect(getQuestions()).resolves.toMatchObject({ ok: false });
  });

  it('returns a typed failure on malformed JSON', async () => {
    installFetch(async () => fakeResponse({ badJson: true }));
    await expect(getQuestions()).resolves.toMatchObject({ ok: false });
  });
});

describe('getAvailability', () => {
  it('POSTs questionKey and selections to /api/discovery/availability', async () => {
    const fetchMock = installFetch(async () => fakeResponse({ body: { available: ['budget_1'], gated: true } }));
    await getAvailability('budget', { cuisine: 'arabic' });
    const req = callAt(fetchMock);
    expect(req.method).toBe('POST');
    expect(req.url.pathname).toBe('/api/discovery/availability');
    expect(req.body).toEqual({ questionKey: 'budget', selections: { cuisine: 'arabic' } });
  });

  it('returns the gated list when the server gates', async () => {
    installFetch(async () => fakeResponse({ body: { available: ['budget_1', 'budget_3'], gated: true } }));
    await expect(getAvailability('budget', {})).resolves.toEqual({ gated: true, available: ['budget_1', 'budget_3'] });
  });

  it('returns not-gated when the server says gated:false', async () => {
    installFetch(async () => fakeResponse({ body: { available: ['a'], gated: false } }));
    await expect(getAvailability('budget', {})).resolves.toEqual({ gated: false });
  });

  it('fails open on a network error', async () => {
    installFetch(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(getAvailability('budget', {})).resolves.toEqual({ gated: false });
  });

  it('fails open on a 429 with the fail-open body', async () => {
    installFetch(async () => fakeResponse({ status: 429, body: { available: [], gated: false } }));
    await expect(getAvailability('budget', {})).resolves.toEqual({ gated: false });
  });

  it('fails open on a 500', async () => {
    installFetch(async () => fakeResponse({ status: 500, body: { error: 'x', code: 'y' } }));
    await expect(getAvailability('budget', {})).resolves.toEqual({ gated: false });
  });

  it('fails open on a 400', async () => {
    installFetch(async () => fakeResponse({ status: 400, body: { error: 'Invalid input', code: 'INVALID_INPUT' } }));
    await expect(getAvailability('budget', {})).resolves.toEqual({ gated: false });
  });

  it('fails open on malformed JSON', async () => {
    installFetch(async () => fakeResponse({ badJson: true }));
    await expect(getAvailability('budget', {})).resolves.toEqual({ gated: false });
  });

  it('fails open when gated is true but available is not an array', async () => {
    installFetch(async () => fakeResponse({ body: { available: 'budget_1', gated: true } }));
    await expect(getAvailability('budget', {})).resolves.toEqual({ gated: false });
  });

  it('ignores non-string entries in available', async () => {
    installFetch(async () => fakeResponse({ body: { available: ['budget_1', 7, null], gated: true } }));
    await expect(getAvailability('budget', {})).resolves.toEqual({ gated: true, available: ['budget_1'] });
  });
});

describe('resolveDiscovery', () => {
  const hit = { tier: 1, source: 'curated', picks: [{ restaurant_name: 'Nolu', restaurant_id: null, note: 'n', cuisine: [], area: null, price_range: 2, rating: 4.5, google_maps: null, website: null }], note: null };

  it('POSTs selections and sessionId to /api/discovery/resolve', async () => {
    const fetchMock = installFetch(async () => fakeResponse({ body: { result: hit } }));
    await resolveDiscovery({ cuisine: 'arabic', budget: 'budget_2' }, 'session-1');
    const req = callAt(fetchMock);
    expect(req.method).toBe('POST');
    expect(req.url.pathname).toBe('/api/discovery/resolve');
    expect(req.body).toEqual({ selections: { cuisine: 'arabic', budget: 'budget_2' }, sessionId: 'session-1' });
  });

  it('returns the result on success', async () => {
    installFetch(async () => fakeResponse({ body: { result: hit } }));
    await expect(resolveDiscovery({ cuisine: 'arabic' }, 's')).resolves.toEqual({ ok: true, result: hit });
  });

  it('passes a no-match result through as ok (it is a valid answer, not an error)', async () => {
    const none = { tier: 1, source: 'none', picks: [], note: "Abu Dhabi Foodies hasn't covered this combination yet — try a different option." };
    installFetch(async () => fakeResponse({ body: { result: none } }));
    await expect(resolveDiscovery({ cuisine: 'arabic' }, 's')).resolves.toEqual({ ok: true, result: none });
  });

  it('turns a 429 into a rate_limited failure with the visible note', async () => {
    installFetch(async () => fakeResponse({ status: 429, body: { error: 'Too many requests.', code: 'RATE_LIMITED' } }));
    await expect(resolveDiscovery({ cuisine: 'arabic' }, 's')).resolves.toEqual({
      ok: false,
      reason: 'rate_limited',
      message: RATE_LIMIT_NOTE,
    });
  });

  it('turns a 500 into a generic error failure', async () => {
    installFetch(async () => fakeResponse({ status: 500, body: { error: 'x', code: 'RESOLVE_ERROR' } }));
    await expect(resolveDiscovery({ cuisine: 'arabic' }, 's')).resolves.toEqual({
      ok: false,
      reason: 'error',
      message: GENERIC_NOTE,
    });
  });

  it('turns a network error into a generic error failure instead of throwing', async () => {
    installFetch(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(resolveDiscovery({ cuisine: 'arabic' }, 's')).resolves.toEqual({
      ok: false,
      reason: 'error',
      message: GENERIC_NOTE,
    });
  });

  it('turns malformed JSON into a generic error failure', async () => {
    installFetch(async () => fakeResponse({ badJson: true }));
    await expect(resolveDiscovery({ cuisine: 'arabic' }, 's')).resolves.toMatchObject({ ok: false, reason: 'error', message: GENERIC_NOTE });
  });

  it('turns a 200 without a result into a generic error failure', async () => {
    installFetch(async () => fakeResponse({ body: {} }));
    await expect(resolveDiscovery({ cuisine: 'arabic' }, 's')).resolves.toMatchObject({ ok: false, reason: 'error' });
  });

  it('turns a 200 whose result has no picks array into a generic error failure', async () => {
    installFetch(async () => fakeResponse({ body: { result: { tier: 1, source: 'none' } } }));
    await expect(resolveDiscovery({ cuisine: 'arabic' }, 's')).resolves.toEqual({
      ok: false,
      reason: 'error',
      message: GENERIC_NOTE,
    });
  });
});

describe('resolveDiscovery and the analytics switch', () => {
  afterEach(() => __resetAnalyticsForTests());

  it('sends the session id when analytics is on', async () => {
    const fetchMock = installFetch(async () => fakeResponse({ body: { result: { tier: 1, source: 'none', picks: [], note: null } } }));
    await resolveDiscovery({ cuisine: 'arabic' }, 's1');
    expect(callAt(fetchMock).body).toEqual({ selections: { cuisine: 'arabic' }, sessionId: 's1' });
  });

  it('leaves the session id out when analytics is off, so the search is not linked to a run', async () => {
    await saveAnalyticsPreference(false);
    const fetchMock = installFetch(async () => fakeResponse({ body: { result: { tier: 1, source: 'none', picks: [], note: null } } }));
    await resolveDiscovery({ cuisine: 'arabic' }, 's1');
    expect(callAt(fetchMock).body).toEqual({ selections: { cuisine: 'arabic' } });
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

  it('leaves the session id out of a search when "off" is saved and nothing has loaded the preference yet', async () => {
    await AsyncStorage.setItem('abf_analytics', 'off');
    const fetchMock = installFetch(async () => fakeResponse({ body: { result: { tier: 1, source: 'none', picks: [], note: null } } }));
    await resolveDiscovery({ cuisine: 'arabic' }, 's1');
    expect(callAt(fetchMock).body).toEqual({ selections: { cuisine: 'arabic' } });
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
    await getQuestions();
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
    ['getQuestions', () => getQuestions(), { ok: false, message: 'Something went wrong loading the guide.' }],
    ['getAvailability', () => getAvailability('budget', {}), { gated: false }],
    [
      'resolveDiscovery',
      () => resolveDiscovery({ cuisine: 'arabic' }, 's1'),
      { ok: false, reason: 'error', message: GENERIC_NOTE },
    ],
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
      ['resolveDiscovery', 200, () => resolveDiscovery({ cuisine: 'arabic' }, 's1'), { ok: false, reason: 'error', message: GENERIC_NOTE }],
      // A 429 whose body stalls must not be reported as rate limiting: the read failed.
      ['resolveDiscovery (429 headers)', 429, () => resolveDiscovery({ cuisine: 'arabic' }, 's1'), { ok: false, reason: 'error', message: GENERIC_NOTE }],
      ['getAvailability', 200, () => getAvailability('budget', {}), { gated: false }],
      ['getQuestions', 200, () => getQuestions(), { ok: false, message: 'Something went wrong loading the guide.' }],
      ['getRestaurantsByIds', 200, () => getRestaurantsByIds(['a']), { ok: false, message: "Couldn't load your favourites." }],
    ])('%s fails like a network error after 15s', async (_name, status, call, expected) => {
      stallingBodyFetch(status);
      const promise = call();
      await jest.advanceTimersByTimeAsync(15_500);
      await expect(promise).resolves.toEqual(expected);
    });
  });
});
