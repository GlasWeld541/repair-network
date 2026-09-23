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
 * Braintree is intentionally NOT registered yet. The adapter needs real sandbox credentials to be
 * written and verified against, and registering an untested adapter would turn the cron's honest
 * 501 into a silent failure that looks like success. It is added in one place, here, once the
 * sandbox keys land.
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

  // 'braintree' lands here once the adapter exists and has been verified against sandbox.
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
