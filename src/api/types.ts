/**
 * Types matching the website's public API so the app
 * speaks exactly the shapes the live API returns. Keep in sync by hand.
 */

export type DiscoveryQuestionRole = 'primary' | 'refiner';

export interface DiscoveryOption {
  id: string;
  question_id: string;
  value: string;
  label: string;
  sort_order: number;
  filter_field: 'cuisine' | 'price_range' | 'area' | null;
  filter_value: string | null;
  is_active: boolean;
  next_question_id: string | null;
  created_at: string;
  updated_at?: string;
}

export interface DiscoveryQuestion {
  id: string;
  key: string;
  label: string;
  step_order: number;
  role: DiscoveryQuestionRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryQuestionWithOptions extends DiscoveryQuestion {
  options: DiscoveryOption[];
}

/** { [question.key]: option.value } */
export type Selections = Record<string, string>;

export interface ResultCard {
  restaurant_name: string;
  restaurant_id: string | null;
  note: string | null;
  cuisine: string[];
  area: string | null;
  price_range: number | null;
  rating: number | null;
  google_maps: string | null;
  website: string | null;
  slug?: string | null;
  phone?: string | null;
  photos?: string[] | null;
  lat?: number | null;
  lng?: number | null;
  is_gem?: boolean;
  is_sponsored?: boolean;
  advertiser_name?: string | null;
  /** Curated @abudhabifoodies post/Reel for this restaurant; optional until the site API sends it. */
  instagram_url?: string | null;
}

/**
 * The whole guided flow answered in advance (GET /api/discovery/snapshot,
 * built on the site by src/lib/discovery/snapshot.ts). The app answers every
 * question from it on the phone; nothing in the flow waits on the network.
 */
export interface DiscoverySnapshot {
  version: number;
  generated_at: string;
  questions: DiscoveryQuestionWithOptions[];
  /** availabilityKey(question, answers) -> option values to show. Missing = show all. */
  availability: Record<string, string[]>;
  /** selectionsKey(answers) -> pick ids. Show one random editorial, then one random sponsored. */
  results: Record<string, { editorial: string[]; sponsored: string[] }>;
  /** pick id -> card */
  cards: Record<string, ResultCard>;
  no_match_note: string;
}

export interface PublicRestaurant {
  id: string;
  name: string;
  slug: string;
  cuisine: string[] | null;
  area: string | null;
  price_range: number | null;
  rating: number | null;
  phone: string | null;
  website: string | null;
  google_maps: string | null;
  photos: string[];
  lat: number | null;
  lng: number | null;
  is_gem: boolean;
  /** { day_0: "Monday: 9:00 AM – 11:00 PM", … day_6 } */
  hours: Record<string, string> | null;
}

export type FlowEventType = 'started' | 'question_seen';

export type Availability = { gated: false } | { gated: true; available: string[] };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string };
