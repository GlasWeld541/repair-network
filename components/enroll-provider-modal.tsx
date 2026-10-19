'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/notifications';

/**
 * Add a provider to the network in one step: the account (shop or independent tech) on its plan,
 * the person as its owner login, and an invite to set a password and open Rex.
 *
 * Network membership used to happen automatically when a Rex login was created. Shiloh wants to
 * decide who joins, so this is now a deliberate admin action (see sql/manual_network_enrollment.sql).
 *
 * The address is optional so a tech can be added the moment terms are agreed. The form says
 * plainly what that costs: with no address the tech cannot be ranked by distance, so they will
 * not come up as a nearby provider until an address is added.
 */

type Props = { open: boolean; onClose: () => void; onCreated: (id: string) => void };

const EMPTY = {
  providerType: 'independent_tech',
  plan: 'free',
  accountName: '',
  contactName: '',
  email: '',
  phone: '',
  street: '',
  city: '',
  state: '',
  postalCode: '',
};

export function EnrollProviderModal({ open, onClose, onCreated }: Props) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);

  // Start clean every time it opens.
  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setError(null);
      setExistingId(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, saving, onClose]);

  if (!open) return null;

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const hasAddress = Boolean(form.street || form.city || form.state || form.postalCode);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setExistingId(null);
    try {
      const res = await fetch('/api/accounts/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Could not add the provider.');
        if (json.existingId) setExistingId(json.existingId);
        return;
      }
      const login = json.inviteError
        ? `The invite email could not be sent (${json.inviteError}); resend it from the account page.`
        : json.invited
          ? `An invite to set a password and open Rex went to ${form.email}.`
          : `${form.email} already has a Rex login, so they can sign in now.`;
      if (json.inviteError) {
        toast.error(`${form.accountName} added. ${login}`);
      } else if (!json.routable) {
        toast.info(
          json.addressGiven
            ? `${form.accountName} added. ${login} That address could not be located, so check it on the account page so they can be ranked by distance.`
            : `${form.accountName} added. ${login} Add an address when you have it so they come up as a nearby provider.`,
        );
      } else {
        toast.success(`${form.accountName} added to the network. ${login}`);
      }
      onCreated(json.id);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const input =
    'h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';
  const label = 'mb-1 block text-xs font-medium text-slate-600';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4"
      onClick={() => !saving && onClose()}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">Add a provider</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Sets up their account and login, and emails them an invite to Rex.
          </p>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="enroll-type">Provider</label>
              <select id="enroll-type" className={input} value={form.providerType} onChange={set('providerType')}>
                <option value="independent_tech">Independent tech</option>
                <option value="shop">Shop</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="enroll-plan">Plan</label>
              <select id="enroll-plan" className={input} value={form.plan} onChange={set('plan')}>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="enroll-name">
                {form.providerType === 'shop' ? 'Shop name' : 'Business or tech name'}
              </label>
              <input id="enroll-name" className={input} value={form.accountName} onChange={set('accountName')} required autoFocus />
            </div>
            <div>
              <label className={label} htmlFor="enroll-contact">
                {form.providerType === 'shop' ? "Owner's name" : "Tech's name"} (optional)
              </label>
              <input id="enroll-contact" className={input} value={form.contactName} onChange={set('contactName')} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="enroll-email">Email</label>
              <input id="enroll-email" type="email" className={input} value={form.email} onChange={set('email')} required />
            </div>
            <div>
              <label className={label} htmlFor="enroll-phone">Phone (optional)</label>
              <input id="enroll-phone" className={input} value={form.phone} onChange={set('phone')} />
            </div>
          </div>
          <p className="-mt-2 text-xs text-slate-500">
            Their Rex login. They become the account&apos;s owner and can add technicians later on Pro.
          </p>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 text-sm font-semibold text-slate-800">Address (optional)</div>
            <div className="space-y-3">
              <input aria-label="Street" placeholder="Street" className={input} value={form.street} onChange={set('street')} />
              <div className="grid grid-cols-6 gap-3">
                <input aria-label="City" placeholder="City" className={`${input} col-span-3`} value={form.city} onChange={set('city')} />
                <input aria-label="State" placeholder="ST" maxLength={2} className={`${input} col-span-1 uppercase`} value={form.state} onChange={set('state')} />
                <input aria-label="ZIP" placeholder="ZIP" className={`${input} col-span-2`} value={form.postalCode} onChange={set('postalCode')} />
              </div>
            </div>
            {!hasAddress ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                Without an address this provider will not come up in location-based matching, so they
                will not be suggested as a nearby provider. You can add the address later from their
                account page.
              </p>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}{' '}
              {existingId ? (
                <Link href={`/accounts/${existingId}`} className="font-semibold underline">
                  Open that account
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
            {saving ? 'Adding…' : 'Add and send invite'}
          </button>
        </div>
      </form>
    </div>
  );
}
