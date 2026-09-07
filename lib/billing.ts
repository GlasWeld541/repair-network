// REX-03a — shop billing-profile readiness. A member shop must have a billing profile set up
// and in good standing before it can receive routed jobs: pay-per-completed-job, monthly
// auto-bill, or approved corporate invoice terms. This is the single source of truth for
// "billing ready", used by the routing gate and the admin UI.

export type BillingProfileType = 'pay_per_job' | 'monthly' | 'corporate';

export const BILLING_PROFILE_LABELS: Record<BillingProfileType, string> = {
  pay_per_job: 'Pay per completed job',
  monthly: 'Monthly auto-bill',
  corporate: 'Corporate invoice',
};

export interface BillingAccount {
  billing_profile_type?: string | null;
  billing_enabled?: boolean | null;
  corporate_invoice_approved?: boolean | null;
  billing_past_due?: boolean | null;
}

/**
 * Hard-enforce the routing gate (filter non-ready providers OUT of assignment)? Ships OFF for
 * beta: no shop has a payment method on file yet and the charge processor isn't wired, so
 * enforcing now would block all routing. While OFF the gate is advisory (readiness is shown on
 * the provider card but never blocks). Flip NEXT_PUBLIC_BILLING_GATE_ENFORCED=true once shops
 * are onboarded to billing. Corporate-approved accounts are always allowed either way.
 */
export const BILLING_GATE_ENFORCED = process.env.NEXT_PUBLIC_BILLING_GATE_ENFORCED === 'true';

/**
 * Can this provider receive routed jobs? Profile must be set up and in good standing:
 * corporate needs approved terms; pay-per-job / monthly need billing enabled. Past-due always
 * blocks. (When the processor lands, pay-per-job/monthly will also require an active payment
 * method — REX-03c.)
 */
export function billingReady(a: BillingAccount): boolean {
  if (a.billing_past_due === true) return false;
  const t = (a.billing_profile_type || '').trim();
  if (t === 'corporate') return a.corporate_invoice_approved === true;
  if (t === 'pay_per_job' || t === 'monthly') return a.billing_enabled === true;
  return false; // no profile set up
}

/** Whether the routing gate should actually exclude this provider (gate on + not ready). */
export function billingBlocksRouting(a: BillingAccount): boolean {
  return BILLING_GATE_ENFORCED && !billingReady(a);
}

export type BillingTone = 'ok' | 'warn' | 'none';

/** A short human status for the admin UI + provider cards. */
export function billingStanding(a: BillingAccount): { label: string; ok: boolean; tone: BillingTone } {
  if (a.billing_past_due === true) return { label: 'Past due', ok: false, tone: 'warn' };
  const t = (a.billing_profile_type || '').trim() as BillingProfileType | '';
  if (!t) return { label: 'No billing set up', ok: false, tone: 'none' };
  if (t === 'corporate') {
    return a.corporate_invoice_approved === true
      ? { label: 'Corporate — approved', ok: true, tone: 'ok' }
      : { label: 'Corporate — not approved', ok: false, tone: 'warn' };
  }
  const name = BILLING_PROFILE_LABELS[t];
  return a.billing_enabled === true
    ? { label: name, ok: true, tone: 'ok' }
    : { label: `${name} — not active`, ok: false, tone: 'warn' };
}
