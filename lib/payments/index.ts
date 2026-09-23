import { MockGateway } from './mock';
import type { PaymentGateway } from './types';

export * from './types';
export { MockGateway } from './mock';

/**
 * Resolve the configured gateway, or null when none is wired.
 *
 * Returning null rather than throwing is the point: the charge cron runs on a schedule whether or
 * not a processor exists, and "no gateway configured" is a normal state we report, not an error
 * that pages someone at 08:00 on the 5th.
 *
 * Braintree is registered here. It only activates when PAYMENT_PROCESSOR_ENABLED=true AND
 * PAYMENT_PROCESSOR_PROVIDER=braintree AND all three credentials are present; anything short of
 * that returns null and the charge cron reports "no processor configured" rather than pretending
 * to be live. BRAINTREE_ENVIRONMENT defaults to sandbox, so production is an explicit opt-in.
 *
 * `mock` is selectable so a developer can exercise the whole charge path locally without touching
 * a real processor. It is refused outside development so a misconfigured production env can never
 * "charge" providers against an in-memory map and mark real fees paid.
 */
let cached: PaymentGateway | null | undefined;

export function getPaymentGateway(): PaymentGateway | null {
  if (cached !== undefined) return cached;
  cached = resolve();
  return cached;
}

function resolve(): PaymentGateway | null {
  if (process.env.PAYMENT_PROCESSOR_ENABLED !== 'true') return null;
  const provider = (process.env.PAYMENT_PROCESSOR_PROVIDER || '').trim().toLowerCase();

  if (provider === 'mock') {
    if (process.env.NODE_ENV === 'production') {
      console.error('payments: refusing the mock gateway in production');
      return null;
    }
    return new MockGateway();
  }

  if (provider === 'braintree') {
    const missing = ['BRAINTREE_MERCHANT_ID', 'BRAINTREE_PUBLIC_KEY', 'BRAINTREE_PRIVATE_KEY'].filter(
      (k) => !process.env[k],
    );
    if (missing.length) {
      // Refuse rather than construct a gateway that will fail on every call. The cron's honest
      // "no processor configured" is far better than a run that looks live and declines everyone.
      console.error(`payments: braintree selected but missing ${missing.join(', ')}`);
      return null;
    }
    // Required lazily for the same reason the adapter does it: keep a Node-only SDK out of any
    // client bundle that happens to import this barrel.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BraintreeGatewayAdapter } = require('./braintree');
    return new BraintreeGatewayAdapter();
  }

  if (provider) console.warn(`payments: no adapter registered for provider "${provider}"`);
  return null;
}

/** Test seam — lets a test install a gateway without touching process.env. */
export function __setPaymentGatewayForTests(gateway: PaymentGateway | null | undefined): void {
  cached = gateway;
}

/**
 * The idempotency key for a platform-fee charge.
 *
 * Keyed on the billing event, because that is the thing being paid for: one billing event can be
 * charged exactly once, no matter how many times the cron runs or is retried.
 */
export function feeChargeKey(billingEventId: string): string {
  return `billing_event:${billingEventId}`;
}
