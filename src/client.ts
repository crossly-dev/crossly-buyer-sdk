/**
 * HTTP transport for the Crossly Buyer API.
 *
 * ── WHY THIS IS NOT IMPORTED FROM @crossly/sdk ───────────────────────
 * It is close to the seller SDK's transport and deliberately duplicated. The
 * seller SDK's headline property is ZERO runtime dependencies; a buyer SDK
 * that pulled the entire seller client in to borrow ~150 lines of fetch
 * plumbing would ship a shopper's app every store-management type in the
 * catalogue, and would tie the two release cycles together for no benefit.
 * Two small independent packages beat one shared one here.
 *
 * ── THE TOKEN IS A DIFFERENT PRINCIPAL, NOT A SMALLER ONE ────────────
 * A seller PAT does not authenticate these endpoints and a buyer token does
 * not authenticate a seller's. They are separate identities that happen to
 * share a user row. The client says so on the failure path rather than letting
 * it surface as an unexplained 401 twenty lines later.
 */
import { CrosslyBuyerAPIError, CrosslyBuyerConfigError, type CrosslyErrorPayload } from './errors.js';

/**
 * Buyer tokens are OAuth-issued. There is no buyer equivalent of a personal
 * access token: a shopper authorises an app through the consent screen, and
 * the grant is what carries the `buyer:*` scopes.
 */
export const BUYER_TOKEN_PREFIX = 'crossly_oat_';

/** The seller prefix — recognised ONLY so the error can name the mistake. */
const SELLER_TOKEN_PREFIX = 'crossly_pat_';

export interface BuyerClientConfig {
  /**
   * A buyer OAuth token (`crossly_oat_…`), carrying `buyer:*` scopes.
   *
   * Obtained by sending a shopper through the Crossly OAuth consent screen.
   * A seller Personal Access Token will NOT work here — different principal.
   */
  token: string;
  /** Override the API base — default: https://crossly.net/api */
  baseUrl?: string;
  /** Inject a fetch impl. Useful for tests, Cloudflare Workers, or older Node. */
  fetch?: typeof fetch;
  /** Default request timeout in ms. Default 30_000. */
  timeoutMs?: number;
  /** Custom User-Agent appended after the SDK identifier. */
  userAgent?: string;
}

export type QueryParams = object;

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: QueryParams;
  body?: unknown;
  idempotencyKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_BASE_URL = 'https://crossly.net/api';
const SDK_VERSION = '0.1.0';

export class BuyerHttpClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultTimeoutMs: number;
  private readonly userAgent: string;

  constructor(config: BuyerClientConfig) {
    if (!config.token) {
      throw new CrosslyBuyerConfigError(
        'A buyer OAuth token is required. Send the shopper through the Crossly ' +
          'consent screen to obtain one — see https://crossly.net/docs/buyer-oauth.',
      );
    }

    // Naming the specific mistake, because this is the one people will make.
    // A seller PAT is the token a developer already has in their shell, and
    // silently forwarding it produces a 401 from a completely different
    // subsystem with no hint that the token KIND was wrong.
    if (config.token.startsWith(SELLER_TOKEN_PREFIX)) {
      throw new CrosslyBuyerConfigError(
        'That is a seller Personal Access Token (crossly_pat_…). The Buyer API is a ' +
          'separate principal and will reject it. You need a buyer OAuth token ' +
          '(crossly_oat_…) carrying buyer:* scopes. If you meant to manage a store, ' +
          'use @crossly/sdk instead.',
      );
    }

    if (!config.token.startsWith(BUYER_TOKEN_PREFIX)) {
      throw new CrosslyBuyerConfigError(
        `A buyer token starting with "${BUYER_TOKEN_PREFIX}" is required; got one starting ` +
          `"${config.token.slice(0, 8)}…".`,
      );
    }

    this.token = config.token;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = config.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) {
      throw new CrosslyBuyerConfigError(
        'No global fetch found. Pass a `fetch` impl in createBuyerClient({ fetch }), or run on Node 18+.',
      );
    }
    this.defaultTimeoutMs = config.timeoutMs ?? 30_000;
    this.userAgent = `crossly-buyer-sdk/${SDK_VERSION}${config.userAgent ? ` ${config.userAgent}` : ''}`;
  }

  async request<T>(opts: RequestOptions): Promise<T> {
    const url = new URL(this.baseUrl + opts.path);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query as Record<string, unknown>)) {
        if (v === undefined || v === null || v === '') continue;
        if (Array.isArray(v)) {
          for (const item of v) url.searchParams.append(k, String(item));
        } else {
          url.searchParams.set(k, String(v));
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
      'User-Agent': this.userAgent,
    };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

    const ctrl = new AbortController();
    const timeoutMs = opts.timeoutMs ?? this.defaultTimeoutMs;
    const timer = setTimeout(
      () => ctrl.abort(new Error(`Request timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    if (opts.signal) {
      if (opts.signal.aborted) ctrl.abort(opts.signal.reason);
      else opts.signal.addEventListener('abort', () => ctrl.abort(opts.signal!.reason), { once: true });
    }

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: opts.method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 204) return undefined as T;

    const text = await res.text();
    let parsed: unknown = undefined;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      const envelope =
        parsed && typeof parsed === 'object'
          ? (parsed as { error?: Partial<CrosslyErrorPayload> }).error
          : undefined;
      throw new CrosslyBuyerAPIError(
        res.status,
        {
          code: envelope?.code ?? `http_${res.status}`,
          message: envelope?.message ?? res.statusText ?? 'Request failed',
          details: envelope?.details,
        },
        parsed,
      );
    }

    return parsed as T;
  }
}
