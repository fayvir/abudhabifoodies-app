import type { ResultCard } from '../api/types';

const FOOTER = 'Find more on Abu Dhabi Foodies: https://abudhabifoodies.ae';

/**
 * Website share text, plus the sponsored disclosure (the website drops it,
 * which loses the label when a paid pick is forwarded).
 */
export function buildShareText(card: ResultCard): string {
  const lines = [card.restaurant_name];
  if (card.is_sponsored === true) {
    const advertiser = card.advertiser_name?.trim();
    lines.push(advertiser ? `Sponsored · ${advertiser}` : 'Sponsored');
  }
  if (card.note) lines.push(`"${card.note}"`);
  const meta = [(card.cuisine ?? []).join(', '), card.area ?? ''].filter(Boolean).join(' · ');
  if (meta) lines.push(meta);
  lines.push(FOOTER);
  return lines.join('\n');
}
