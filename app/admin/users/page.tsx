'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type AccessRequest = {
  id: string;
  name: string | null;
  email: string;
  company_name: string | null;
  company_type: string | null;
  requested_role: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

type UserRole = {
  id: string;
  user_email: string;
  role: string;
  approved: boolean;
  access_status: string | null;
  account_id: string | null;
  carrier_id: string | null;
};

type AccountRow = {
  id: string;
  account_name: string | null;
};

type CarrierRow = {
  id: string;
  name: string;
  type: string | null;
};

const ROLE_OPTIONS = [
  { value: 'carrier', label: 'Carrier / TPA' },
  { value: 'shop', label: 'Shop' },
  { value: 'admin', label: 'Admin' },
];

function statusBadge(status: string) {
  if (status === 'Approved' || status === 'Active') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (status === 'Rejected' || status === 'Revoked') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  if (status === 'Suspended') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  return 'border-slate-200 bg-slate-50 text-slate-700';
}

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [users, setUsers] = useState<UserRole[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [carriers, setCarriers] = useState<CarrierRow[]>([]);
  const [selection, setSelection] = useState<Record<string, Record<string, string>>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState('');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    setCurrentEmail(userData.user?.email?.toLowerCase() || '');

    const [{ data: requestData }, { data: userDataRows }, { data: accountData }, { data: carrierData }] =
      await Promise.all([
        supabase
          .from('user_access_requests')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('user_roles')
          .select('*')
          .order('user_email'),
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
    setUsers((userDataRows as UserRole[]) || []);
    setAccounts((accountData as AccountRow[]) || []);
    setCarriers((carrierData as CarrierRow[]) || []);
    setLoading(false);
  }

  function updateSelection(id: string, field: string, value: string) {
    setSelection((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  }

  function getSelected(id: string, field: string, fallback = '') {
    return selection[id]?.[field] ?? fallback;
  }

  function accountName(id: string | null) {
    if (!id) return '—';
    return accounts.find((account) => account.id === id)?.account_name || 'Unknown account';
  }

  function carrierName(id: string | null) {
    if (!id) return '—';
    return carriers.find((carrier) => carrier.id === id)?.name || 'Unknown carrier';
  }

  async function approveRequest(request: AccessRequest) {
    setBusyId(request.id);

    const selectedRole = getSelected(request.id, 'role', request.requested_role || 'carrier');
    const accountId = getSelected(request.id, 'account_id');
    let carrierId = getSelected(request.id, 'carrier_id');

    if (selectedRole === 'shop' && !accountId) {
      window.alert('Please assign this user to a shop account before approving.');
      setBusyId(null);
      return;
    }

    if (selectedRole === 'carrier' && !carrierId) {
      const carrierNameToCreate = request.company_name?.trim() || request.email;

      const { data: newCarrier, error: carrierError } = await supabase
        .from('carriers')
        .insert({
          name: carrierNameToCreate,
          type: request.company_type === 'TPA' ? 'TPA' : 'Carrier',
          contact_name: request.name,
          contact_email: request.email,
          phone: request.phone,
          website: request.website,
        })
        .select('id')
        .single();

      if (carrierError || !newCarrier?.id) {
        window.alert(`Could not create carrier/TPA: ${carrierError?.message || 'Unknown error'}`);
        setBusyId(null);
        return;
      }

      carrierId = newCarrier.id;
    }

    const { error: roleError } = await supabase.from('user_roles').upsert(
      {
        user_email: request.email.trim().toLowerCase(),
        role: selectedRole,
        approved: true,
        access_status: 'Active',
        account_id: selectedRole === 'shop' ? accountId : null,
        carrier_id: selectedRole === 'carrier' ? carrierId : null,
      },
      { onConflict: 'user_email' }
    );

    if (roleError) {
      window.alert(`Could not approve user: ${roleError.message}`);
      setBusyId(null);
      return;
    }

    await supabase
      .from('user_access_requests')
      .update({ status: 'Approved' })
      .eq('id', request.id);

    await load();
    setBusyId(null);
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

  async function saveUser(user: UserRole) {
    if (user.user_email.toLowerCase() === currentEmail && getSelected(user.user_email, 'role', user.role) !== 'admin') {
      window.alert('You cannot remove your own admin role from this screen.');
      return;
    }

    const selectedRole = getSelected(user.user_email, 'role', user.role);
    const selectedAccountId = getSelected(user.user_email, 'account_id', user.account_id || '');
    const selectedCarrierId = getSelected(user.user_email, 'carrier_id', user.carrier_id || '');

    if (selectedRole === 'shop' && !selectedAccountId) {
      window.alert('Shop users must be assigned to an account.');
      return;
    }

    if (selectedRole === 'carrier' && !selectedCarrierId) {
      window.alert('Carrier / TPA users must be assigned to a carrier.');
      return;
    }

    setBusyId(user.user_email);

    const { error } = await supabase
      .from('user_roles')
      .update({
        role: selectedRole,
        account_id: selectedRole === 'shop' ? selectedAccountId : null,
        carrier_id: selectedRole === 'carrier' ? selectedCarrierId : null,
      })
      .eq('user_email', user.user_email);

    if (error) {
      window.alert(`Could not save user: ${error.message}`);
    }

    await load();
    setBusyId(null);
  }

  async function setUserStatus(user: UserRole, status: string) {
    if (user.user_email.toLowerCase() === currentEmail && status !== 'Active') {
      window.alert('You cannot suspend or revoke your own admin access.');
      return;
    }

    setBusyId(user.user_email);

    await supabase
      .from('user_roles')
      .update({
        access_status: status,
        approved: status === 'Active',
      })
      .eq('user_email', user.user_email);

    await load();
    setBusyId(null);
  }

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === 'Pending'),
    [requests]
  );

  const approvedRequests = useMemo(
    () => requests.filter((request) => request.status === 'Approved'),
    [requests]
  );

  const rejectedRequests = useMemo(
    () => requests.filter((request) => request.status === 'Rejected'),
    [requests]
  );

  const activeUsers = useMemo(
    () => users.filter((user) => (user.access_status || 'Active') === 'Active'),
    [users]
  );

  const suspendedUsers = useMemo(
    () => users.filter((user) => user.access_status === 'Suspended'),
    [users]
  );

  const revokedUsers = useMemo(
    () => users.filter((user) => user.access_status === 'Revoked'),
    [users]
  );

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading user access...</div>;
  }

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold text-ink">User Access</h1>
        <p className="mt-1 text-sm text-slate-500">
          Review requests, assign users to the right organization, and manage access.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Pending Requests
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{pendingRequests.length}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Active Users
          </div>
          <div className="mt-2 text-3xl font-semibold text-emerald-700">{activeUsers.length}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Suspended
          </div>
          <div className="mt-2 text-3xl font-semibold text-amber-700">{suspendedUsers.length}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Revoked
          </div>
          <div className="mt-2 text-3xl font-semibold text-rose-700">{revokedUsers.length}</div>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-sm font-semibold text-slate-900">
            Pending Requests
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Review who is requesting access and assign them before approval.
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {pendingRequests.map((request) => {
            const selectedRole = getSelected(request.id, 'role', request.requested_role || 'carrier');

            return (
              <div key={request.id} className="grid gap-5 p-5 lg:grid-cols-[1.4fr_1.6fr]">
                <div>
                  <div className="font-semibold text-slate-900">
                    {request.name || 'Unnamed request'}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">{request.email}</div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                    <div>
                      <span className="font-medium text-slate-900">Company:</span>{' '}
                      {request.company_name || '—'}
                    </div>
                    <div>
                      <span className="font-medium text-slate-900">Type:</span>{' '}
                      {request.company_type || '—'}
                    </div>
                    <div>
                      <span className="font-medium text-slate-900">Phone:</span>{' '}
                      {request.phone || '—'}
                    </div>
                    <div>
                      <span className="font-medium text-slate-900">Website:</span>{' '}
                      {request.website || '—'}
                    </div>
                  </div>

                  {request.notes ? (
                    <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                      <span className="font-medium text-slate-900">Notes:</span>{' '}
                      {request.notes}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Role
                      </span>
                      <select
                        value={selectedRole}
                        onChange={(e) => updateSelection(request.id, 'role', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Shop Account
                      </span>
                      <select
                        value={getSelected(request.id, 'account_id')}
                        onChange={(e) => updateSelection(request.id, 'account_id', e.target.value)}
                        disabled={selectedRole !== 'shop'}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <option value="">Select shop</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.account_name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Carrier / TPA
                      </span>
                      <select
                        value={getSelected(request.id, 'carrier_id')}
                        onChange={(e) => updateSelection(request.id, 'carrier_id', e.target.value)}
                        disabled={selectedRole !== 'carrier'}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <option value="">Create from company</option>
                        {carriers.map((carrier) => (
                          <option key={carrier.id} value={carrier.id}>
                            {carrier.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={busyId === request.id}
                      onClick={() => void rejectRequest(request)}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={busyId === request.id}
                      onClick={() => void approveRequest(request)}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {!pendingRequests.length ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No pending access requests.
            </div>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-sm font-semibold text-slate-900">
            Active Users
          </div>
          <div className="mt-1 text-xs text-slate-500">
            These users can access the system. Save changes after editing role or assignment.
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 font-semibold">Linked Organization</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Edit Assignment</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => {
                const selectedRole = getSelected(user.user_email, 'role', user.role);
                const selectedAccountId = getSelected(user.user_email, 'account_id', user.account_id || '');
                const selectedCarrierId = getSelected(user.user_email, 'carrier_id', user.carrier_id || '');
                const status = user.access_status || 'Active';

                return (
                  <tr key={user.user_email} className="border-t border-slate-100">
                    <td className="px-5 py-4 font-medium text-slate-900">
                      {user.user_email}
                    </td>

                    <td className="px-5 py-4">
                      <select
                        value={selectedRole}
                        onChange={(e) => updateSelection(user.user_email, 'role', e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      {user.role === 'shop'
                        ? accountName(user.account_id)
                        : user.role === 'carrier'
                          ? carrierName(user.carrier_id)
                          : 'Admin access'}
                    </td>

                    <td className="px-5 py-4">
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadge(status)}`}>
                        {status}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="grid gap-2">
                        <select
                          value={selectedAccountId}
                          onChange={(e) => updateSelection(user.user_email, 'account_id', e.target.value)}
                          disabled={selectedRole !== 'shop'}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          <option value="">Select shop</option>
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.account_name}
                            </option>
                          ))}
                        </select>

                        <select
                          value={selectedCarrierId}
                          onChange={(e) => updateSelection(user.user_email, 'carrier_id', e.target.value)}
                          disabled={selectedRole !== 'carrier'}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          <option value="">Select carrier</option>
                          {carriers.map((carrier) => (
                            <option key={carrier.id} value={carrier.id}>
                              {carrier.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={busyId === user.user_email}
                          onClick={() => void saveUser(user)}
                          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                          Save
                        </button>

                        {status !== 'Active' ? (
                          <button
                            type="button"
                            disabled={busyId === user.user_email}
                            onClick={() => void setUserStatus(user, 'Active')}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                          >
                            Reactivate
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busyId === user.user_email}
                              onClick={() => void setUserStatus(user, 'Suspended')}
                              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                            >
                              Suspend
                            </button>

                            <button
                              type="button"
                              disabled={busyId === user.user_email}
                              onClick={() => void setUserStatus(user, 'Revoked')}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                            >
                              Revoke
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!users.length ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No approved users yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-sm font-semibold text-slate-900">
            Request History
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Approved and rejected requests stay here so nothing disappears.
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Company</th>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">Requested Role</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...approvedRequests, ...rejectedRequests].map((request) => (
                <tr key={request.id} className="border-t border-slate-100">
                  <td className="px-5 py-4 font-medium text-slate-900">
                    {request.name || '—'}
                  </td>
                  <td className="px-5 py-4 text-slate-700">{request.email}</td>
                  <td className="px-5 py-4 text-slate-700">{request.company_name || '—'}</td>
                  <td className="px-5 py-4 text-slate-700">{request.company_type || '—'}</td>
                  <td className="px-5 py-4 text-slate-700">{request.requested_role || '—'}</td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadge(request.status)}`}>
                      {request.status}
                    </span>
                  </td>
                </tr>
              ))}

              {!approvedRequests.length && !rejectedRequests.length ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No request history yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}