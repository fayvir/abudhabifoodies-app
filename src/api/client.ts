import { whenAnalyticsReady } from '../settings/analyticsPreference';
import type {
  ApiResult,
  DiscoverySnapshot,
  FlowEventType,
  PublicRestaurant,
  Selections,
} from './types';

export const BASE_URL = 'https://www.abudhabifoodies.ae';

// Identifies the app (and that it is a mobile client) in the site's server logs.
const USER_AGENT = 'AbuDhabiFoodies/1.0 (Mobile)';

const LOAD_NOTE = 'Something went wrong loading the guide.';
const ID_CHUNK = 40;
const TIMEOUT_MS = 15_000;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

interface Reply {
  status: number;
  ok: boolean;
  body: unknown;
}

/** Never throws; a network failure or unparsable body gives body === undefined. */
async function request(path: string, body?: unknown): Promise<Reply | null> {
  const controller = new AbortController();
  // Covers the whole exchange (headers and body); a stall behaves like a network failure.
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
    const init: RequestInit = { method: body === undefined ? 'GET' : 'POST', headers, signal: controller.signal };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`${BASE_URL}${path}`, init);
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      // An abort mid-body is a network failure, not an empty-but-ok reply.
      if (controller.signal.aborted) return null;
      parsed = undefined;
    }
    return { status: res.status, ok: res.ok, body: parsed };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The snapshot shape this build understands; the site bumps it on a breaking change. */
export const SNAPSHOT_VERSION = 1;

export async function getSnapshot(): Promise<ApiResult<DiscoverySnapshot>> {
  const r = await request('/api/discovery/snapshot');
  const b = r?.body;
  if (
    r?.ok &&
    isRecord(b) &&
    b.version === SNAPSHOT_VERSION &&
    Array.isArray(b.questions) &&
    isRecord(b.availability) &&
    isRecord(b.results) &&
    isRecord(b.cards)
  ) {
    return { ok: true, data: b as unknown as DiscoverySnapshot };
  }
  return { ok: false, message: LOAD_NOTE };
}

/**
 * Reports a finished search (the answers and the picks shown) so the site's
 * Insights stay complete now that the phone resolves searches itself.
 * Fire-and-forget, and only with analytics on (Settings > Privacy).
 */
export async function reportCompletion(selections: Selections, sessionId: string, pickIds: string[]): Promise<void> {
  if (!(await whenAnalyticsReady())) return;
  await request('/api/discovery/complete', { selections, pickIds, sessionId });
}

export async function trackFlowEvent(
  sessionId: string,
  eventType: FlowEventType,
  questionKey?: string,
): Promise<void> {
  // User-controlled switch (Settings > Privacy): off means no request at all.
  if (!(await whenAnalyticsReady())) return;
  await request('/api/discovery/track', {
    sessionId,
    eventType,
    ...(questionKey !== undefined ? { questionKey } : {}),
  });
}

export async function getRestaurantsByIds(ids: string[]): Promise<ApiResult<PublicRestaurant[]>> {
  if (ids.length === 0) return { ok: true, data: [] };
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));
  const replies = await Promise.all(
    chunks.map((c) => request(`/api/restaurants?ids=${encodeURIComponent(c.join(',')).replace(/%2C/g, ',')}&limit=500`)),
  );
  const data: PublicRestaurant[] = [];
  for (const r of replies) {
    if (!(r?.ok && isRecord(r.body) && Array.isArray(r.body.restaurants))) {
      return { ok: false, message: "Couldn't load your favourites." };
    }
    data.push(...(r.body.restaurants as PublicRestaurant[]));
  }
  return { ok: true, data };
}
