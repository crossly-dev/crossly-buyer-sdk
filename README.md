# @crossly/buyer-sdk

Official TypeScript SDK for the **Crossly Buyer API** — a shopper's cart, orders, wishlists, offers and cashback.

> **Not on npm yet.** `@crossly/buyer-sdk` is unreleased — the install command below
> will 404 until the first publish. To try it now, clone this repo and build from
> source. Star or watch to hear when it lands.

```bash
npm install @crossly/buyer-sdk
```

## This is not the seller SDK

Crossly exposes **two APIs** over one hostname, and they authenticate **different principals**:

| | [`@crossly/sdk`](https://github.com/crossly-dev/crossly-sdk) | `@crossly/buyer-sdk` |
|---|---|---|
| acts on | a seller's **store** | a person's **own shopping** |
| token | `crossly_pat_…` or seller `crossly_oat_…` | buyer `crossly_oat_…` |
| scopes | `<domain>:<read\|write>` | `buyer:*` |
| examples | listings, crossposting, fulfilment | cart, orders, wishlists, offers |

A seller Personal Access Token **will not work here**, even for the same human with one Crossly account. That is the design: a token minted from an emailed shopping link can authorise an app to read its own orders and can never authorise one to touch a store.

The client refuses a seller PAT at construction with a message that says so, rather than letting it surface as an unexplained 401.

## Quick start

```ts
import { createBuyerClient } from '@crossly/buyer-sdk';

const crossly = createBuyerClient({ token: process.env.CROSSLY_BUYER_TOKEN! });

const cart = await crossly.cart.get();
const quote = await crossly.cart.quote();

await crossly.offers.make({
  listingSlug: 'vintage-levis-501',
  amountCents: 4500,
}, { idempotencyKey: crypto.randomUUID() });
```

## Nothing here spends money

`cart.quote()` prices a basket. `offers.make()` proposes a number. There is **no method that completes a purchase and no endpoint behind one** — paying happens on Crossly, with the person present. Treat that as a guarantee of the API rather than a gap, and never tell a user you have bought something for them.

## Resources

| namespace | methods |
|---|---|
| `profile` | `get` |
| `orders` | `list` |
| `cart` | `get`, `addItem`, `removeItem`, `quote` |
| `wishlists` | `list`, `items`, `create`, `addItem` |
| `offers` | `make` |
| `cashback` | `list` |
| `activity` | `report`, `list`, `preferences` |

`client.http` is the escape hatch for anything not wrapped yet.

## Money is always in cents

Every amount this API returns is an integer number of cents — `amountCents`, `totalCents`, `bucksBalanceCents`. There are no float dollars anywhere. Divide by 100 at the edge, not in the middle.

## Cart quotes are a floor, not a total

`cart.quote()` returns `taxComplete`. When it is `false` there is no saved delivery address, so shipping and tax are incomplete and `totalCents` is a **floor**. Say so in your UI — a confident number that grows at the till is how a checkout loses someone.

## Scopes

Fine-grained on purpose. An app that reads what you bought has no automatic business knowing what you earned:

```
buyer:profile:read    buyer:orders:read
buyer:cart:read       buyer:cart:write
buyer:wishlist:read   buyer:wishlist:write
buyer:offers:write    buyer:cashback:read    buyer:cashback:write
buyer:activity:read   buyer:activity:write
```

Exported as `BUYER_SCOPES`. A 403 whose message mentions a scope means re-consent, not re-login — `err.isMissingScope` distinguishes them.

## Activity is consent-gated and deliberately narrow

`activity.report()` requires `buyer:activity:write`, which reads on the consent screen as:

> remember the items you compare while shopping: the product identifier, the store domain and its price. Never the page address or its contents.

The request shape **enforces that sentence**. There is no field for a URL, and `retailHost` is refused rather than quietly trimmed if you send one. Pass `target.com`, not `https://target.com/p/123`.

## Errors

```ts
import { CrosslyBuyerAPIError } from '@crossly/buyer-sdk';

try {
  await crossly.cashback.list();
} catch (err) {
  if (err instanceof CrosslyBuyerAPIError) {
    if (err.isMissingScope) { /* send them back through consent */ }
    console.error(err.status, err.code, err.message);
  }
}
```

## Also available

- [`@crossly/buyer-mcp`](https://github.com/crossly-dev/crossly-buyer-mcp) — the same surface as MCP tools, for AI agents
- [`@crossly/buyer-cli`](https://github.com/crossly-dev/crossly-buyer-cli) — `crossly-buyer` on the command line

## License

MIT
