import { whenAnalyticsReady } from '../settings/analyticsPreference';
import type {
  ApiResult,
  Availability,
  DiscoveryResult,
  DiscoveryQuestionWithOptions,
  FlowEventType,
  PublicRestaurant,
  ResolveOutcome,
  Selections,
} from './types';

export const BASE_URL = 'https://www.abudhabifoodies.ae';

// Identifies the app (and that it is a mobile client) in the site's server logs.
const USER_AGENT = 'AbuDhabiFoodies/1.0 (Mobile)';

const RATE_LIMIT_NOTE = "You're going a bit fast — give it a few seconds and try again.";
const GENERIC_NOTE = 'Something went wrong — please try again.';
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

export async function getQuestions(): Promise<ApiResult<DiscoveryQuestionWithOptions[]>> {
  const r = await request('/api/discovery/questions');
  if (r?.ok && isRecord(r.body) && Array.isArray(r.body.questions)) {
    return { ok: true, data: r.body.questions as DiscoveryQuestionWithOptions[] };
  }
  return { ok: false, message: 'Something went wrong loading the guide.' };
}

export async function getAvailability(questionKey: string, selections: Selections): Promise<Availability> {
  const r = await request('/api/discovery/availability', { questionKey, selections });
  if (r?.ok && isRecord(r.body) && r.body.gated === true && Array.isArray(r.body.available)) {
    return { gated: true, available: r.body.available.filter((v): v is string => typeof v === 'string') };
  }
  return { gated: false };
}

export async function resolveDiscovery(selections: Selections, sessionId: string): Promise<ResolveOutcome> {
  // With analytics off the session id is not sent, so the server cannot link this
  // search to the run's other events (Settings > Privacy).
  const body = (await whenAnalyticsReady()) ? { selections, sessionId } : { selections };
  const r = await request('/api/discovery/resolve', body);
  if (r?.ok && isRecord(r.body) && isRecord(r.body.result) && Array.isArray(r.body.result.picks)) {
    return { ok: true, result: r.body.result as unknown as DiscoveryResult };
  }
  if (r?.status === 429) return { ok: false, reason: 'rate_limited', message: RATE_LIMIT_NOTE };
  return { ok: false, reason: 'error', message: GENERIC_NOTE };
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
