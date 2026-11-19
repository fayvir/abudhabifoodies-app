/** Outbound URLs, built exactly as the website builds them. Empty -> null. */
export function telUrl(phone: string | null | undefined): string | null {
  return phone ? `tel:${phone}` : null;
}

export function directionsUrl(googleMaps: string | null | undefined): string | null {
  return googleMaps || null;
}

export function reserveUrl(website: string | null | undefined): string | null {
  return website || null;
}

// Same rule as the website's validator: a post or Reel only.
const INSTAGRAM_URL = /^https:\/\/(www\.)?instagram\.com\/(p|reel|reels)\/[^\s/?#]+\/?(\?\S*)?$/;

/**
 * The curated Instagram post/Reel for a pick. Only an https URL whose host is
 * exactly instagram.com / www.instagram.com is accepted (a regex, not `URL`,
 * so it behaves the same on every JS engine); anything else gives null.
 */
export function instagramUrl(value: unknown): string | null {
  return typeof value === 'string' && INSTAGRAM_URL.test(value) ? value : null;
}

export const FEEDBACK_EMAIL = 'contact@abudhabifoodies.ae';

/** Pre-filled email to the team; the app version goes in the body so a report says which build it is about. */
export function feedbackUrl(appVersion: string | null): string {
  const subject = encodeURIComponent('Abu Dhabi Foodies app feedback');
  const footer = appVersion ? `\n\n--\nApp ${appVersion}` : '';
  return `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${encodeURIComponent(footer)}`;
}
