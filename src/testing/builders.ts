/**
 * Test-only builders for the discovery question graph. The graph is DB data on
 * the real site, so engine tests build small graphs by hand instead of only
 * leaning on the live fixture.
 */
import type { DiscoveryOption, DiscoveryQuestionWithOptions } from '../api/types';

let counter = 0;

export function opt(
  value: string,
  overrides: Partial<DiscoveryOption> = {},
): DiscoveryOption {
  counter += 1;
  return {
    id: `opt-${counter}`,
    question_id: 'q-unset',
    value,
    label: value,
    sort_order: counter,
    filter_field: null,
    filter_value: null,
    is_active: true,
    next_question_id: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function question(
  id: string,
  key: string,
  options: DiscoveryOption[],
  overrides: Partial<DiscoveryQuestionWithOptions> = {},
): DiscoveryQuestionWithOptions {
  return {
    id,
    key,
    label: `Label of ${key}`,
    step_order: 1,
    role: 'primary',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    options: options.map((o) => ({ ...o, question_id: id })),
    ...overrides,
  };
}

import type { PublicRestaurant, ResultCard } from '../api/types';

/** A complete resolve pick; override fields per test. */
export function pick(overrides: Partial<ResultCard> = {}): ResultCard {
  return {
    restaurant_name: 'Operation Falafel',
    restaurant_id: 'rest-1',
    note: 'Best hummus in town',
    cuisine: ['Lebanese'],
    area: 'Al Reem Island',
    price_range: 2,
    rating: 4.6,
    google_maps: 'https://maps.google.com/?cid=111',
    website: 'https://operationfalafel.example',
    slug: 'operation-falafel',
    phone: '+97125550100',
    photos: ['https://lh3.googleusercontent.com/a', 'https://lh3.googleusercontent.com/b'],
    lat: 24.5,
    lng: 54.4,
    is_gem: false,
    is_sponsored: false,
    advertiser_name: null,
    ...overrides,
  };
}

/** A complete public restaurant (GET /api/restaurants row). */
export function restaurant(overrides: Partial<PublicRestaurant> = {}): PublicRestaurant {
  return {
    id: 'rest-1',
    name: 'Operation Falafel',
    slug: 'operation-falafel',
    cuisine: ['Lebanese'],
    area: 'Al Reem Island',
    price_range: 2,
    rating: 4.6,
    phone: '+97125550100',
    website: 'https://operationfalafel.example',
    google_maps: 'https://maps.google.com/?cid=111',
    photos: [],
    lat: null,
    lng: null,
    is_gem: false,
    hours: null,
    ...overrides,
  };
}
