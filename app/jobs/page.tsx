'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadJobs();
  }, []);

  async function loadJobs() {
    const { data } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false });

    setJobs(data || []);
    setLoading(false);
  }

  if (loading) return <div className="p-6">Loading jobs...</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Jobs</h1>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>

          <tbody>
            {jobs.map((j) => (
              <tr
                key={j.id}
                className="border-t hover:bg-slate-50 cursor-pointer"
                onClick={() => (window.location.href = `/jobs/${j.id}`)}
              >
                <td className="px-4 py-3 font-medium text-slate-900">
                  {j.customer_name || '—'}
                </td>

                <td className="px-4 py-3">
                  {j.vehicle_year} {j.vehicle_make} {j.vehicle_model}
                </td>

                <td className="px-4 py-3">{j.job_status}</td>

                <td className="px-4 py-3">
                  ${Number(j.invoice_amount || 0).toFixed(2)}
                </td>

                <td className="px-4 py-3">
                  ${Number(j.amount_paid || 0).toFixed(2)}
                </td>

                {/* 🔥 OPEN BUTTON */}
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/jobs/${j.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}

            {!jobs.length && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-slate-500">
                  No jobs found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}