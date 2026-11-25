import type { DiscoverySnapshot } from '../api/types';

/**
 * The curator's note for a restaurant, from the guide's downloaded picks.
 * Editorial picks only: a sponsored pick's note shown here would be paid words
 * with no Sponsored label. Several editorial notes: the lowest pick id, so the
 * same note shows every time.
 */
export function noteFor(snapshot: DiscoverySnapshot | null, restaurantId: string): string | null {
  if (!snapshot) return null;
  const ids = Object.keys(snapshot.cards).sort();
  for (const id of ids) {
    const c = snapshot.cards[id];
    if (c.restaurant_id === restaurantId && !c.is_sponsored && c.note?.trim()) return c.note.trim();
  }
  return null;
}
