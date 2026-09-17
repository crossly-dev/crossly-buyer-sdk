/**
 * @crossly/buyer-sdk — the Crossly Buyer API, in TypeScript.
 *
 * ── THIS IS NOT THE SELLER SDK WITH FEWER METHODS ────────────────────
 * Crossly exposes two APIs over one hostname. `@crossly/sdk` manages a
 * seller's store: listings, crossposting, orders to fulfil, analytics. This
 * one acts on a person's own shopping: what they bought, what is in their
 * cart, what they are watching.
 *
 * They authenticate DIFFERENT PRINCIPALS. A seller Personal Access Token does
 * not work here and a buyer OAuth token does not work there, even for the same
 * human with one Crossly account. That is the design — a token minted from an
 * emailed shopping link can authorise an app to read its own orders and can
 * never authorise one to touch a store.
 *
 * If you are building a store integration, you want `@crossly/sdk`.
 *
 *   import { createBuyerClient } from '@crossly/buyer-sdk';
 *
 *   const crossly = createBuyerClient({ token: process.env.CROSSLY_BUYER_TOKEN! });
 *
 *   const cart = await crossly.cart.get();
 *   const quote = await crossly.cart.quote();
 *   await crossly.offers.make({ listingSlug: 'vintage-levis-501', amountCents: 4500 });
 */
import { BuyerHttpClient, type BuyerClientConfig } from './client.js';
import {
  ActivityResource,
  CartResource,
  CashbackResource,
  OffersResource,
  OrdersResource,
  ProfileResource,
  WishlistsResource,
} from './resources.js';

export { CrosslyBuyerAPIError, CrosslyBuyerConfigError } from './errors.js';
export type { CrosslyErrorPayload } from './errors.js';
export { BUYER_TOKEN_PREFIX } from './client.js';
export type { BuyerClientConfig, RequestOptions } from './client.js';
export { BUYER_SCOPES, SCOPE_BY_METHOD } from './scopes.js';
export type { BuyerScope } from './scopes.js';
export type {
  ActivityNamespace,
  BuyerCartLine,
  BuyerCartQuote,
  BuyerProfile,
  BuyerWishlist,
  CashbackFilters,
  JsonObject,
  ListEnvelope,
  PaginationParams,
} from './types.js';
export type { IdempotencyOpts } from './resources.js';

/** A configured Buyer API client. */
export interface CrosslyBuyerClient {
  /** Name, email, saved address, Bucks balance. */
  profile: ProfileResource;
  /** What this person has bought. */
  orders: OrdersResource;
  /** The shopping basket — fill it, price it. Never charges. */
  cart: CartResource;
  /** Saved lists. */
  wishlists: WishlistsResource;
  /** Propose a price. Spends nothing. */
  offers: OffersResource;
  /** Scout cashback. */
  cashback: CashbackResource;
  /** Comparison signal in, derived shopping profile out. Consent-gated. */
  activity: ActivityResource;
  /** Escape hatch for endpoints this version does not wrap yet. */
  http: BuyerHttpClient;
}

/**
 * Create a Buyer API client.
 *
 * Throws `CrosslyBuyerConfigError` immediately — before any request — if the
 * token is missing or is a seller PAT. Failing at construction rather than on
 * the first call means the mistake is reported where it was made.
 */
export function createBuyerClient(config: BuyerClientConfig): CrosslyBuyerClient {
  const http = new BuyerHttpClient(config);
  return {
    profile: new ProfileResource(http),
    orders: new OrdersResource(http),
    cart: new CartResource(http),
    wishlists: new WishlistsResource(http),
    offers: new OffersResource(http),
    cashback: new CashbackResource(http),
    activity: new ActivityResource(http),
    http,
  };
}
