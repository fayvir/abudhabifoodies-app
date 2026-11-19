import { priceAedLabel, priceRangeToBudgetValue, priceTierLabel, priceTierSymbol } from '../price';

describe('price tiers (3-tier model: 4 folds into High)', () => {
  it.each([
    [1, 'budget_1', 'Low', '$'],
    [2, 'budget_2', 'Mid', '$$'],
    [3, 'budget_3', 'High', '$$$'],
    [4, 'budget_3', 'High', '$$$'],
  ])('price_range %i -> %s / %s / %s', (pr, budget, label, symbol) => {
    expect(priceRangeToBudgetValue(pr)).toBe(budget);
    expect(priceTierLabel(pr)).toBe(label);
    expect(priceTierSymbol(pr)).toBe(symbol);
  });

  it.each([[null], [undefined], [0], [5], [Number.NaN]])('%p is unknown', (pr) => {
    expect(priceRangeToBudgetValue(pr)).toBeNull();
    expect(priceTierLabel(pr)).toBe('—');
    expect(priceTierSymbol(pr)).toBe('—');
    expect(priceAedLabel(pr)).toBeNull();
  });

  it.each([
    [1, 'AED 80 pp'],
    [2, 'AED 80–200 pp'],
    [3, 'AED 200+ pp'],
    [4, 'AED 200+ pp'],
  ])('result-card label for %i is %s', (pr, label) => {
    expect(priceAedLabel(pr)).toBe(label);
  });
});
