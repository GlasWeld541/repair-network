'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Job = {
  id: string;
  customer_name: string | null;
  job_status: string | null;
  invoice_amount: number | null;
  amount_paid: number | null;
  invoice_date: string | null;
  assigned_account_id: string | null;
  assigned_account_name: string | null;
};

type Role = 'admin' | 'shop' | 'carrier' | null;

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [role, setRole] = useState<Role>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadJobs();
  }, []);

  async function loadJobs() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email?.toLowerCase() || '';

    // 🔒 GET ROLE
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, approved, access_status')
      .eq('user_email', email)
      .maybeSingle();

    if (!roleData || !roleData.approved || roleData.access_status !== 'Active') {
      window.location.href = '/login';
      return;
    }

    setRole(roleData.role);

    // 🔒 ADMIN → FULL ACCESS
    if (roleData.role === 'admin') {
      const { data } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false });

      setJobs(data || []);
      setLoading(false);
      return;
    }

    // 🔒 SHOP → ONLY THEIR ACCOUNT
    const { data: shopData } = await supabase
      .from('shop_users')
      .select('account_id')
      .eq('user_email', email)
      .maybeSingle();

    if (!shopData?.account_id) {
      // 🚨 HARD BLOCK
      setJobs([]);
      setLoading(false);
      return;
    }

    setAccountId(shopData.account_id);

    const { data } = await supabase
      .from('jobs')
      .select('*')
      .eq('assigned_account_id', shopData.account_id)
      .order('created_at', { ascending: false });

    setJobs(data || []);
    setLoading(false);
  }

  function money(value: number | null) {
    return Number(value || 0).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold text-ink">
          {role === 'admin' ? 'All Jobs' : 'Your Jobs'}
        </h1>
        <p className="text-sm text-slate-500">
          {role === 'admin'
            ? 'Full system visibility'
            : 'You only see jobs assigned to your account'}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Status</th>
              {role === 'admin' && (
                <th className="px-4 py-3">Shop</th>
              )}
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Open</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-10">
                  Loading...
                </td>
              </tr>
            ) : jobs.map((job) => (
              <tr
                key={job.id}
                className="border-t cursor-pointer hover:bg-slate-50"
                onClick={() => (window.location.href = `/jobs/${job.id}`)}
              >
                <td className="px-4 py-3">{job.invoice_date}</td>
                <td className="px-4 py-3">{job.customer_name}</td>
                <td className="px-4 py-3">{job.job_status}</td>

                {role === 'admin' && (
                  <td className="px-4 py-3">
                    {job.assigned_account_name}
                  </td>
                )}

                <td className="px-4 py-3">{money(job.invoice_amount)}</td>
                <td className="px-4 py-3">{money(job.amount_paid)}</td>

                <td className="px-4 py-3">
                  <Link
                    href={`/jobs/${job.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-slate-900 text-white px-3 py-1 rounded"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}

            {!loading && !jobs.length && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-slate-500">
                  No jobs available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}