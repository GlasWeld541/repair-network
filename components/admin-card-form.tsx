'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dropin } from 'braintree-web-drop-in';
import { useToast } from '@/components/ui/notifications';

/**
 * An admin enters a provider's card for them (on the phone, say) through Braintree's own form.
 *
 * The card is typed into Braintree's fields and turned into a one-time nonce in the browser; only
 * the nonce reaches our server, which saves it at Braintree and records the chargeable card. This
 * is what the charge path needs: a card recorded by hand has no processor token and can never be
 * charged. The form loads only when opened.
 */
export default function AdminCardForm({ accountId, onSaved }: { accountId: string; onSaved: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropinRef = useRef<Dropin | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setReady(false);
      setError(null);
      try {
        const res = await fetch(`/api/accounts/${accountId}/payment-methods`);
        const out = await res.json().catch(() => ({}));
        if (!res.ok || !out.clientToken) throw new Error(out.error || 'Could not start the card form.');
        const { default: dropin } = await import('braintree-web-drop-in');
        if (cancelled || !containerRef.current) return;
        const instance = await dropin.create({
          authorization: out.clientToken,
          container: containerRef.current,
          vaultManager: false,
          paypal: false,
          venmo: false,
        });
        if (cancelled) {
          await instance.teardown();
          return;
        }
        dropinRef.current = instance;
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not start the card form.');
      }
    })();
    return () => {
      cancelled = true;
      const inst = dropinRef.current;
      dropinRef.current = null;
      if (inst) void inst.teardown().catch(() => {});
    };
  }, [open, accountId]);

  async function save() {
    const inst = dropinRef.current;
    if (!inst) return;
    setSaving(true);
    try {
      const { nonce } = await inst.requestPaymentMethod();
      const res = await fetch(`/api/accounts/${accountId}/payment-methods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nonce, makeDefault: true }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(out.error || 'The card could not be saved.');
        return;
      }
      toast.success(`${out.label} saved as the default card. GlasWeld fees will be charged to it.`);
      setOpen(false);
      onSaved();
    } catch (e) {
      // requestPaymentMethod rejects when the fields are incomplete; Braintree shows which inline.
      toast.error(e instanceof Error ? e.message : 'Check the card details and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-brand-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Add a card securely</h4>
          <p className="mt-0.5 text-xs text-slate-500">
            Enter the provider&apos;s card in Braintree&apos;s form, e.g. while on the phone. It becomes the
            default card and GlasWeld fees are charged to it. The card number never touches GlasWeld.
          </p>
        </div>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="h-10 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
          >
            Add card
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-4">
          {error ? <p className="mb-3 text-sm text-rose-700">{error}</p> : null}
          {!ready && !error ? <p className="mb-3 text-sm text-slate-500">Loading the secure card form…</p> : null}
          <div ref={containerRef} />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={!ready || saving}
              className="h-10 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save card'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={saving}
              className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
