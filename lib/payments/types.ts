/**
 * The payment-gateway seam.
 *
 * Everything around the processor is already built: fees accrue onto billing_events when a job
 * completes, the 1st-of-month cron flips them to invoiced, and the 5th-of-month cron is live and
 * has been returning 501 on every run because there is nothing to charge with. This interface is
 * that missing piece, defined so the charge path can be written, reviewed and TESTED before any
 * Braintree credential exists, and so swapping processor is a new file rather than a rewrite.
 *
 * Deliberate constraints, because this is money:
 *
 *  - We never see a card or a bank number. The provider tokenizes at the gateway and we store only
 *    the resulting vault token plus the harmless descriptors (brand, last 4, expiry).
 *  - Every charge carries an `idempotencyKey`. The cron can be re-run, retried by the platform, or
 *    fired manually alongside its schedule, and a provider must never be charged twice for the
 *    same billing event. Gateways that support it should pass this through; ones that don't must
 *    emulate it by looking for an existing transaction with that key before charging.
 *  - A charge result is a value, never an exception, so one provider's declined card cannot abort
 *    the run for everyone behind them in the loop.
 */

export type GatewayName = 'braintree' | 'mock';

/** A payment instrument held at the gateway. `token` is the vault reference, not card data. */
export type VaultedMethod = {
  token: string;
  methodType: 'card' | 'ach';
  cardBrand?: string | null;
  last4?: string | null;
  expMonth?: number | null;
  expYear?: number | null;
  bankName?: string | null;
};

export type ChargeRequest = {
  /** The gateway's customer record for this provider account. */
  customerId: string;
  /** Vault token of the instrument to charge. */
  token: string;
  amountCents: number;
  /** Stable per-charge key. Same key must never charge twice. */
  idempotencyKey: string;
  /** Shown on the provider's statement where the gateway supports it. */
  description?: string;
};

export type ChargeResult =
  | { ok: true; transactionId: string; amountCents: number }
  /**
   * `retryable` separates "this card was declined, a human needs to fix it" from "the gateway was
   * briefly unreachable". The first should surface to an admin; the second should just be retried
   * on the next run rather than marked as a failure against the provider.
   */
  | { ok: false; retryable: boolean; code?: string; message: string };

export interface PaymentGateway {
  readonly name: GatewayName;

  /** Create (or return) the gateway-side customer for a provider account. */
  ensureCustomer(args: { accountId: string; email?: string | null; companyName?: string | null }): Promise<string>;

  /**
   * Exchange a client-side payment nonce for a stored vault token. The nonce is single-use and
   * comes from the provider's own browser, so a card never touches our servers.
   */
  vaultFromNonce(args: { customerId: string; nonce: string; makeDefault?: boolean }): Promise<VaultedMethod>;

  charge(req: ChargeRequest): Promise<ChargeResult>;

  /** Remove an instrument from the vault. Best-effort; a failure here is not fatal. */
  removeMethod(token: string): Promise<void>;
}
