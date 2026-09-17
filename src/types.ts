/**
 * Response shapes for the Buyer API.
 *
 * ── A HONEST NOTE ON TYPING ──────────────────────────────────────────
 * The interfaces below describe what the endpoints return, but methods are
 * typed `JsonObject` rather than these shapes. That is deliberate and
 * temporary: the v1 routes do not yet declare response schemas, so the server
 * is the only source of truth and a confidently-typed return here would be an
 * assertion nobody checked. Declaring them as documentation you can read, and
 * cast to when you have verified the shape yourself, is the honest middle.
 *
 * These become the real return types once the API declares its responses.
 */

/** Any JSON object returned by the API. */
export type JsonObject = Record<string, unknown>;

export interface PaginationParams {
  page?: number;
  limit?: number;
}

/** Standard list envelope: `{ data, meta }`. */
export interface ListEnvelope<T> {
  data: T[];
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    [k: string]: unknown;
  };
}

export interface BuyerProfile {
  name: string | null;
  email: string | null;
  /** Saved shipping address, when the buyer has set one. */
  address: Record<string, unknown> | null;
  /** Store credit, in cents. */
  bucksBalanceCents: number;
}

export interface BuyerCartLine {
  id: string;
  listingSlug: string;
  title: string;
  quantity: number;
  unitPriceCents: number;
  imageUrl: string | null;
}

/**
 * A priced cart.
 *
 * `totalCents` is a FLOOR, not a final figure: shipping and tax depend on a
 * delivery address, and the quote falls back to the buyer's saved address when
 * one exists. Check `taxComplete` before presenting it as the amount that will
 * be charged — a confident number that grows at the till is how a checkout
 * loses someone.
 */
export interface BuyerCartQuote {
  itemCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  /** False when no delivery address is known, making `totalCents` a floor. */
  taxComplete?: boolean;
}

export interface BuyerWishlist {
  id: string;
  name: string;
  shareToken: string | null;
}

/**
 * Identifier namespaces the activity endpoint accepts.
 *
 * Note `lego_set`, not `set_code` — the latter is a different field on a
 * different system and silently matches nothing here.
 */
export type ActivityNamespace =
  | 'gtin'
  | 'style_code'
  | 'lego_set'
  | 'tcgplayer'
  | 'discogs'
  | 'asin';

export interface CashbackFilters extends PaginationParams {
  status?: 'pending' | 'confirmed' | 'paid' | 'expired';
}
