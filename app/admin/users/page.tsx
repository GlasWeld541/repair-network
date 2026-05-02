'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AdminUsersPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [carriers, setCarriers] = useState<any[]>([]);
  const [selection, setSelection] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const { data: reqs } = await supabase
      .from('user_access_requests')
      .select('*')
      .order('created_at', { ascending: false });

    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('*');

    const { data: accs } = await supabase
      .from('accounts')
      .select('id, account_name');

    const { data: cars } = await supabase
      .from('carriers')
      .select('id, name');

    setRequests(reqs || []);
    setRoles(rolesData || []);
    setAccounts(accs || []);
    setCarriers(cars || []);
    setLoading(false);
  }

  function updateSelection(id: string, field: string, value: any) {
    setSelection((prev: any) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  }

  async function approve(r: any) {
    const config = selection[r.id] || {};
    const role = config.role || r.requested_role;

    const account_id = config.account_id || null;
    let carrier_id = config.carrier_id || null;

    if (role === 'shop' && !account_id) {
      alert('Assign a shop');
      return;
    }

    if (role === 'carrier' && !carrier_id) {
      const { data: newCarrier } = await supabase
        .from('carriers')
        .insert({ name: r.company_name || r.email })
        .select('id')
        .single();

      carrier_id = newCarrier?.id;
    }

    await supabase.from('user_roles').upsert({
      user_email: r.email.toLowerCase(),
      role,
      approved: true,
      account_id,
      carrier_id,
      access_status: 'Active',
    });

    await supabase
      .from('user_access_requests')
      .update({ status: 'Approved' })
      .eq('id', r.id);

    await load();
  }

  async function updateUser(u: any) {
    const config = selection[u.user_email] || {};

    await supabase
      .from('user_roles')
      .update({
        role: config.role || u.role,
        account_id: config.account_id || u.account_id,
        carrier_id: config.carrier_id || u.carrier_id,
      })
      .eq('user_email', u.user_email);

    await load();
  }

  async function setStatus(u: any, status: string) {
    await supabase
      .from('user_roles')
      .update({ access_status: status })
      .eq('user_email', u.user_email);

    await load();
  }

  if (loading) return <div className="p-6">Loading...</div>;

  const pending = requests.filter((r) => r.status === 'Pending');

  return (
    <div className="max-w-[1400px] mx-auto p-6 space-y-8">
      <h1 className="text-3xl font-semibold">User Access</h1>

      {/* Pending */}
      <div className="bg-white rounded-2xl shadow-soft border overflow-hidden">
        <div className="p-4 font-semibold border-b">
          Pending Requests ({pending.length})
        </div>

        {pending.map((r) => (
          <div key={r.id} className="p-4 border-t grid grid-cols-6 gap-4 items-center">
            <div>{r.email}</div>

            <select onChange={(e) => updateSelection(r.id, 'role', e.target.value)}>
              <option value="carrier">Carrier</option>
              <option value="shop">Shop</option>
              <option value="admin">Admin</option>
            </select>

            <select onChange={(e) => updateSelection(r.id, 'account_id', e.target.value)}>
              <option value="">Select Shop</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.account_name}</option>
              ))}
            </select>

            <select onChange={(e) => updateSelection(r.id, 'carrier_id', e.target.value)}>
              <option value="">Select Carrier</option>
              {carriers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <div>{r.requested_role}</div>

            <button
              onClick={() => approve(r)}
              className="bg-blue-600 text-white px-3 py-1 rounded"
            >
              Approve
            </button>
          </div>
        ))}
      </div>

      {/* Approved Users */}
      <div className="bg-white rounded-2xl shadow-soft border overflow-hidden">
        <div className="p-4 font-semibold border-b">Users</div>

        {roles.map((u) => (
          <div key={u.user_email} className="p-4 border-t grid grid-cols-6 gap-4 items-center">
            <div>{u.user_email}</div>

            <select onChange={(e) => updateSelection(u.user_email, 'role', e.target.value)}>
              <option value="carrier">Carrier</option>
              <option value="shop">Shop</option>
              <option value="admin">Admin</option>
            </select>

            <select onChange={(e) => updateSelection(u.user_email, 'account_id', e.target.value)}>
              <option value="">Shop</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.account_name}</option>
              ))}
            </select>

            <select onChange={(e) => updateSelection(u.user_email, 'carrier_id', e.target.value)}>
              <option value="">Carrier</option>
              {carriers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <div>{u.access_status}</div>

            <div className="flex gap-2">
              <button onClick={() => updateUser(u)} className="bg-slate-900 text-white px-3 py-1 rounded">
                Save
              </button>

              <button onClick={() => setStatus(u, 'Suspended')} className="text-yellow-600">
                Suspend
              </button>

              <button onClick={() => setStatus(u, 'Revoked')} className="text-red-600">
                Revoke
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}