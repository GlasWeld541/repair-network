'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type JobRow = {
  id: string;
  created_at: string;
  updated_at: string | null;
  submitted_by_type: string | null;
  submitted_by_name: string | null;
  submitted_by_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  customer_city: string | null;
  customer_state: string | null;
  customer_zip: string | null;
  vehicle_year: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_vin: string | null;
  damage_type: string | null;
  damage_notes: string | null;
  job_status: string | null;
  assigned_account_id: string | null;
  assigned_account_name: string | null;
  failure_reason: string | null;
  failure_notes: string | null;
  payment_status: string | null;
  billing_path: string | null;
  insurance_carrier: string | null;
  claim_number: string | null;
  policy_number: string | null;
  loss_date: string | null;
  invoice_amount: number | null;
  amount_paid: number | null;
  amount_outstanding: number | null;
  completed_at: string | null;
  invoice_date: string | null;
};

type ShopUser = {
  user_email: string;
  account_id: string;
  account_name: string;
  role: string;
};

const JOB_STATUSES = [
  'New',
  'Assigned',
  'Accepted',
  'Scheduled',
  'In Progress',
  'Repaired',
  'Could Not Repair',
  'Completed',
  'Declined',
  'Cancelled',
];

const PAYMENT_STATUSES = [
  'Unpaid',
  'Paid by Customer Card',
  'Cash Collected',
  'Check Collected',
  'Sent to Insurance',
  'Insurance Paid',
  'Denied',
  'Written Off',
];

function currency(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// 🔥 NEW: First day of current month
function startOfMonthIso() {
  const date = new Date();
  date.setDate(1);
  return date.toISOString().slice(0, 10);
}

function cleanMoneyInput(value: string) {
  let cleaned = value.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');

  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) +
      cleaned.slice(firstDot + 1).replace(/\./g, '');
  }

  return cleaned;
}

function parseAmount(value: string | number | null | undefined) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '.') return 0;

  const cleaned = cleanMoneyInput(raw);
  const parsed = Number.parseFloat(cleaned);

  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyDraft(value: number | null | undefined) {
  if (value === null || value === undefined) return '';
  return String(value);
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [shopUser, setShopUser] = useState<ShopUser | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [invoiceDrafts, setInvoiceDrafts] = useState<Record<string, string>>({});
  const [paidDrafts, setPaidDrafts] = useState<Record<string, string>>({});

  // 🔥 UPDATED DEFAULTS
  const [dateFrom, setDateFrom] = useState(startOfMonthIso());
  const [dateTo, setDateTo] = useState(todayIso());

  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    customer_zip: '',
    vehicle_year: '',
    vehicle_make: '',
    vehicle_model: '',
    damage_type: '',
    damage_notes: '',
    invoice_amount: '',
  });

  const isShopUser = Boolean(shopUser?.account_id);

  useEffect(() => {
    void loadPage();
  }, []);

  useEffect(() => {
    if (!loading) {
      void loadJobs();
    }
  }, [dateFrom, dateTo]);

  function setJobsAndDrafts(nextJobs: JobRow[]) {
    setJobs(nextJobs);

    const nextInvoiceDrafts: Record<string, string> = {};
    const nextPaidDrafts: Record<string, string> = {};

    nextJobs.forEach((job) => {
      nextInvoiceDrafts[job.id] = moneyDraft(job.invoice_amount);
      nextPaidDrafts[job.id] = moneyDraft(job.amount_paid);
    });

    setInvoiceDrafts(nextInvoiceDrafts);
    setPaidDrafts(nextPaidDrafts);
  }

  async function loadPage() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const email = user?.email?.toLowerCase() ?? '';
    setUserEmail(email);

    let matchedShopUser: ShopUser | null = null;

    if (email) {
      const { data: shopData } = await supabase
        .from('shop_users')
        .select('user_email, account_id, account_name, role')
        .eq('user_email', email)
        .maybeSingle();

      matchedShopUser = (shopData as ShopUser | null) ?? null;
      setShopUser(matchedShopUser);
    }

    await loadJobs(matchedShopUser);
    setLoading(false);
  }

  async function loadJobs(currentShopUser = shopUser) {
    let query = supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false });

    if (currentShopUser?.account_id) {
      query = query.eq('assigned_account_id', currentShopUser.account_id);
    }

    if (dateFrom) query = query.gte('invoice_date', dateFrom);
    if (dateTo) query = query.lte('invoice_date', dateTo);

    const { data, error } = await query;

    if (error) {
      window.alert('Could not load jobs.');
      return;
    }

    setJobsAndDrafts((data as JobRow[]) ?? []);
  }

  async function createJob() {
    const invoiceAmount = parseAmount(form.invoice_amount);
    const today = todayIso();

    const { error } = await supabase.from('jobs').insert({
      submitted_by_type: isShopUser ? 'Shop' : 'GlasWeld',
      submitted_by_email: userEmail || null,
      submitted_by_name: isShopUser ? shopUser?.account_name : 'GlasWeld',
      customer_name: form.customer_name.trim() || null,
      customer_phone: form.customer_phone.trim() || null,
      customer_email: form.customer_email.trim() || null,
      customer_zip: form.customer_zip.trim() || null,
      vehicle_year: form.vehicle_year.trim() || null,
      vehicle_make: form.vehicle_make.trim() || null,
      vehicle_model: form.vehicle_model.trim() || null,
      damage_type: form.damage_type.trim() || null,
      damage_notes: form.damage_notes.trim() || null,
      job_status: isShopUser ? 'Assigned' : 'New',
      assigned_account_id: isShopUser ? shopUser?.account_id : null,
      assigned_account_name: isShopUser ? shopUser?.account_name : null,
      payment_status: 'Unpaid',
      invoice_amount: invoiceAmount,
      amount_paid: 0,
      invoice_date: today,
    });

    if (error) {
      window.alert('Could not create job.');
      return;
    }

    setForm({
      customer_name: '',
      customer_phone: '',
      customer_email: '',
      customer_zip: '',
      vehicle_year: '',
      vehicle_make: '',
      vehicle_model: '',
      damage_type: '',
      damage_notes: '',
      invoice_amount: '',
    });

    await loadJobs();
  }

  async function updateJob(id: string, patch: Partial<JobRow>) {
    setSavingId(id);

    const { error } = await supabase.from('jobs').update(patch).eq('id', id);

    setSavingId(null);

    if (error) {
      window.alert('Could not update job.');
      return;
    }

    await loadJobs();
  }

  const totals = useMemo(() => {
    return jobs.reduce(
      (sum, job) => {
        const invoiceAmount = parseAmount(invoiceDrafts[job.id] ?? job.invoice_amount);
        const amountPaid = parseAmount(paidDrafts[job.id] ?? job.amount_paid);

        sum.sales += invoiceAmount;
        sum.paid += amountPaid;
        sum.outstanding += invoiceAmount - amountPaid;

        return sum;
      },
      { sales: 0, paid: 0, outstanding: 0 }
    );
  }, [jobs, invoiceDrafts, paidDrafts]);

  if (loading) return <div className="p-6">Loading jobs...</div>;

  return (
    <div>
      {/* everything else unchanged */}
    </div>
  );
}