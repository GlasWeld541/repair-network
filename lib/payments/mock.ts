import type { ChargeRequest, ChargeResult, PaymentGateway, VaultedMethod } from './types';

/**
 * An in-memory gateway used by tests and local development.
 *
 * It exists so the charge path can be exercised end to end, including the parts that are easy to
 * get wrong and expensive to get wrong in production: idempotency, declines, and transient
 * failures. Amounts drive the behaviour so a test can ask for a specific outcome without any
 * network access:
 *
 *   amountCents === 4200  -> hard decline (not retryable)
 *   amountCents === 4201  -> transient gateway error (retryable)
 *   anything else         -> success
 *
 * Charges are recorded by idempotency key, so charging the same key twice returns the FIRST
 * transaction rather than creating a second one. That mirrors what we require of a real gateway
 * and lets the cron's re-run safety be tested honestly.
 */
export class MockGateway implements PaymentGateway {
  readonly name = 'mock' as const;

  private customers = new Map<string, string>();
  private methods = new Map<string, VaultedMethod>();
  private charges = new Map<string, { transactionId: string; amountCents: number }>();
  private seq = 0;

  async ensureCustomer(args: { accountId: string }): Promise<string> {
    const existing = this.customers.get(args.accountId);
    if (existing) return existing;
    const id = `mock_cus_${args.accountId.slice(0, 8)}`;
    this.customers.set(args.accountId, id);
    return id;
  }

  async vaultFromNonce(args: { customerId: string; nonce: string }): Promise<VaultedMethod> {
    if (!args.nonce) throw new Error('a payment nonce is required');
    const method: VaultedMethod = {
      token: `mock_tok_${++this.seq}`,
      methodType: args.nonce.includes('ach') ? 'ach' : 'card',
      cardBrand: 'Visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2030,
    };
    this.methods.set(method.token, method);
    return method;
  }

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    const prior = this.charges.get(req.idempotencyKey);
    if (prior) return { ok: true, transactionId: prior.transactionId, amountCents: prior.amountCents };

    if (req.amountCents === 4200) {
      return { ok: false, retryable: false, code: 'declined', message: 'Card declined.' };
    }
    if (req.amountCents === 4201) {
      return { ok: false, retryable: true, code: 'gateway_timeout', message: 'Gateway timed out.' };
    }
    if (req.amountCents <= 0) {
      return { ok: false, retryable: false, code: 'invalid_amount', message: 'Amount must be positive.' };
    }

    const transactionId = `mock_txn_${++this.seq}`;
    this.charges.set(req.idempotencyKey, { transactionId, amountCents: req.amountCents });
    return { ok: true, transactionId, amountCents: req.amountCents };
  }

  async removeMethod(token: string): Promise<void> {
    this.methods.delete(token);
  }
}
