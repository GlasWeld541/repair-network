'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type BillingEvent = {
  id: string;
  billing_key: string;
  account_id: string;
  job_id: string | null;
  invoice_id: string | null;
  event_type: string;
  description: string;
  amount_cents: number;
  status: string;
  occurred_at: string;
  invoiced_at: string | null;
  paid_at: string | null;
  waived_at: string | null;
  waived_reason: string | null;
};

type AccountBilling = {
  id: string;
  account_name: string | null;
  billing_enabled: boolean | null;
  edi_submission_fee_cents: number | null;
  monthly_billing_enabled: boolean | null;
  billing_cycle_day: number | null;
  autopay_enabled: boolean | null;
  payment_gateway_provider: string | null;
  payment_gateway_status: string | null;
  processor_merchant_id: string | null;
  processor_rev_share_bps: number | null;
  repair_platform_fee_bps: number | null;
  replacement_platform_fee_bps: number | null;
  consumer_repair_enabled: boolean | null;
  consumer_replacement_enabled: boolean | null;
};

type PaymentMethodSummary = {
  id: string;
  account_id: string;
  method_type: string;
  nickname: string | null;
  status: string;
  is_default: boolean;
  card_brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  bank_name: string | null;
  routing_last4: string | null;
};

const STATUS_OPTIONS = ['all', 'pending', 'invoiced', 'paid', 'waived', 'void'];

function moneyFromCents(value: number | null | undefined) {
  return (Number(value || 0) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function percentFromBps(value: number | null | undefined) {
  return `${(Number(value || 0) / 100).toFixed(2)}%`;
}

function statusClass(status: string) {
  if (status === 'paid') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'invoiced') return 'border-brand-200 bg-brand-50 text-brand-700';
  if (status === 'waived' || status === 'void') return 'border-slate-200 bg-slate-50 text-slate-600';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function gatewayLabel(value: string | null | undefined) {
  if (value === 'preferred_processor') return 'Preferred Processor';
  if (value === 'stripe') return 'Stripe';
  if (value === 'square') return 'Square';
  if (value === 'other') return 'Other';
  return 'Manual';
}

export default function AdminBillingPage() {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [accounts, setAccounts] = useState<AccountBilling[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [accountFilter, setAccountFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const isReadOnly = role === 'demo';

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email?.toLowerCase() || '';

    if (!email) {
      window.location.href = '/login';
      return;
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, approved, access_status')
      .eq('user_email', email)
      .maybeSingle();

    if (
      !roleData ||
      roleData.approved !== true ||
      roleData.access_status !== 'Active' ||
      (roleData.role !== 'admin' && roleData.role !== 'demo')
    ) {
      window.location.href = '/admin';
      return;
    }

    setRole(roleData.role);

    const [{ data: accountRows }, { data: eventRows }, { data: paymentMethodRows }] = await Promise.all([
      supabase
        .from('accounts')
        .select(
          'id, account_name, billing_enabled, edi_submission_fee_cents, monthly_billing_enabled, billing_cycle_day, autopay_enabled, payment_gateway_provider, payment_gateway_status, processor_merchant_id, processor_rev_share_bps, repair_platform_fee_bps, replacement_platform_fee_bps, consumer_repair_enabled, consumer_replacement_enabled'
        )
        .order('account_name'),
      supabase
        .from('billing_events')
        .select('*')
        .order('occurred_at', { ascending: false })
        .limit(1000),
      supabase
        .from('account_payment_methods')
        .select(
          'id, account_id, method_type, nickname, status, is_default, card_brand, last4, exp_month, exp_year, bank_name, routing_last4'
        )
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);

    setAccounts((accountRows as AccountBilling[]) || []);
    setEvents((eventRows as BillingEvent[]) || []);
    setPaymentMethods((paymentMethodRows as PaymentMethodSummary[]) || []);
    setLoading(false);
  }

  function accountName(accountId: string) {
    return (
      accounts.find((account) => account.id === accountId)?.account_name ||
      'Unknown account'
    );
  }

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (statusFilter !== 'all' && event.status !== statusFilter) return false;
      if (accountFilter && event.account_id !== accountFilter) return false;
      return true;
    });
  }, [events, statusFilter, accountFilter]);

  const totals = useMemo(() => {
    return filteredEvents.reduce(
      (summary, event) => {
        if (event.status === 'pending') summary.pending += event.amount_cents;
        if (event.status === 'invoiced') summary.invoiced += event.amount_cents;
        if (event.status === 'paid') summary.paid += event.amount_cents;
        if (event.status === 'waived') summary.waived += event.amount_cents;
        summary.total += event.amount_cents;
        return summary;
      },
      { pending: 0, invoiced: 0, paid: 0, waived: 0, total: 0 }
    );
  }, [filteredEvents]);

  const gatewayAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.payment_gateway_provider &&
          account.payment_gateway_provider !== 'manual'
      ),
    [accounts]
  );

  function defaultPaymentMethod(accountId: string) {
    return paymentMethods.find(
      (method) =>
        method.account_id === accountId &&
        method.is_default &&
        method.status === 'active'
    );
  }

  function paymentMethodCount(accountId: string) {
    return paymentMethods.filter(
      (method) => method.account_id === accountId && method.status === 'active'
    ).length;
  }

  function paymentMethodLabel(method: PaymentMethodSummary | undefined) {
    if (!method) return 'None';
    if (method.method_type === 'card') {
      return `${method.card_brand || 'Card'} ending ${method.last4 || '----'}`;
    }
    return `${method.bank_name || 'ACH'} ending ${method.last4 || '----'}`;
  }

  async function updateEventStatus(event: BillingEvent, status: string) {
    if (isReadOnly) return;

    setBusyId(event.id);

    const patch: Record<string, string | null> = { status };

    if (status === 'invoiced') patch.invoiced_at = new Date().toISOString();
    if (status === 'paid') patch.paid_at = new Date().toISOString();
    if (status === 'waived') patch.waived_at = new Date().toISOString();

    const { error } = await supabase
      .from('billing_events')
      .update(patch)
      .eq('id', event.id);

    setBusyId(null);

    if (error) {
      window.alert(`Could not update billing event: ${error.message}`);
      return;
    }

    await load();
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading billing...</div>;
  }

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-6 py-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/admin" className="text-sm text-brand-700">
            Back to Admin
          </Link>

          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            Billing & Gateways
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Track platform revenue share, collection status, and account payment gateway terms.
          </p>
        </div>

        {isReadOnly ? (
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-soft">
            <Eye className="h-4 w-4 text-slate-500" />
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              Demo View
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Metric label="Pending" value={moneyFromCents(totals.pending)} tone="amber" />
        <Metric label="Invoiced" value={moneyFromCents(totals.invoiced)} tone="brand" />
        <Metric label="Collected" value={moneyFromCents(totals.paid)} tone="green" />
        <Metric label="Waived" value={moneyFromCents(totals.waived)} />
        <Metric label="Methods" value={String(paymentMethods.length)} tone="brand" />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Usage Events</h2>
            <p className="mt-1 text-sm text-slate-500">
              Completed jobs use percentage revenue share based on repair or replacement invoice totals.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="h-10 min-w-[220px]"
            >
              <option value="">All accounts</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_name || 'Unnamed Account'}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status === 'all' ? 'All statuses' : status}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Links</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredEvents.map((event) => (
                <tr key={event.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    {(event.occurred_at || '').slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link
                      href={`/accounts/${event.account_id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {accountName(event.account_id)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {event.description}
                    </div>
                    <div className="text-xs text-slate-500">{event.event_type}</div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {moneyFromCents(event.amount_cents)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(event.status)}`}>
                      {event.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {event.job_id ? (
                        <Link
                          href={`/jobs/${event.job_id}`}
                          className="text-brand-700 hover:underline"
                        >
                          Job
                        </Link>
                      ) : null}
                      {event.invoice_id ? (
                        <Link
                          href={`/invoices/${event.invoice_id}`}
                          className="text-brand-700 hover:underline"
                        >
                          Invoice
                        </Link>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {event.status === 'pending' ? (
                        <button
                          type="button"
                          disabled={isReadOnly || busyId === event.id}
                          onClick={() => void updateEventStatus(event, 'invoiced')}
                          className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Mark Invoiced
                        </button>
                      ) : null}

                      {event.status === 'pending' || event.status === 'invoiced' ? (
                        <button
                          type="button"
                          disabled={isReadOnly || busyId === event.id}
                          onClick={() => void updateEventStatus(event, 'paid')}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Mark Paid
                        </button>
                      ) : null}

                      {event.status !== 'waived' && event.status !== 'paid' ? (
                        <button
                          type="button"
                          disabled={isReadOnly || busyId === event.id}
                          onClick={() => void updateEventStatus(event, 'waived')}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Waive
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}

              {!filteredEvents.length ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    No billing events match this view.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-lg font-semibold text-slate-900">
          Gateway Settings by Account
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Use each account page to edit terms. This view is for monitoring gateway readiness and negotiated revenue share.
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[1350px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Gateway</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Merchant ID</th>
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3">Charge</th>
                <th className="px-4 py-3">Default Method</th>
                <th className="px-4 py-3">Repair Share</th>
                <th className="px-4 py-3">Replacement Share</th>
                <th className="px-4 py-3">EDI Fee</th>
                <th className="px-4 py-3">Processor Share</th>
              </tr>
            </thead>

            <tbody>
              {accounts.map((account) => {
                const defaultMethod = defaultPaymentMethod(account.id);
                const activeMethodCount = paymentMethodCount(account.id);

                return (
                  <tr key={account.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link
                        href={`/accounts/${account.id}`}
                        className="text-brand-700 hover:underline"
                      >
                        {account.account_name || 'Unnamed Account'}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{gatewayLabel(account.payment_gateway_provider)}</td>
                    <td className="px-4 py-3">{account.payment_gateway_status || 'not_connected'}</td>
                    <td className="px-4 py-3">{account.processor_merchant_id || '-'}</td>
                    <td className="px-4 py-3">Invoice on 1st</td>
                    <td className="px-4 py-3">Auto charge on 5th</td>
                    <td className="px-4 py-3">
                      <div>{paymentMethodLabel(defaultMethod)}</div>
                      <div className="text-xs text-slate-500">
                        {activeMethodCount} active
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{percentFromBps(account.repair_platform_fee_bps ?? 300)}</div>
                      <div className="text-xs text-slate-500">
                        {account.consumer_repair_enabled === false ? 'paused' : 'enabled'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{percentFromBps(account.replacement_platform_fee_bps ?? 700)}</div>
                      <div className="text-xs text-slate-500">
                        {account.consumer_replacement_enabled ? 'enabled' : 'paused'}
                      </div>
                    </td>
                    <td className="px-4 py-3">{moneyFromCents(account.edi_submission_fee_cents)}</td>
                    <td className="px-4 py-3">{percentFromBps(account.processor_rev_share_bps)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {gatewayAccounts.length ? (
          <div className="mt-4 text-xs text-slate-500">
            {gatewayAccounts.length} account{gatewayAccounts.length === 1 ? '' : 's'} configured for a processor gateway.
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'brand' | 'green' | 'amber';
}) {
  const color =
    tone === 'green'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : tone === 'brand'
          ? 'text-brand-700'
          : 'text-slate-900';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className={`mt-2 text-3xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
