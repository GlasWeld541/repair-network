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
  { value: 'demo', label: 'Demo / View Only' },
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
  const [currentRole, setCurrentRole] = useState<string | null>(null);

  const [manualUser, setManualUser] = useState({
    email: '',
    role: 'shop',
    account_id: '',
    carrier_id: '',
  });

  const isDemo = currentRole === 'demo';

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);

    const { data: currentUser } = await supabase.auth.getUser();
    const email = currentUser.user?.email?.toLowerCase() || '';
    setCurrentEmail(email);

    if (email) {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role, approved, access_status')
        .eq('user_email', email)
        .maybeSingle();

      if (roleData?.approved === true && roleData?.access_status === 'Active') {
        setCurrentRole(roleData.role);
      }
    }

    const [{ data: requestData }, { data: userRows }, { data: accountData }, { data: carrierData }] =
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
    setUsers((userRows as UserRole[]) || []);
    setAccounts((accountData as AccountRow[]) || []);
    setCarriers((carrierData as CarrierRow[]) || []);
    setLoading(false);
  }

  function blockDemoAction() {
    if (!isDemo) return false;

    window.alert('Demo access is view-only. Changes are disabled.');
    return true;
  }

  function updateSelection(id: string, field: string, value: string) {
    if (isDemo) return;

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

  async function ensureCarrierFromRequest(request: AccessRequest) {
    if (isDemo) return null;

    const carrierName = request.company_name?.trim() || request.email;

    const { data: existing } = await supabase
      .from('carriers')
      .select('id')
      .eq('name', carrierName)
      .maybeSingle();

    if (existing?.id) return existing.id;

    const { data: created, error } = await supabase
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

    if (error || !created?.id) {
      window.alert(`Could not create carrier/TPA: ${error?.message || 'Unknown error'}`);
      return null;
    }

    return created.id;
  }

  async function upsertPlatformUser(args: {
    email: string;
    role: string;
    account_id?: string | null;
    carrier_id?: string | null;
  }) {
    if (isDemo) return false;

    const email = args.email.trim().toLowerCase();

    if (!email) {
      window.alert('Email is required.');
      return false;
    }

    if (args.role === 'shop' && !args.account_id) {
      window.alert('Shop users must be assigned to an account.');
      return false;
    }

    if (args.role === 'carrier' && !args.carrier_id) {
      window.alert('Carrier / TPA users must be assigned to a carrier.');
      return false;
    }

    if (email === currentEmail && args.role !== 'admin') {
      window.alert('You cannot remove your own admin role from this screen.');
      return false;
    }

    const { error } = await supabase.from('user_roles').upsert(
      {
        user_email: email,
        role: args.role,
        approved: true,
        access_status: 'Active',
        account_id: args.role === 'shop' ? args.account_id : null,
        carrier_id: args.role === 'carrier' ? args.carrier_id : null,
      },
      { onConflict: 'user_email' }
    );

    if (error) {
      window.alert(`Could not save user: ${error.message}`);
      return false;
    }

    return true;
  }

  async function createManualUser() {
    if (blockDemoAction()) return;

    setBusyId('manual-user');

    const saved = await upsertPlatformUser({
      email: manualUser.email,
      role: manualUser.role,
      account_id: manualUser.account_id,
      carrier_id: manualUser.carrier_id,
    });

    if (saved) {
      setManualUser({
        email: '',
        role: 'shop',
        account_id: '',
        carrier_id: '',
      });

      await load();
    }

    setBusyId(null);
  }

  async function approveRequest(request: AccessRequest) {
    if (blockDemoAction()) return;

    setBusyId(request.id);

    const selectedRole = getSelected(request.id, 'role', request.requested_role || 'carrier');
    const accountId = getSelected(request.id, 'account_id');
    let carrierId = getSelected(request.id, 'carrier_id');

    if (selectedRole === 'carrier' && !carrierId) {
      carrierId = (await ensureCarrierFromRequest(request)) || '';
    }

    const saved = await upsertPlatformUser({
      email: request.email,
      role: selectedRole,
      account_id: selectedRole === 'shop' ? accountId : null,
      carrier_id: selectedRole === 'carrier' ? carrierId : null,
    });

    if (saved) {
      await supabase
        .from('user_access_requests')
        .update({ status: 'Approved' })
        .eq('id', request.id);

      await load();
    }

    setBusyId(null);
  }

  async function repairUserFromRequest(request: AccessRequest) {
    if (blockDemoAction()) return;

    setBusyId(`repair-${request.id}`);

    const selectedRole = getSelected(request.id, 'role', request.requested_role || 'carrier');
    const accountId = getSelected(request.id, 'account_id');
    let carrierId = getSelected(request.id, 'carrier_id');

    if (selectedRole === 'carrier' && !carrierId) {
      carrierId = (await ensureCarrierFromRequest(request)) || '';
    }

    const saved = await upsertPlatformUser({
      email: request.email,
      role: selectedRole,
      account_id: selectedRole === 'shop' ? accountId : null,
      carrier_id: selectedRole === 'carrier' ? carrierId : null,
    });

    if (saved) {
      await supabase
        .from('user_access_requests')
        .update({ status: 'Approved' })
        .eq('id', request.id);

      await load();
    }

    setBusyId(null);
  }

  async function rejectRequest(request: AccessRequest) {
    if (blockDemoAction()) return;

    setBusyId(request.id);

    await supabase
      .from('user_access_requests')
      .update({ status: 'Rejected' })
      .eq('id', request.id);

    await load();
    setBusyId(null);
  }

  async function reopenRequest(request: AccessRequest) {
    if (blockDemoAction()) return;

    setBusyId(request.id);

    await supabase
      .from('user_access_requests')
      .update({ status: 'Pending' })
      .eq('id', request.id);

    await load();
    setBusyId(null);
  }

  async function archiveRequest(request: AccessRequest) {
    if (blockDemoAction()) return;

    setBusyId(request.id);

    await supabase
      .from('user_access_requests')
      .update({ status: 'Archived' })
      .eq('id', request.id);

    await load();
    setBusyId(null);
  }

  async function saveUser(user: UserRole) {
    if (blockDemoAction()) return;

    const selectedRole = getSelected(user.user_email, 'role', user.role);
    const selectedAccountId = getSelected(user.user_email, 'account_id', user.account_id || '');
    const selectedCarrierId = getSelected(user.user_email, 'carrier_id', user.carrier_id || '');

    setBusyId(user.user_email);

    const saved = await upsertPlatformUser({
      email: user.user_email,
      role: selectedRole,
      account_id: selectedAccountId,
      carrier_id: selectedCarrierId,
    });

    if (saved) await load();

    setBusyId(null);
  }

  async function setUserStatus(user: UserRole, status: string) {
    if (blockDemoAction()) return;

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

  const historyRequests = useMemo(
    () => requests.filter((request) => request.status !== 'Pending' && request.status !== 'Archived'),
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-ink">User Access</h1>
          <p className="mt-1 text-sm text-slate-500">
            Review requests, create access profiles, assign organizations, and manage access status.
          </p>
        </div>

        {isDemo ? (
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            Demo View Only
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pending Requests</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{pendingRequests.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Active Users</div>
          <div className="mt-2 text-3xl font-semibold text-emerald-700">{activeUsers.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Suspended</div>
          <div className="mt-2 text-3xl font-semibold text-amber-700">{suspendedUsers.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Revoked</div>
          <div className="mt-2 text-3xl font-semibold text-rose-700">{revokedUsers.length}</div>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-sm font-semibold text-slate-900">Create / Repair User Access</div>
          <div className="mt-1 text-xs text-slate-500">
            Use this when someone can log in but does not appear as a managed platform user.
          </div>
        </div>

        <div className="grid gap-3 p-5 lg:grid-cols-[1.4fr_1fr_1.4fr_1.4fr_auto]">
          <input
            value={manualUser.email}
            onChange={(e) => setManualUser((current) => ({ ...current, email: e.target.value }))}
            placeholder="User email"
            disabled={isDemo}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          />

          <select
            value={manualUser.role}
            onChange={(e) =>
              setManualUser((current) => ({
                ...current,
                role: e.target.value,
                account_id: '',
                carrier_id: '',
              }))
            }
            disabled={isDemo}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>

          <select
            value={manualUser.account_id}
            onChange={(e) => setManualUser((current) => ({ ...current, account_id: e.target.value }))}
            disabled={isDemo || manualUser.role !== 'shop'}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">Select shop account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.account_name}
              </option>
            ))}
          </select>

          <select
            value={manualUser.carrier_id}
            onChange={(e) => setManualUser((current) => ({ ...current, carrier_id: e.target.value }))}
            disabled={isDemo || manualUser.role !== 'carrier'}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">Select carrier / TPA</option>
            {carriers.map((carrier) => (
              <option key={carrier.id} value={carrier.id}>
                {carrier.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={isDemo || busyId === 'manual-user'}
            onClick={() => void createManualUser()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save Access
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-sm font-semibold text-slate-900">Pending Requests</div>
          <div className="mt-1 text-xs text-slate-500">Assign users before approving them.</div>
        </div>

        <div className="divide-y divide-slate-100">
          {pendingRequests.map((request) => {
            const selectedRole = getSelected(request.id, 'role', request.requested_role || 'carrier');

            return (
              <div key={request.id} className="grid gap-5 p-5 lg:grid-cols-[1.2fr_1.8fr]">
                <div>
                  <div className="font-semibold text-slate-900">{request.name || 'Unnamed request'}</div>
                  <div className="mt-1 text-sm text-slate-600">{request.email}</div>
                  <div className="mt-3 text-sm text-slate-600">
                    <div><b>Company:</b> {request.company_name || '—'}</div>
                    <div><b>Type:</b> {request.company_type || '—'}</div>
                    <div><b>Requested:</b> {request.requested_role || '—'}</div>
                    <div><b>Phone:</b> {request.phone || '—'}</div>
                    <div><b>Website:</b> {request.website || '—'}</div>
                  </div>
                  {request.notes ? (
                    <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                      <b>Notes:</b> {request.notes}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <select
                      value={selectedRole}
                      onChange={(e) => updateSelection(request.id, 'role', e.target.value)}
                      disabled={isDemo}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>

                    <select
                      value={getSelected(request.id, 'account_id')}
                      onChange={(e) => updateSelection(request.id, 'account_id', e.target.value)}
                      disabled={isDemo || selectedRole !== 'shop'}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <option value="">Select shop</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.account_name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={getSelected(request.id, 'carrier_id')}
                      onChange={(e) => updateSelection(request.id, 'carrier_id', e.target.value)}
                      disabled={isDemo || selectedRole !== 'carrier'}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <option value="">Create from company</option>
                      {carriers.map((carrier) => (
                        <option key={carrier.id} value={carrier.id}>
                          {carrier.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={isDemo || busyId === request.id}
                      onClick={() => void rejectRequest(request)}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={isDemo || busyId === request.id}
                      onClick={() => void approveRequest(request)}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {!pendingRequests.length ? (
            <div className="p-8 text-center text-sm text-slate-500">No pending access requests.</div>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-sm font-semibold text-slate-900">System Users</div>
          <div className="mt-1 text-xs text-slate-500">Edit role, linked organization, and access status.</div>
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
                    <td className="px-5 py-4 font-medium text-slate-900">{user.user_email}</td>

                    <td className="px-5 py-4">
                      <select
                        value={selectedRole}
                        onChange={(e) => updateSelection(user.user_email, 'role', e.target.value)}
                        disabled={isDemo}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
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
                          : user.role === 'demo'
                            ? 'Demo access'
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
                          disabled={isDemo || selectedRole !== 'shop'}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
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
                          disabled={isDemo || selectedRole !== 'carrier'}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
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
                          disabled={isDemo || busyId === user.user_email}
                          onClick={() => void saveUser(user)}
                          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Save
                        </button>

                        {status !== 'Active' ? (
                          <button
                            type="button"
                            disabled={isDemo || busyId === user.user_email}
                            onClick={() => void setUserStatus(user, 'Active')}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Reactivate
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={isDemo || busyId === user.user_email}
                              onClick={() => void setUserStatus(user, 'Suspended')}
                              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Suspend
                            </button>

                            <button
                              type="button"
                              disabled={isDemo || busyId === user.user_email}
                              onClick={() => void setUserStatus(user, 'Revoked')}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                  <td colSpan={6} className="py-12 text-center text-slate-500">No system users yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-sm font-semibold text-slate-900">Request History</div>
          <div className="mt-1 text-xs text-slate-500">Approved and rejected requests stay here and can be repaired or reopened.</div>
        </div>

        <div className="divide-y divide-slate-100">
          {historyRequests.map((request) => {
            const selectedRole = getSelected(request.id, 'role', request.requested_role || 'carrier');

            return (
              <div key={request.id} className="grid gap-5 p-5 lg:grid-cols-[1.3fr_1.7fr]">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-slate-900">{request.name || 'Unnamed request'}</div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadge(request.status)}`}>
                      {request.status}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">{request.email}</div>
                  <div className="mt-3 text-sm text-slate-600">
                    <div><b>Company:</b> {request.company_name || '—'}</div>
                    <div><b>Type:</b> {request.company_type || '—'}</div>
                    <div><b>Requested:</b> {request.requested_role || '—'}</div>
                    {request.notes ? <div><b>Notes:</b> {request.notes}</div> : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <select
                      value={selectedRole}
                      onChange={(e) => updateSelection(request.id, 'role', e.target.value)}
                      disabled={isDemo}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>

                    <select
                      value={getSelected(request.id, 'account_id')}
                      onChange={(e) => updateSelection(request.id, 'account_id', e.target.value)}
                      disabled={isDemo || selectedRole !== 'shop'}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <option value="">Select shop</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.account_name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={getSelected(request.id, 'carrier_id')}
                      onChange={(e) => updateSelection(request.id, 'carrier_id', e.target.value)}
                      disabled={isDemo || selectedRole !== 'carrier'}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <option value="">Create from company</option>
                      {carriers.map((carrier) => (
                        <option key={carrier.id} value={carrier.id}>
                          {carrier.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={isDemo || busyId === request.id}
                      onClick={() => void reopenRequest(request)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reopen
                    </button>

                    <button
                      type="button"
                      disabled={isDemo || busyId === `repair-${request.id}`}
                      onClick={() => void repairUserFromRequest(request)}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Create / Repair User
                    </button>

                    <button
                      type="button"
                      disabled={isDemo || busyId === request.id}
                      onClick={() => void archiveRequest(request)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Archive
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {!historyRequests.length ? (
            <div className="p-8 text-center text-sm text-slate-500">No request history yet.</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}