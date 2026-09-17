/**
 * The transport and the token guard.
 *
 * The guard gets the most attention because it is the mistake this package
 * exists to make impossible: a developer who already has a seller PAT in their
 * shell will try it here first. Without a check that produces a 401 from a
 * completely unrelated subsystem, with nothing pointing at the token KIND
 * being wrong.
 */
import { describe, it, expect, vi } from 'vitest';
import { createBuyerClient } from '../index.js';
import { CrosslyBuyerAPIError, CrosslyBuyerConfigError } from '../errors.js';

const TOKEN = 'crossly_oat_test';

/** A fetch stub that records the request and returns `body`. */
function stubFetch(body: unknown, init: { status?: number } = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = vi.fn(async (url: URL | string, reqInit: RequestInit) => {
    calls.push({ url: String(url), init: reqInit });
    return new Response(body === undefined ? '' : JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('token guard', () => {
  it('names the mistake when handed a seller PAT', () => {
    // The whole point. A generic "invalid token" would send someone hunting
    // for a typo in a token that is perfectly valid — just for the other API.
    expect(() => createBuyerClient({ token: 'crossly_pat_test' })).toThrow(
      CrosslyBuyerConfigError,
    );
    try {
      createBuyerClient({ token: 'crossly_pat_test' });
    } catch (err) {
      expect((err as Error).message).toMatch(/seller Personal Access Token/);
      expect((err as Error).message).toMatch(/@crossly\/sdk/);
    }
  });

  it('rejects an empty token', () => {
    expect(() => createBuyerClient({ token: '' })).toThrow(CrosslyBuyerConfigError);
  });

  it('rejects an unrecognised prefix without echoing the whole token', () => {
    try {
      createBuyerClient({ token: 'someone-elses-secret-value' });
      throw new Error('should have thrown');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toMatch(/crossly_oat_/);
      // A thrown config error can end up in a log. It must not carry the
      // whole credential with it — only enough of a prefix to identify it.
      expect(msg).not.toContain('secret-value');
    }
  });

  it('accepts a buyer OAuth token', () => {
    expect(() => createBuyerClient({ token: TOKEN, fetch: stubFetch({}).impl })).not.toThrow();
  });
});

describe('request shaping', () => {
  it('sends the token as a bearer and identifies itself', async () => {
    const { impl, calls } = stubFetch({ data: {} });
    const c = createBuyerClient({ token: TOKEN, fetch: impl });
    await c.profile.get();

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers['User-Agent']).toMatch(/^crossly-buyer-sdk\//);
  });

  it('hits the buyer paths, not the seller ones', async () => {
    const { impl, calls } = stubFetch({ data: {} });
    const c = createBuyerClient({ token: TOKEN, fetch: impl });

    await c.cart.get();
    await c.orders.list();
    await c.wishlists.list();

    for (const call of calls) expect(call.url).toContain('/v1/buyer/');
  });

  it('drops empty query params instead of sending blanks', async () => {
    // `?status=` is not the same request as omitting it, and an SDK that
    // forwards an empty string makes the caller's optional filter mandatory.
    const { impl, calls } = stubFetch({ data: [] });
    const c = createBuyerClient({ token: TOKEN, fetch: impl });
    await c.cashback.list({ status: undefined, page: 2 });

    expect(calls[0]!.url).toContain('page=2');
    expect(calls[0]!.url).not.toContain('status=');
  });

  it('forwards an idempotency key when given one', async () => {
    const { impl, calls } = stubFetch({ data: {} });
    const c = createBuyerClient({ token: TOKEN, fetch: impl });
    await c.offers.make(
      { listingSlug: 'x', amountCents: 100 },
      { idempotencyKey: 'key-1' },
    );

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('key-1');
  });

  it('does NOT invent an idempotency key when none is given', async () => {
    // Deliberate: a retried offer without a key is a SECOND offer to the
    // seller. Auto-generating one here would silently change that semantic
    // and hide a real decision from the caller.
    const { impl, calls } = stubFetch({ data: {} });
    const c = createBuyerClient({ token: TOKEN, fetch: impl });
    await c.offers.make({ listingSlug: 'x', amountCents: 100 });

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBeUndefined();
  });
});

describe('errors', () => {
  it('unwraps the API error envelope', async () => {
    const { impl } = stubFetch(
      { error: { code: 'listing_not_found', message: 'No such listing' } },
      { status: 404 },
    );
    const c = createBuyerClient({ token: TOKEN, fetch: impl });

    await expect(c.cart.get()).rejects.toThrowError(CrosslyBuyerAPIError);
    await expect(c.cart.get()).rejects.toMatchObject({
      status: 404,
      code: 'listing_not_found',
    });
  });

  it('flags a missing scope distinctly from a bad token', async () => {
    // Different remedies: re-authorise with a wider consent screen vs log in
    // again. Collapsing them sends people to the wrong fix.
    const { impl } = stubFetch(
      { error: { code: 'insufficient_scope', message: 'Requires buyer:cashback:read' } },
      { status: 403 },
    );
    const c = createBuyerClient({ token: TOKEN, fetch: impl });

    try {
      await c.cashback.list();
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as CrosslyBuyerAPIError).isMissingScope).toBe(true);
    }
  });

  it('still throws a typed error when the body is not JSON', async () => {
    const impl = vi.fn(async () => new Response('<html>502</html>', { status: 502 })) as unknown as typeof fetch;
    const c = createBuyerClient({ token: TOKEN, fetch: impl });

    await expect(c.cart.get()).rejects.toMatchObject({ status: 502, code: 'http_502' });
  });
});

describe('surface', () => {
  it('exposes no method that completes a purchase', () => {
    // A guarantee worth enforcing: this SDK prices carts and proposes offers,
    // it never charges. If someone adds a `checkout()` here, that decision
    // should be made deliberately and not slip in during a refactor.
    const c = createBuyerClient({ token: TOKEN, fetch: stubFetch({}).impl });
    const names = Object.values(c).flatMap((resource) =>
      typeof resource === 'object' && resource
        ? Object.getOwnPropertyNames(Object.getPrototypeOf(resource))
        : [],
    );
    for (const forbidden of ['checkout', 'pay', 'purchase', 'buy', 'charge']) {
      expect(names).not.toContain(forbidden);
    }
  });
});
