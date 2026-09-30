/**
 * Whether a card is past its expiry month, or within 60 days of it. A card works through the last
 * day of its expiry month. Raised on the 9/29 call: an expired card on file means every fee after
 * that date fails, so it should be visible before it happens. Same rule as Rex's Billing screen
 * (frontend/src/pages/Billing.tsx `expiryState`); keep the two in step.
 */
export type CardExpiry = 'ok' | 'soon' | 'expired';

export function cardExpiryState(
  month: number | null | undefined,
  year: number | null | undefined,
  now: number = Date.now()
): CardExpiry {
  if (!month || !year) return 'ok';
  const fullYear = year < 100 ? 2000 + year : year;
  const lastDay = new Date(fullYear, month, 0, 23, 59, 59).getTime(); // day 0 = last of `month`
  if (now > lastDay) return 'expired';
  if (lastDay - now < 60 * 24 * 60 * 60 * 1000) return 'soon';
  return 'ok';
}
