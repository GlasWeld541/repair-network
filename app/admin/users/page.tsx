'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type AccessRequest = {
  id: string;
  name: string | null;
  email: string;
  company_name: string | null;
  company_type: string | null;
  requested_role: string;
  phone: string | null;
  website: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

type AccountRow = {
  id: string;
  account_name: string | null;
};

type CarrierRow = {
  id: string;
  name: string;
  type: string;
};

export default function AdminUsersPage() {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [carriers, setCarriers] = useState<CarrierRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === 'Pending'),
    [requests]
  );

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email?.toLowerCase() || '';

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, approved')
      .eq('user_email', email)
      .maybeSingle();

    const isAdmin = roleData?.role === 'admin' && roleData?.approved === true;
    setAuthorized(isAdmin);

    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const [{ data: requestData }, { data: accountData }, { data: carrierData }] =
      await Promise.all([
        supabase
          .from('user_access_requests')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('accounts')
          .select('id, account_name')
          .order('account_name'),
        supabase
          .from('carriers')
          .select('id, name, type')
          .order('name'),
      ]);

    setRequests((requestData as AccessRequest[]) || []);
    setAccounts((accountData as AccountRow[]) || []);
    setCarriers((carrierData as CarrierRow[]) || []);
    setLoading(false);
  }

  async function rejectRequest(request: AccessRequest) {
    setBusyId(request.id);

    await supabase
      .from('user_access_requests')
      .update({ status: 'Rejected' })
      .eq('id', request.id);

    await load();
    setBusyId(null);
  }

  async function approveRequest(request: AccessRequest) {
    setBusyId(request.id);

    const role = request.requested_role || 'carrier';

    let carrierId: string | null = null;

    if (role === 'carrier') {
      const carrierName = request.company_name?.trim() || request.email;

      const { data: existingCarrier } = await supabase
        .from('carriers')
        .select('id')
        .eq('name', carrierName)
        .maybeSingle();

      if (existingCarrier?.id) {
        carrierId = existingCarrier.id;
      } else {
        const { data: newCarrier } = await supabase
          .from('carriers')
          .insert({
            name: carrierName,
            type: request.company_type === 'TPA' ? 'TPA' : 'Carrier',
            contact_name: request.name,
            contact_email: request.email,
            phone: request.phone,
            website: request.website,
          })
          .select('id')
          .single();

        carrierId = newCarrier?.id || null;
      }
    }

    await supabase.from('user_roles').upsert(
      {
        user_email: request.email.trim().toLowerCase(),
        role,
        approved: true,
        account_id: null,
        carrier_id: carrierId,
      },
      { onConflict: 'user_email' }
    );

    await supabase
      .from('user_access_requests')
      .update({ status: 'Approved' })
      .eq('id', request.id);

    await load();
    setBusyId(null);
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading admin users...</div>;
  }

  if (!authorized) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-soft">
          <h1 className="text-2xl font-semibold text-ink">Not authorized</h1>
          <p className="mt-2 text-sm text-slate-500">
            You do not have admin access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold text-ink">User Access</h1>
        <p className="mt-1 text-sm text-slate-500">
          Review access requests and approve users into the correct role.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Pending Requests
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {pendingRequests.length}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Carriers / TPAs
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {carriers.length}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Shops Available
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {accounts.length}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              Access Requests
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Approve only users you recognize and can assign to the right access level.
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Company</th>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">Requested Role</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="border-t border-slate-100">
                  <td className="px-5 py-4 font-medium text-slate-900">
                    {request.name || '—'}
                  </td>
                  <td className="px-5 py-4 text-slate-700">{request.email}</td>
                  <td className="px-5 py-4 text-slate-700">
                    {request.company_name || '—'}
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {request.company_type || '—'}
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {request.requested_role}
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                      {request.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      {request.status === 'Pending' ? (
                        <>
                          <button
                            type="button"
                            disabled={busyId === request.id}
                            onClick={() => void approveRequest(request)}
                            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busyId === request.id}
                            onClick={() => void rejectRequest(request)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">No action</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {!requests.length ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No access requests yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}