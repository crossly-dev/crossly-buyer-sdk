/**
 * Errors from the Crossly Buyer API.
 *
 * The wire envelope is the same as the seller API's —
 * `{ error: { code, message, details }, correlationId }` — but the classes are
 * distinct so a host that talks to BOTH APIs can tell which one failed from
 * the error alone, rather than from whichever call it thinks it made.
 */
export interface CrosslyErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export class CrosslyBuyerAPIError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  /** Raw response body — useful for debugging unfamiliar errors. */
  readonly body?: unknown;

  constructor(status: number, payload: CrosslyErrorPayload, body?: unknown) {
    super(payload.message);
    this.name = 'CrosslyBuyerAPIError';
    this.status = status;
    this.code = payload.code;
    this.details = payload.details;
    this.body = body;
  }

  /**
   * True when the call failed because the token lacks a scope, as opposed to
   * being invalid.
   *
   * Worth branching on: the fix for a missing scope is to re-authorise with a
   * wider consent screen, which is a different action from "log in again", and
   * the buyer scopes are deliberately fine-grained enough that hitting this is
   * normal rather than exceptional.
   */
  get isMissingScope(): boolean {
    return this.status === 403 && /scope/i.test(this.code + ' ' + this.message);
  }
}

/** Thrown when the SDK is misconfigured — missing or wrong-kind token. */
export class CrosslyBuyerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrosslyBuyerConfigError';
  }
}
