/**
 * The buyer scope vocabulary.
 *
 * Fine-grained on purpose. An app that reads what you bought has no automatic
 * business knowing what you earned in cashback, and one that fills a cart has
 * no business reading your comparison history — so those are separate grants
 * rather than one `buyer` scope, and a consent screen can say honestly what it
 * is asking for.
 *
 * Exported so an integration can request exactly what it needs and so tooling
 * can check a token before making a call that was always going to 403.
 */
export const BUYER_SCOPES = [
  'buyer:profile:read',
  'buyer:orders:read',
  'buyer:cart:read',
  'buyer:cart:write',
  'buyer:wishlist:read',
  'buyer:wishlist:write',
  'buyer:offers:write',
  'buyer:cashback:read',
  'buyer:cashback:write',
  'buyer:activity:read',
  'buyer:activity:write',
] as const;

export type BuyerScope = (typeof BUYER_SCOPES)[number];

/**
 * Which scope each method needs, so a caller can fail fast on its own token
 * rather than discovering the gap one API call at a time.
 */
export const SCOPE_BY_METHOD: Record<string, BuyerScope> = {
  'profile.get': 'buyer:profile:read',
  'orders.list': 'buyer:orders:read',
  'cart.get': 'buyer:cart:read',
  'cart.addItem': 'buyer:cart:write',
  'cart.removeItem': 'buyer:cart:write',
  'cart.quote': 'buyer:cart:read',
  'wishlists.list': 'buyer:wishlist:read',
  'wishlists.items': 'buyer:wishlist:read',
  'wishlists.create': 'buyer:wishlist:write',
  'wishlists.addItem': 'buyer:wishlist:write',
  'offers.make': 'buyer:offers:write',
  'cashback.list': 'buyer:cashback:read',
  'activity.report': 'buyer:activity:write',
  'activity.list': 'buyer:activity:read',
  'activity.preferences': 'buyer:activity:read',
};
