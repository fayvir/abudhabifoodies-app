/** Test-only helpers for mocking global fetch. Tests must never hit the network. */

export interface FakeResponseInit {
  status?: number;
  body?: unknown;
  /** When set, json() rejects with this (malformed JSON). */
  badJson?: boolean;
}

export function fakeResponse({ status = 200, body = {}, badJson = false }: FakeResponseInit = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => (badJson ? Promise.reject(new SyntaxError('Unexpected token')) : Promise.resolve(body)),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

export type FetchMock = jest.MockedFunction<typeof fetch>;

/** Installs a fresh fetch mock on globalThis and returns it. */
export function installFetch(impl?: (url: string, init?: RequestInit) => Promise<Response>): FetchMock {
  const mock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    impl ? impl(String(input), init) : fakeResponse(),
  ) as unknown as FetchMock;
  globalThis.fetch = mock;
  return mock;
}

export interface RecordedCall {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Normalises the Nth fetch call (headers lower-cased, JSON body parsed). */
export function callAt(mock: FetchMock, index = 0): RecordedCall {
  const [input, init] = mock.mock.calls[index];
  const headers: Record<string, string> = {};
  const raw = init?.headers;
  if (raw) {
    if (typeof Headers !== 'undefined' && raw instanceof Headers) {
      raw.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
    } else if (Array.isArray(raw)) {
      for (const [k, v] of raw) headers[k.toLowerCase()] = v;
    } else {
      for (const [k, v] of Object.entries(raw as Record<string, string>)) headers[k.toLowerCase()] = v;
    }
  }
  const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
  return { url: new URL(String(input)), method: (init?.method ?? 'GET').toUpperCase(), headers, body };
}
