import type { ChargeRequest, ChargeResult, PaymentGateway, VaultedMethod } from './types';

/**
 * Braintree adapter.
 *
 * Every call here was verified against the sandbox before it was written: creating a customer,
 * vaulting from a nonce, a sale, finding that sale again by orderId, and a processor decline.
 *
 * Two things are worth knowing about this gateway specifically:
 *
 * 1. Braintree has no native idempotency key on a sale. We emulate one with `orderId`: before
 *    charging we search for an existing transaction carrying that key and return it if found.
 *    That closes the case this actually has to survive — a monthly cron that gets re-run or
 *    retried. It does NOT close a true simultaneous double-fire, where two charges could both
 *    search before either writes. The unique index on billing_events.gateway_transaction_id is
 *    the second line of defence there, turning a duplicate into a loud failure.
 *
 * 2. Braintree reports a decline as a RESULT (`success: false` with a transaction), not an
 *    exception. Exceptions here mean the gateway was unreachable. So a decline is not retryable
 *    and a thrown error is, which is the distinction the charge loop acts on.
 *
 * The SDK is required lazily so this module can never drag a Node-only package into a client
 * bundle if something imports the payments barrel from the browser.
 */

type BraintreeGatewayLike = {
  customer: {
    create(args: Record<string, unknown>): Promise<{ success: boolean; customer?: { id: string }; message?: string }>;
    find(id: string): Promise<{ id: string }>;
  };
  paymentMethod: {
    create(args: Record<string, unknown>): Promise<{
      success: boolean;
      message?: string;
      paymentMethod?: Record<string, unknown>;
    }>;
    delete(token: string): Promise<unknown>;
  };
  transaction: {
    sale(args: Record<string, unknown>): Promise<{
      success: boolean;
      message?: string;
      transaction?: { id: string; status: string; processorResponseCode?: string; amount?: string };
      errors?: { deepErrors(): { code: string; message: string }[] };
    }>;
    search(fn: (s: { orderId(): { is(v: string): void } }) => void): NodeJS.EventEmitter;
  };
};

function makeGateway(): BraintreeGatewayLike {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const braintree = require('braintree');
  const environment =
    (process.env.BRAINTREE_ENVIRONMENT || 'sandbox').toLowerCase() === 'production'
      ? braintree.Environment.Production
      : braintree.Environment.Sandbox;
  return new braintree.BraintreeGateway({
    environment,
    merchantId: process.env.BRAINTREE_MERCHANT_ID,
    publicKey: process.env.BRAINTREE_PUBLIC_KEY,
    privateKey: process.env.BRAINTREE_PRIVATE_KEY,
  });
}

/** Braintree takes decimal strings, not cents. 1234 -> "12.34". */
function toAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

function describeMethod(pm: Record<string, unknown>): VaultedMethod {
  const token = String(pm.token);
  // A vaulted US bank account carries routingNumber/accountType; a card carries cardType.
  const isAch = Boolean(pm.routingNumber || pm.accountType || pm.bankName);
  return {
    token,
    methodType: isAch ? 'ach' : 'card',
    cardBrand: (pm.cardType as string) ?? null,
    last4: (pm.last4 as string) ?? null,
    expMonth: pm.expirationMonth ? Number(pm.expirationMonth) : null,
    expYear: pm.expirationYear ? Number(pm.expirationYear) : null,
    bankName: (pm.bankName as string) ?? null,
  };
}

/**
 * Braintree transaction statuses that mean the money was (or is being) collected. Anything else,
 * processor_declined, gateway_rejected, failed, voided, settlement_declined, authorization_expired,
 * is a charge that did not happen and must not count as one.
 */
const SUCCESSFUL_STATUSES = new Set([
  'authorizing',
  'authorized',
  'submitted_for_settlement',
  'settling',
  'settlement_pending',
  'settlement_confirmed',
  'settled',
]);

export class BraintreeGatewayAdapter implements PaymentGateway {
  readonly name = 'braintree' as const;
  private gw: BraintreeGatewayLike | null = null;

  private client(): BraintreeGatewayLike {
    if (!this.gw) this.gw = makeGateway();
    return this.gw;
  }

  async ensureCustomer(args: {
    accountId: string;
    email?: string | null;
    companyName?: string | null;
  }): Promise<string> {
    const gw = this.client();
    // The provider account id IS the Braintree customer id. That makes the mapping obvious from
    // either side and means a lost gateway_customer_id can always be recovered.
    try {
      const existing = await gw.customer.find(args.accountId);
      if (existing?.id) return existing.id;
    } catch {
      // not found — fall through and create
    }
    const res = await gw.customer.create({
      id: args.accountId,
      email: args.email || undefined,
      company: args.companyName || undefined,
    });
    if (!res.success || !res.customer) {
      throw new Error(`braintree: could not create customer (${res.message || 'unknown error'})`);
    }
    return res.customer.id;
  }

  async vaultFromNonce(args: {
    customerId: string;
    nonce: string;
    makeDefault?: boolean;
  }): Promise<VaultedMethod> {
    const res = await this.client().paymentMethod.create({
      customerId: args.customerId,
      paymentMethodNonce: args.nonce,
      options: { makeDefault: args.makeDefault ?? true, verifyCard: true },
    });
    if (!res.success || !res.paymentMethod) {
      throw new Error(`braintree: could not save that payment method (${res.message || 'unknown error'})`);
    }
    return describeMethod(res.paymentMethod);
  }

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    const gw = this.client();

    // Idempotency, emulated (see the note at the top).
    try {
      const prior = await this.findByOrderId(req.idempotencyKey);
      if (prior) return { ok: true, transactionId: prior.id, amountCents: req.amountCents };
    } catch (e) {
      // A failed search must not block the charge, but it does remove our duplicate protection
      // for this attempt, so say so rather than proceeding quietly.
      console.warn('braintree: idempotency search failed, charging anyway', (e as Error).message);
    }

    let res: Awaited<ReturnType<BraintreeGatewayLike['transaction']['sale']>>;
    try {
      res = await gw.transaction.sale({
        amount: toAmount(req.amountCents),
        paymentMethodToken: req.token,
        customerId: req.customerId,
        orderId: req.idempotencyKey,
        options: { submitForSettlement: true },
      });
    } catch (e) {
      // Thrown = the gateway was unreachable, not a decision about the card.
      return { ok: false, retryable: true, code: 'gateway_unreachable', message: (e as Error).message };
    }

    if (res.success && res.transaction) {
      return { ok: true, transactionId: res.transaction.id, amountCents: req.amountCents };
    }

    // A declined transaction still comes back with a transaction object and a processor code.
    if (res.transaction) {
      return {
        ok: false,
        retryable: false,
        code: res.transaction.processorResponseCode || res.transaction.status,
        message: res.message || `Declined (${res.transaction.status}).`,
      };
    }

    // No transaction at all = a validation error on our side (bad token, bad amount). Fixing it
    // needs a person, so retrying on a schedule would just fail identically every month.
    const detail = res.errors?.deepErrors?.().map((d) => d.message).join('; ');
    return {
      ok: false,
      retryable: false,
      code: 'validation_error',
      message: detail || res.message || 'The charge was rejected.',
    };
  }

  async removeMethod(token: string): Promise<void> {
    try {
      await this.client().paymentMethod.delete(token);
    } catch (e) {
      console.warn('braintree: could not remove payment method', (e as Error).message);
    }
  }

  /**
   * Find a SUCCESSFUL transaction previously charged under this idempotency key, if any.
   *
   * Braintree's search by orderId returns every transaction under that key, declined ones
   * included. The first version returned whatever it found, so retrying a fee whose first attempt
   * was declined "found" the decline and reported it as paid: confirmed in the sandbox, where a
   * retry returned the original processor_declined transaction as success. Only a transaction that
   * actually moved money may stand in for a new charge; a failed one means charge again.
   */
  private findByOrderId(orderId: string): Promise<{ id: string } | null> {
    return new Promise((resolve, reject) => {
      const found: { id: string; status: string }[] = [];
      const stream = this.client().transaction.search((s) => {
        s.orderId().is(orderId);
      });
      stream.on('data', (t: { id: string; status: string }) => found.push(t));
      stream.on('end', () => resolve(found.find((t) => SUCCESSFUL_STATUSES.has(t.status)) ?? null));
      stream.on('error', reject);
    });
  }
}

export type ParsedWebhook = {
  kind: string;
  transactionId: string | null;
  disputeReason: string | null;
};

/** Thrown when a webhook's signature does not verify: it did not come from Braintree. */
export class InvalidWebhookSignature extends Error {}

/**
 * Verify and read a Braintree webhook. Verification is what makes it safe to leave the webhook
 * route open without a login: a forged or tampered payload fails here. Checked against the
 * sandbox with Braintree's own sample notifications, including a tampered payload and a forged
 * signature, both of which are rejected.
 */
export async function parseBraintreeWebhook(signature: string, payload: string): Promise<ParsedWebhook> {
  const gw = makeGateway() as unknown as {
    webhookNotification: { parse(sig: string, payload: string): Promise<Record<string, any>> };
  };
  let n: Record<string, any>;
  try {
    n = await gw.webhookNotification.parse(signature, payload);
  } catch (e) {
    const type = (e as { type?: string }).type;
    if (type === 'invalidSignatureError' || type === 'invalidChallengeError') {
      throw new InvalidWebhookSignature('Webhook signature did not verify.');
    }
    throw e;
  }
  return {
    kind: String(n.kind),
    // A settlement event carries the transaction; a dispute carries it on the dispute.
    transactionId: n.transaction?.id ?? n.dispute?.transaction?.id ?? null,
    disputeReason: n.dispute?.reason ?? null,
  };
}

/** Whether Braintree credentials are present, without building a gateway. */
export function braintreeConfigured(): boolean {
  return Boolean(
    process.env.BRAINTREE_MERCHANT_ID && process.env.BRAINTREE_PUBLIC_KEY && process.env.BRAINTREE_PRIVATE_KEY,
  );
}
