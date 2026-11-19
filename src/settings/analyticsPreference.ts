import AsyncStorage from '@react-native-async-storage/async-storage';

export const ANALYTICS_PREFERENCE_KEY = 'abf_analytics';

// Default is ON. Requests that depend on the switch must not go out before the
// saved choice is known, or someone who switched it off would still send events
// at every app start: they await whenAnalyticsReady() instead of reading
// isAnalyticsEnabled() directly.
let enabled = true;
// Set once the user has chosen this session, so a slow load can't overwrite it.
let chosen = false;
let loading: Promise<boolean> | null = null;

/** Synchronous, for the API client: read just before each tracking request. */
export function isAnalyticsEnabled(): boolean {
  return enabled;
}

/** Resolves with the effective choice once the saved value is known (loads it at most once). */
export async function whenAnalyticsReady(): Promise<boolean> {
  if (chosen) return enabled;
  loading ??= loadAnalyticsPreference();
  await loading;
  return enabled;
}

/** Saved choice; missing, unknown or unreadable means on. */
export async function loadAnalyticsPreference(): Promise<boolean> {
  let value = true;
  try {
    value = (await AsyncStorage.getItem(ANALYTICS_PREFERENCE_KEY)) !== 'off';
  } catch {
    value = true;
  }
  if (!chosen) enabled = value;
  return enabled;
}

/** Takes effect at once (in memory); the write is best effort and never throws. */
export async function saveAnalyticsPreference(on: boolean): Promise<void> {
  enabled = on;
  chosen = true;
  try {
    await AsyncStorage.setItem(ANALYTICS_PREFERENCE_KEY, on ? 'on' : 'off');
  } catch {
    // ignore
  }
}

export function __resetAnalyticsForTests(): void {
  enabled = true;
  chosen = false;
  loading = null;
}
