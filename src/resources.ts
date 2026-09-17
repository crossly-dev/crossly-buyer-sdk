/**
 * The Buyer API, grouped by what a shopper is doing.
 *
 * In the seller SDK all of this lived on one flat `buyer` resource, because it
 * was one corner of a much larger surface. On its own it reads better split:
 * `cart.quote()` says what it does, `buyer.quoteCart()` was a workaround for
 * not having a namespace.
 *
 * NOTHING HERE SPENDS MONEY. The cart methods fill a basket and price it;
 * `offers.make` proposes a number. There is no method that completes a
 * purchase and no endpoint behind one — paying happens on Crossly, with the
 * person present. Treat that as a guarantee of the API, not an omission.
 */
import type { BuyerHttpClient } from './client.js';
import type { ActivityNamespace, CashbackFilters, JsonObject, PaginationParams } from './types.js';

export interface IdempotencyOpts {
  idempotencyKey?: string;
}

/** The buyer's own account. */
export class ProfileResource {
  constructor(private http: BuyerHttpClient) {}

  /**
   * Name, email, saved address, and Bucks balance.
   *
   * The saved address is what `cart.quote()` falls back to when pricing
   * delivery, so an empty one is the usual reason a quote comes back with
   * `taxComplete: false`.
   *
   * Requires `buyer:profile:read`.
   */
  get() {
    return this.http.request<JsonObject>({ method: 'GET', path: '/v1/buyer/profile' });
  }
}

/** What this person has bought on Crossly. */
export class OrdersResource {
  constructor(private http: BuyerHttpClient) {}

  /** Orders, newest first. Requires `buyer:orders:read`. */
  list(params: PaginationParams = {}) {
    return this.http.request<JsonObject>({
      method: 'GET',
      path: '/v1/buyer/orders',
      query: params,
    });
  }
}

/** Scout cashback. */
export class CashbackResource {
  constructor(private http: BuyerHttpClient) {}

  /**
   * Cashback rows — pending, confirmed, paid, expired.
   *
   * `meta.pendingCents` is the number people actually came for, and it counts
   * EVERY row rather than the current page: a page-scoped total answers a
   * question nobody asked and looks wrong on page two.
   *
   * Requires `buyer:cashback:read`, deliberately separate from
   * `buyer:orders:read` — an app that reads what you bought has no automatic
   * business knowing what you earned.
   */
  list(params: CashbackFilters = {}) {
    return this.http.request<JsonObject>({
      method: 'GET',
      path: '/v1/buyer/cashback',
      query: params,
    });
  }
}

/** The shopping basket. */
export class CartResource {
  constructor(private http: BuyerHttpClient) {}

  /** What is currently in the cart. Requires `buyer:cart:read`. */
  get() {
    return this.http.request<JsonObject>({ method: 'GET', path: '/v1/buyer/cart' });
  }

  /**
   * Add a listing to the cart.
   *
   * Keyed by `listingSlug` rather than an internal id: the slug is what a
   * buyer-facing integration already has from a storefront URL, and an id it
   * would have to look up first.
   *
   * Requires `buyer:cart:write`.
   */
  addItem(body: { listingSlug: string; quantity?: number }, opts: IdempotencyOpts = {}) {
    return this.http.request<JsonObject>({
      method: 'POST',
      path: '/v1/buyer/cart/items',
      body,
      idempotencyKey: opts.idempotencyKey,
    });
  }

  /** Remove one line from the cart. Requires `buyer:cart:write`. */
  removeItem(id: string) {
    return this.http.request<JsonObject>({
      method: 'DELETE',
      path: `/v1/buyer/cart/items/${encodeURIComponent(id)}`,
    });
  }

  /**
   * Price the cart, delivered.
   *
   * A read in every sense that matters, but a POST because pricing runs the
   * real checkout cascade rather than summing line items.
   *
   * Returns `{ data, meta }` — `data` is the quote, `meta.checkoutUrl` is
   * where the person finishes. `data.taxComplete === false` means there is no
   * saved delivery address, so the total is a FLOOR. Say so in your UI.
   *
   * Requires `buyer:cart:read`.
   */
  quote(opts: IdempotencyOpts = {}) {
    return this.http.request<JsonObject>({
      method: 'POST',
      path: '/v1/buyer/cart/quote',
      idempotencyKey: opts.idempotencyKey,
    });
  }
}

/** Saved lists. */
export class WishlistsResource {
  constructor(private http: BuyerHttpClient) {}

  /** The buyer's wishlists. Requires `buyer:wishlist:read`. */
  list() {
    return this.http.request<JsonObject>({ method: 'GET', path: '/v1/buyer/wishlists' });
  }

  /** What is on one wishlist. Requires `buyer:wishlist:read`. */
  items(id: string, params: PaginationParams = {}) {
    return this.http.request<JsonObject>({
      method: 'GET',
      path: `/v1/buyer/wishlists/${encodeURIComponent(id)}/items`,
      query: params,
    });
  }

  /** Create a wishlist. Requires `buyer:wishlist:write`. */
  create(body: { name: string }, opts: IdempotencyOpts = {}) {
    return this.http.request<JsonObject>({
      method: 'POST',
      path: '/v1/buyer/wishlists',
      body,
      idempotencyKey: opts.idempotencyKey,
    });
  }

  /** Add a listing to a wishlist. Requires `buyer:wishlist:write`. */
  addItem(id: string, body: { listingSlug: string }, opts: IdempotencyOpts = {}) {
    return this.http.request<JsonObject>({
      method: 'POST',
      path: `/v1/buyer/wishlists/${encodeURIComponent(id)}/items`,
      body,
      idempotencyKey: opts.idempotencyKey,
    });
  }
}

/** Negotiation. */
export class OffersResource {
  constructor(private http: BuyerHttpClient) {}

  /**
   * Offer a price on a listing.
   *
   * Spends nothing: a seller accepting leaves the buyer to complete checkout
   * themselves. The server refuses an offer at or above the asking price — at
   * that point it is a purchase, not a negotiation — and refuses one on your
   * own listing.
   *
   * Pass an idempotency key, and understand what it means here: a retried
   * offer WITHOUT one is a second offer to the seller, not a duplicate no-op.
   *
   * Requires `buyer:offers:write`.
   */
  make(
    body: { listingSlug: string; amountCents: number; message?: string },
    opts: IdempotencyOpts = {},
  ) {
    return this.http.request<JsonObject>({
      method: 'POST',
      path: '/v1/buyer/offers',
      body,
      idempotencyKey: opts.idempotencyKey,
    });
  }
}

/**
 * Comparison shopping signal, and what Crossly derives from it.
 *
 * Consent-gated and deliberately narrow. See `report` for the exact sentence
 * the consent screen shows, and note that the request shape ENFORCES it —
 * there is no field for a page URL.
 */
export class ActivityResource {
  constructor(private http: BuyerHttpClient) {}

  /**
   * Tell Crossly what your user is looking at, and get our answer back.
   *
   * Requires `buyer:activity:write`, which reads on the consent screen as
   * "remember the items you compare while shopping: the product identifier,
   * the store domain and its price. Never the page address or its contents."
   *
   * The shape enforces that sentence: there is no field for a URL, and
   * `retailHost` is REFUSED rather than quietly trimmed if you send one. Pass
   * `target.com`, not `https://target.com/p/123`.
   *
   * Returns the same comparison the Scout extension renders, so an integration
   * gets the answer and contributes the signal in one call.
   */
  report(
    body: {
      namespace: ActivityNamespace;
      value: string;
      /** Bare domain, e.g. `target.com`. A full URL is a 400, by design. */
      retailHost?: string;
      pagePriceCents?: number;
      pageCurrency?: string;
    },
    opts: IdempotencyOpts = {},
  ) {
    return this.http.request<JsonObject>({
      method: 'POST',
      path: '/v1/buyer/activity',
      body,
      idempotencyKey: opts.idempotencyKey,
    });
  }

  /** What this buyer has compared lately. Requires `buyer:activity:read`. */
  list() {
    return this.http.request<JsonObject>({ method: 'GET', path: '/v1/buyer/activity' });
  }

  /**
   * The shopping profile derived from that activity.
   *
   * Derived, never declared — there is no preferences form anywhere, because
   * people are bad at describing what they buy and worse at maintaining a
   * profile they filled in once.
   *
   * `matchRate` is the share of this person's searches Crossly could answer. A
   * low number is an inventory problem rather than a personalisation one,
   * which is why it sits in the same object.
   *
   * Requires `buyer:activity:read`.
   */
  preferences() {
    return this.http.request<JsonObject>({ method: 'GET', path: '/v1/buyer/preferences' });
  }
}
