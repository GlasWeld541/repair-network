/**
 * What a Braintree webhook means for a GlasWeld fee.
 *
 * The charge run marks a fee paid the moment Braintree accepts the charge. For a card that is
 * nearly always the end of it. For a bank payment (ACH) it is not: the money can be returned days
 * later for insufficient funds or a closed account, and a card holder can dispute a charge weeks
 * later. Braintree tells us about both only by webhook. Without this, a fee would stay "paid" after
 * the money went back, and nobody would find out until someone reconciled a bank statement by hand.
 *
 * Kept pure (no database, no network) so the rules can be checked on their own. The route applies
 * the result.
 *
 * Every rule is idempotent against the fee's CURRENT state, because Braintree can deliver the same
 * webhook more than once: a returned payment only reverts a fee that is still "paid", so a second
 * delivery changes nothing and raises no second alert.
 */

export type FeeState = { status: string; charge_error: string | null };

export type FeeUpdate = {
  status?: 'invoiced';
  paid_at?: null;
  charge_error?: string | null;
};

export type WebhookPlan = {
  update: FeeUpdate | null;
  /** Only an update that reverts a paid fee needs the "still paid" guard on the write. */
  requirePaid: boolean;
  alert: { subject: string; body: string } | null;
  /**
   * What the PROVIDER is told in their Rex bell, when it is theirs to act on. Only for outcomes
   * that leave the fee owed again: a dispute being opened or won needs nothing from them (they
   * raised the dispute, or it was resolved their way).
   */
  providerAlert: { subject: string; body: string } | null;
};

const NOTHING: WebhookPlan = { update: null, requirePaid: false, alert: null, providerAlert: null };

const RETURNED = 'The bank returned this payment after it first appeared to succeed.';
const DISPUTE_LOST = 'The card holder won a dispute and the payment was taken back.';
const disputeOpened = (reason?: string | null) =>
  `Disputed by the card holder${reason ? ` (${reason})` : ''}. The payment may be held until it is resolved.`;

export function planWebhook(
  kind: string,
  fee: FeeState,
  detail: { disputeReason?: string | null } = {},
): WebhookPlan {
  switch (kind) {
    case 'transaction_settlement_declined':
      if (fee.status !== 'paid') return NOTHING;
      return {
        update: { status: 'invoiced', paid_at: null, charge_error: RETURNED },
        requirePaid: true,
        alert: {
          subject: 'A fee payment was returned by the bank',
          body: 'It had been marked paid. It is back to outstanding and needs following up.',
        },
        providerAlert: {
          subject: 'Your bank returned a GlasWeld fee payment',
          body: 'The fee is outstanding again. Update your payment method in Billing so it can be charged again.',
        },
      };

    case 'dispute_opened': {
      const note = disputeOpened(detail.disputeReason);
      if (fee.charge_error === note) return NOTHING; // re-delivery
      return {
        update: { charge_error: note },
        requirePaid: false,
        alert: { subject: 'A fee payment was disputed', body: note },
        providerAlert: null,
      };
    }

    case 'dispute_lost':
      if (fee.status !== 'paid') return NOTHING;
      return {
        update: { status: 'invoiced', paid_at: null, charge_error: DISPUTE_LOST },
        requirePaid: true,
        alert: {
          subject: 'A disputed fee payment was taken back',
          body: 'The card holder won the dispute. The fee is back to outstanding.',
        },
        providerAlert: {
          subject: 'A disputed GlasWeld fee is outstanding again',
          body: 'The payment was taken back after the dispute. The fee is still owed; you can pay it from Billing.',
        },
      };

    case 'dispute_won':
      if (!fee.charge_error?.startsWith('Disputed by the card holder')) return NOTHING;
      return {
        update: { charge_error: null },
        requirePaid: false,
        alert: { subject: 'A disputed fee payment was upheld', body: 'GlasWeld keeps the payment.' },
        providerAlert: null,
      };

    // 'check' (Braintree's test ping), 'transaction_settled', and anything we don't act on yet.
    default:
      return NOTHING;
  }
}
