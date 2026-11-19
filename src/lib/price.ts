/**
 * 3-tier price model (mirrors the website's): the DB keeps
 * Google's 1-4 scale, display folds 4 ("Very High") into High. Only the
 * integers 1..4 are valid; anything else is unknown.
 */
type Tier = 1 | 2 | 3;

function tier(priceRange: number | null | undefined): Tier | null {
  if (priceRange === 1) return 1;
  if (priceRange === 2) return 2;
  if (priceRange === 3 || priceRange === 4) return 3;
  return null;
}

export function priceRangeToBudgetValue(
  priceRange: number | null | undefined,
): 'budget_1' | 'budget_2' | 'budget_3' | null {
  const t = tier(priceRange);
  return t === null ? null : (`budget_${t}` as 'budget_1' | 'budget_2' | 'budget_3');
}

export function priceTierLabel(priceRange: number | null | undefined): 'Low' | 'Mid' | 'High' | '—' {
  const t = tier(priceRange);
  return t === 1 ? 'Low' : t === 2 ? 'Mid' : t === 3 ? 'High' : '—';
}

export function priceTierSymbol(priceRange: number | null | undefined): '$' | '$$' | '$$$' | '—' {
  const t = tier(priceRange);
  return t === 1 ? '$' : t === 2 ? '$$' : t === 3 ? '$$$' : '—';
}

/** Result-card price label, as on the website. */
export function priceAedLabel(priceRange: number | null | undefined): string | null {
  const t = tier(priceRange);
  return t === 1 ? 'AED 80 pp' : t === 2 ? 'AED 80–200 pp' : t === 3 ? 'AED 200+ pp' : null;
}
