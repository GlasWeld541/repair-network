'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AdminUsersPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [carriers, setCarriers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selection, setSelection] = useState<Record<string, any>>({});

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const { data: reqs } = await supabase
      .from('user_access_requests')
      .select('*')
      .order('created_at', { ascending: false });

    const { data: accs } = await supabase
      .from('accounts')
      .select('id, account_name')
      .order('account_name');

    const { data: cars } = await supabase
      .from('carriers')
      .select('id, name')
      .order('name');

    setRequests(reqs || []);
    setAccounts(accs || []);
    setCarriers(cars || []);
    setLoading(false);
  }

  function updateSelection(id: string, field: string, value: any) {
    setSelection((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  }

  async function approve(request: any) {
    const config = selection[request.id] || {};

    const role = config.role || request.requested_role;

    let account_id = config.account_id || null;
    let carrier_id = config.carrier_id || null;

    if (role === 'carrier' && !carrier_id) {
      const { data: newCarrier } = await supabase
        .from('carriers')
        .insert({
          name: request.company_name || request.email,
        })
        .select('id')
        .single();

      carrier_id = newCarrier?.id;
    }

    await supabase.from('user_roles').upsert({
      user_email: request.email.toLowerCase(),
      role,
      approved: true,
      account_id,
      carrier_id,
    });

    await supabase
      .from('user_access_requests')
      .update({ status: 'Approved' })
      .eq('id', request.id);

    await load();
  }

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <h1 className="text-3xl font-semibold mb-6">User Access</h1>

      <div className="bg-white rounded-2xl shadow-soft border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-4">Email</th>
              <th className="p-4">Role</th>
              <th className="p-4">Account</th>
              <th className="p-4">Carrier</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Action</th>
            </tr>
          </thead>

          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-4">{r.email}</td>

                <td className="p-4">
                  <select
                    onChange={(e) =>
                      updateSelection(r.id, 'role', e.target.value)
                    }
                    className="border rounded px-2 py-1"
                  >
                    <option value="carrier">Carrier / TPA</option>
                    <option value="shop">Shop</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>

                <td className="p-4">
                  <select
                    onChange={(e) =>
                      updateSelection(r.id, 'account_id', e.target.value)
                    }
                    className="border rounded px-2 py-1"
                  >
                    <option value="">Select</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.account_name}
                      </option>
                    ))}
                  </select>
                </td>

                <td className="p-4">
                  <select
                    onChange={(e) =>
                      updateSelection(r.id, 'carrier_id', e.target.value)
                    }
                    className="border rounded px-2 py-1"
                  >
                    <option value="">Select</option>
                    {carriers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>

                <td className="p-4">{r.status}</td>

                <td className="p-4 text-right">
                  {r.status === 'Pending' && (
                    <button
                      onClick={() => approve(r)}
                      className="bg-blue-600 text-white px-3 py-1 rounded"
                    >
                      Approve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}