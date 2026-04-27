'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type JobRow = {
  id: string;
  created_at: string;
  invoice_date: string | null;
  completed_at: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_zip: string | null;
  vehicle_year: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  damage_type: string | null;
  damage_notes: string | null;
  assigned_account_name: string | null;
  job_status: string | null;
  payment_status: string | null;
  invoice_amount: any;
  amount_paid: any;
  amount_outstanding: number | null;
};

const JOB_STATUSES = [
  'New','Assigned','Accepted','Scheduled','In Progress','Repaired','Could Not Repair','Completed','Declined','Cancelled'
];

const PAYMENT_STATUSES = [
  'Unpaid','Paid by Customer Card','Cash Collected','Check Collected','Sent to Insurance','Insurance Paid','Denied','Written Off'
];

function currency(value: number | null | undefined) {
  return (value ?? 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
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

  async function updateJob(id: string, patch: Partial<JobRow>) {
    await supabase.from('jobs').update(patch).eq('id', id);
    await loadJobs();
  }

  const totals = useMemo(() => {
    return jobs.reduce(
      (sum, j) => {
        sum.sales += Number(j.invoice_amount || 0);
        sum.paid += Number(j.amount_paid || 0);
        sum.outstanding += Number(j.amount_outstanding || 0);
        return sum;
      },
      { sales: 0, paid: 0, outstanding: 0 }
    );
  }, [jobs]);

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold">Jobs</h1>

      {/* TOTALS */}
      <div className="grid grid-cols-3 gap-4">
        <div>Total Sales: {currency(totals.sales)}</div>
        <div>Total Paid: {currency(totals.paid)}</div>
        <div className="text-red-600">Outstanding: {currency(totals.outstanding)}</div>
      </div>

      {/* TABLE */}
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            <th>Date</th>
            <th>Completed</th>
            <th>Customer</th>
            <th>Status</th>
            <th>Payment</th>
            <th>Invoice</th>
            <th>Paid</th>
            <th>Outstanding</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td>
                <input
                  type="date"
                  value={job.invoice_date || ''}
                  onChange={(e) =>
                    updateJob(job.id, { invoice_date: e.target.value })
                  }
                />
              </td>

              <td>
                <input
                  type="date"
                  value={job.completed_at || ''}
                  onChange={(e) =>
                    updateJob(job.id, { completed_at: e.target.value })
                  }
                />
              </td>

              <td>{job.customer_name}</td>

              <td>
                <select
                  value={job.job_status || ''}
                  onChange={(e) =>
                    updateJob(job.id, { job_status: e.target.value })
                  }
                >
                  {JOB_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </td>

              <td>
                <select
                  value={job.payment_status || ''}
                  onChange={(e) =>
                    updateJob(job.id, { payment_status: e.target.value })
                  }
                >
                  {PAYMENT_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </td>

              {/* ✅ FIXED INVOICE */}
              <td>
                <input
                  value={job.invoice_amount ?? ''}
                  onChange={(e) =>
                    setJobs((curr) =>
                      curr.map((r) =>
                        r.id === job.id
                          ? { ...r, invoice_amount: e.target.value }
                          : r
                      )
                    )
                  }
                  onBlur={(e) =>
                    updateJob(job.id, {
                      invoice_amount: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </td>

              {/* ✅ FIXED PAID */}
              <td>
                <input
                  value={job.amount_paid ?? ''}
                  onChange={(e) =>
                    setJobs((curr) =>
                      curr.map((r) =>
                        r.id === job.id
                          ? { ...r, amount_paid: e.target.value }
                          : r
                      )
                    )
                  }
                  onBlur={(e) =>
                    updateJob(job.id, {
                      amount_paid: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </td>

              <td className="text-red-600">
                {currency(job.amount_outstanding)}
              </td>

              <td>
                <Link href={`/jobs/${job.id}`}>Open</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}