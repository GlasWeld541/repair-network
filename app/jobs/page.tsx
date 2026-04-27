'use client';

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
            </tr>
          </thead>

          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-t">
                <td className="px-4 py-3">{j.customer_name}</td>
                <td className="px-4 py-3">
                  {j.vehicle_year} {j.vehicle_make} {j.vehicle_model}
                </td>
                <td className="px-4 py-3">{j.job_status}</td>
                <td className="px-4 py-3">${j.invoice_amount || 0}</td>
                <td className="px-4 py-3">${j.amount_paid || 0}</td>
              </tr>
            ))}

            {!jobs.length && (
              <tr>
                <td colSpan={5} className="text-center py-10 text-slate-500">
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