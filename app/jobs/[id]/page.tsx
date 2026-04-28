'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type JobRow = {
  id: string;
  created_at: string;
  assigned_account_id: string | null;
  assigned_account_name: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_zip: string | null;
  vehicle_year: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_vin: string | null;
  damage_type: string | null;
  damage_notes: string | null;
  job_status: string | null;
  failure_reason: string | null;
  failure_notes: string | null;
  payment_status: string | null;
  invoice_amount: number | null;
  amount_paid: number | null;
  amount_outstanding: number | null;
  completed_at: string | null;
  invoice_date: string | null;
};

export default function JobDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [job, setJob] = useState<JobRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    void loadJob();
  }, [id]);

  async function loadJob() {
    setLoading(true);

    // 🔐 get logged in user
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email;

    // 🔐 check if shop user
    const { data: shopUser } = await supabase
      .from('shop_users')
      .select('account_id')
      .eq('user_email', email)
      .maybeSingle();

    // get job
    const { data: jobData } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .single();

    // 🚫 BLOCK ACCESS if shop user and job not theirs
    if (shopUser?.account_id && jobData?.assigned_account_id !== shopUser.account_id) {
      setBlocked(true);
      setLoading(false);
      return;
    }

    setJob(jobData as JobRow);
    setLoading(false);
  }

  if (loading) {
    return <div className="p-6 text-slate-600">Loading job...</div>;
  }

  if (blocked) {
    return (
      <div className="p-10 text-center">
        <h1 className="text-xl font-semibold text-red-600">Access Denied</h1>
        <p className="mt-2 text-slate-500">
          You do not have permission to view this job.
        </p>
        <Link href="/jobs" className="mt-4 inline-block text-blue-600 underline">
          Back to Jobs
        </Link>
      </div>
    );
  }

  if (!job) {
    return <div className="p-6 text-slate-600">Job not found.</div>;
  }

  return (
    <div className="space-y-6">
      <Link href="/jobs" className="flex items-center gap-2 text-sm text-blue-600">
        <ArrowLeft className="h-4 w-4" />
        Back to jobs
      </Link>

      <h1 className="text-2xl font-semibold">
        {job.customer_name || 'Job'}
      </h1>

      <div className="rounded-xl border bg-white p-6 space-y-4">
        <div><strong>Shop:</strong> {job.assigned_account_name || 'Unassigned'}</div>
        <div><strong>Status:</strong> {job.job_status}</div>
        <div><strong>Vehicle:</strong> {[job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(' ')}</div>
        <div><strong>Invoice:</strong> ${job.invoice_amount || 0}</div>
        <div><strong>Paid:</strong> ${job.amount_paid || 0}</div>
        <div><strong>Outstanding:</strong> ${job.amount_outstanding || 0}</div>
      </div>
    </div>
  );
}