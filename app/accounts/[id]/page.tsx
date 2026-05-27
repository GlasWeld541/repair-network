'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type AccountRow = {
  id: string;
  account_name: string;
  street: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  company_phone: string | null;
  company_email: string | null;
};

type ContactRow = {
  id: string;
  account_id: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  phone: string | null;
};

type JobRow = {
  id: string;
  invoice_date: string | null;
  customer_name: string | null;
  vehicle_year: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  job_status: string | null;
  invoice_amount: number | null;
  amount_paid: number | null;
};

type UserRoleRow = {
  user_email: string;
  role: string;
  approved: boolean;
  access_status: string | null;
  account_id: string | null;
};

type EditingTarget =
  | { type: 'account'; field: keyof AccountRow }
  | { type: 'contact'; id: string; field: keyof ContactRow }
  | null;

function formatPhone(value: string | null) {
  const digits = String(value || '').replace(/\D/g, '');

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return value || '—';
}

function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 10);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function money(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function normalizeEmail(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function accessBadgeClass(status: string) {
  if (status === 'Active') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'Suspended') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'Revoked') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (status === 'Not Approved') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function AccountDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [account, setAccount] = useState<AccountRow | null>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [userRoles, setUserRoles] = useState<UserRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [busyContactId, setBusyContactId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);

  const [editing, setEditing] = useState<EditingTarget>(null);
  const [draftValue, setDraftValue] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');

  const [showCreateJob, setShowCreateJob] = useState(false);
  const [newJobCustomer, setNewJobCustomer] = useState('');
  const [newJobAmount, setNewJobAmount] = useState<number>(0);
  const [creatingJob, setCreatingJob] = useState(false);

  const isReadOnly = currentRole === 'demo';

  useEffect(() => {
    void load();
  }, [id]);

  function flashSaved(message = 'Saved') {
    setSavedMessage(message);
    window.setTimeout(() => setSavedMessage(''), 1800);
  }

  async function load() {
    setLoading(true);
    setBlocked(false);

    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email?.toLowerCase() || '';

    if (!email) {
      window.location.href = '/login';
      return;
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, account_id, approved, access_status')
      .eq('user_email', email)
      .maybeSingle();

    if (!roleData || roleData.approved !== true || roleData.access_status !== 'Active') {
      window.location.href = '/login';
      return;
    }

    setCurrentRole(roleData.role);

    const isAdmin = roleData.role === 'admin';
    const isShop = roleData.role === 'shop';
    const isDemo = roleData.role === 'demo';

    if (!isAdmin && !isShop && !isDemo) {
      setBlocked(true);
      setLoading(false);
      return;
    }

    if (isShop && (!roleData.account_id || roleData.account_id !== id)) {
      setBlocked(true);
      setLoading(false);
      return;
    }

    const { data: accountData, error: accountError } = await supabase
      .from('accounts')
      .select(
        'id, account_name, street, city, state, postal_code, company_phone, company_email'
      )
      .eq('id', id)
      .single();

    if (accountError || !accountData) {
      setAccount(null);
      setLoading(false);
      return;
    }

    const [{ data: contactData }, { data: jobData }, { data: roleRows }] =
      await Promise.all([
        supabase
          .from('contacts')
          .select('id, account_id, full_name, email, mobile, phone')
          .eq('account_id', id)
          .order('full_name'),
        supabase
          .from('jobs')
          .select(
            'id, invoice_date, customer_name, vehicle_year, vehicle_make, vehicle_model, job_status, invoice_amount, amount_paid'
          )
          .eq('assigned_account_id', id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('user_roles')
          .select('user_email, role, approved, access_status, account_id')
          .eq('account_id', id)
          .eq('role', 'shop'),
      ]);

    setAccount(accountData as AccountRow);
    setContacts((contactData as ContactRow[]) || []);
    setJobs((jobData as JobRow[]) || []);
    setUserRoles((roleRows as UserRoleRow[]) || []);
    setLoading(false);
  }

  function canManageAccess() {
    return currentRole === 'admin';
  }

  function roleForContact(contact: ContactRow) {
    const contactEmail = normalizeEmail(contact.email);
    if (!contactEmail) return null;

    return userRoles.find((role) => normalizeEmail(role.user_email) === contactEmail) || null;
  }

  function accessStatusForContact(contact: ContactRow) {
    const role = roleForContact(contact);

    if (!contact.email) return 'No Email';
    if (!role) return 'No Access';
    if (!role.approved) return 'Not Approved';

    return role.access_status || 'Active';
  }

  async function saveAccountField(field: keyof AccountRow) {
    if (isReadOnly) return;

    await supabase
      .from('accounts')
      .update({ [field]: draftValue.trim() || null })
      .eq('id', id);

    setEditing(null);
    flashSaved();
    await load();
  }

  async function saveContactField(contactId: string, field: keyof ContactRow) {
    if (isReadOnly) return;

    await supabase
      .from('contacts')
      .update({ [field]: draftValue.trim() || null })
      .eq('id', contactId);

    setEditing(null);
    flashSaved();
    await load();
  }

  async function addContact() {
    if (isReadOnly) return;

    if (!newContactName.trim() && !newContactEmail.trim() && !newContactPhone.trim()) {
      window.alert('Enter at least one contact field before adding.');
      return;
    }

    const { error } = await supabase.from('contacts').insert({
      account_id: id,
      full_name: newContactName.trim() || null,
      email: newContactEmail.trim().toLowerCase() || null,
      mobile: newContactPhone.trim() || null,
    });

    if (error) {
      window.alert(`Could not add contact: ${error.message}`);
      return;
    }

    setNewContactName('');
    setNewContactEmail('');
    setNewContactPhone('');
    flashSaved('Contact added');
    await load();
  }

  async function createJobFromAccount() {
    if (isReadOnly) return;
    if (!account) return;

    if (!newJobCustomer.trim()) {
      window.alert('Customer name is required.');
      return;
    }

    setCreatingJob(true);

    const { data, error } = await supabase
      .from('jobs')
      .insert({
        customer_name: newJobCustomer.trim(),
        assigned_account_id: account.id,
        assigned_account_name: account.account_name,
        job_status: 'New',
        invoice_amount: Number(newJobAmount || 0),
        amount_paid: 0,
        invoice_date: todayIso(),
      })
      .select('id')
      .single();

    setCreatingJob(false);

    if (error) {
      window.alert(`Could not create job: ${error.message}`);
      return;
    }

    setShowCreateJob(false);
    setNewJobCustomer('');
    setNewJobAmount(0);
    flashSaved('Job created');

    if (data?.id) {
      window.location.href = `/jobs/${data.id}`;
    }
  }

  async function grantAccessAndSendInvite(contact: ContactRow) {
    if (isReadOnly) return;

    if (!canManageAccess()) {
      window.alert('Only admins can grant login access.');
      return;
    }

    const contactEmail = normalizeEmail(contact.email);

    if (!contactEmail) {
      window.alert('Contact must have an email before access can be granted.');
      return;
    }

    setBusyContactId(contact.id);

    const { error: accessError } = await supabase.from('user_roles').upsert(
      {
        user_email: contactEmail,
        role: 'shop',
        approved: true,
        access_status: 'Active',
        account_id: id,
        carrier_id: null,
      },
      { onConflict: 'user_email' }
    );

    if (accessError) {
      setBusyContactId(null);
      window.alert(`Could not grant access: ${accessError.message}`);
      return;
    }

    const res = await fetch('/api/invite-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: contactEmail }),
    });

    let result: { error?: string; success?: boolean } = {};

    try {
      result = await res.json();
    } catch {
      result = {};
    }

    setBusyContactId(null);

    if (!res.ok) {
      window.alert(
        result.error ||
          'Access was created, but the invite email could not be sent.'
      );
      await load();
      return;
    }

    flashSaved('Access granted and invite sent');
    await load();
  }

  async function suspendLoginAccess(contact: ContactRow) {
    if (isReadOnly) return;

    if (!canManageAccess()) {
      window.alert('Only admins can suspend login access.');
      return;
    }

    const contactEmail = normalizeEmail(contact.email);

    if (!contactEmail) return;

    setBusyContactId(contact.id);

    const { error } = await supabase
      .from('user_roles')
      .update({
        access_status: 'Suspended',
        approved: false,
      })
      .eq('user_email', contactEmail);

    setBusyContactId(null);

    if (error) {
      window.alert(`Could not suspend access: ${error.message}`);
      return;
    }

    flashSaved('Access suspended');
    await load();
  }

  async function reactivateAndSendInvite(contact: ContactRow) {
    if (isReadOnly) return;
    await grantAccessAndSendInvite(contact);
  }

  function startAccountEdit(field: keyof AccountRow, value: string | null) {
    if (isReadOnly) return;

    setEditing({ type: 'account', field });
    setDraftValue(
      field === 'company_phone' ? formatPhoneInput(value || '') : value || ''
    );
  }

  function startContactEdit(
    contactId: string,
    field: keyof ContactRow,
    value: string | null
  ) {
    if (isReadOnly) return;

    setEditing({ type: 'contact', id: contactId, field });
    setDraftValue(
      field === 'mobile' || field === 'phone' ? formatPhoneInput(value || '') : value || ''
    );
  }

  function AccountField({
    label,
    field,
    value,
    isPhone = false,
    isEmail = false,
  }: {
    label: string;
    field: keyof AccountRow;
    value: string | null;
    isPhone?: boolean;
    isEmail?: boolean;
  }) {
    const isEditing = editing?.type === 'account' && editing.field === field;

    return (
      <div className="grid gap-1">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {label}
        </div>

        {isEditing && !isReadOnly ? (
          <input
            autoFocus
            value={draftValue}
            onChange={(e) =>
              setDraftValue(isPhone ? formatPhoneInput(e.target.value) : e.target.value)
            }
            onBlur={() => void saveAccountField(field)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setEditing(null);
            }}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
        ) : (
          <div className="flex items-center gap-2">
            {isPhone && value ? (
              <a href={`tel:${value}`} className="rounded px-1 py-1 text-sm text-brand-700 hover:bg-slate-100">
                {formatPhone(value)}
              </a>
            ) : isEmail && value ? (
              <a href={`mailto:${value}`} className="rounded px-1 py-1 text-sm text-brand-700 hover:bg-slate-100">
                {value}
              </a>
            ) : isReadOnly ? (
              <span className="rounded px-1 py-1 text-sm text-slate-900">
                {value || '—'}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => startAccountEdit(field, value)}
                className="rounded px-1 py-1 text-left text-sm hover:bg-slate-100"
              >
                {value || '—'}
              </button>
            )}

            {(isPhone || isEmail) && !isReadOnly && (
              <button
                type="button"
                onClick={() => startAccountEdit(field, value)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  function ContactField({
    contact,
    field,
    isPhone = false,
    isEmail = false,
  }: {
    contact: ContactRow;
    field: keyof ContactRow;
    isPhone?: boolean;
    isEmail?: boolean;
  }) {
    const value = contact[field] as string | null;
    const isEditing =
      editing?.type === 'contact' &&
      editing.id === contact.id &&
      editing.field === field;

    if (isEditing && !isReadOnly) {
      return (
        <input
          autoFocus
          value={draftValue}
          onChange={(e) =>
            setDraftValue(isPhone ? formatPhoneInput(e.target.value) : e.target.value)
          }
          onBlur={() => void saveContactField(contact.id, field)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setEditing(null);
          }}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        />
      );
    }

    return (
      <div className="flex items-center gap-2">
        {isPhone && value ? (
          <a href={`tel:${value}`} className="rounded px-1 py-1 text-sm text-brand-700 hover:bg-slate-100">
            {formatPhone(value)}
          </a>
        ) : isEmail && value ? (
          <a href={`mailto:${value}`} className="rounded px-1 py-1 text-sm text-brand-700 hover:bg-slate-100">
            {value}
          </a>
        ) : isReadOnly ? (
          <span className="rounded px-1 py-1 text-sm text-slate-900">
            {isPhone ? formatPhone(value) : value || '—'}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => startContactEdit(contact.id, field, value)}
            className="rounded px-1 py-1 text-left text-sm hover:bg-slate-100"
          >
            {isPhone ? formatPhone(value) : value || '—'}
          </button>
        )}

        {(isPhone || isEmail) && !isReadOnly && (
          <button
            type="button"
            onClick={() => startContactEdit(contact.id, field, value)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  if (loading) return <div className="p-6">Loading...</div>;

  if (blocked) {
    return (
      <div className="p-10 text-center">
        <h1 className="text-xl font-semibold text-rose-700">Access Denied</h1>
        <p className="mt-2 text-slate-500">
          You do not have permission to view this account.
        </p>
        <Link href="/accounts" className="mt-4 inline-block text-brand-700 underline">
          Back to Accounts
        </Link>
      </div>
    );
  }

  if (!account) return <div className="p-6">Account not found</div>;

  const titleEditing =
    editing?.type === 'account' && editing.field === 'account_name';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/accounts" className="flex items-center gap-2 text-brand-700">
          <ArrowLeft className="h-4 w-4" />
          Back to accounts
        </Link>

        <div className="flex items-center gap-2">
          {savedMessage ? (
            <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              <Check className="h-4 w-4" />
              {savedMessage}
            </div>
          ) : null}

          {isReadOnly ? (
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              Demo View Only
            </div>
          ) : null}
        </div>
      </div>

      <div>
        {titleEditing && !isReadOnly ? (
          <input
            autoFocus
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onBlur={() => void saveAccountField('account_name')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setEditing(null);
            }}
            className="rounded border border-slate-300 px-3 py-2 text-2xl font-semibold"
          />
        ) : isReadOnly ? (
          <div className="text-2xl font-semibold">{account.account_name}</div>
        ) : (
          <button
            type="button"
            onClick={() => startAccountEdit('account_name', account.account_name)}
            className="rounded text-left text-2xl font-semibold hover:bg-slate-100"
          >
            {account.account_name}
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
        <h2 className="mb-4 text-lg font-semibold">Account Info</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <AccountField label="Street" field="street" value={account.street} />
          <AccountField label="City" field="city" value={account.city} />
          <AccountField label="State" field="state" value={account.state} />
          <AccountField label="ZIP" field="postal_code" value={account.postal_code} />
          <AccountField
            label="Business Phone"
            field="company_phone"
            value={account.company_phone}
            isPhone
          />
          <AccountField
            label="Business Email"
            field="company_email"
            value={account.company_email}
            isEmail
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
        <h2 className="mb-4 text-lg font-semibold">Contacts & Login Access</h2>

        <div className="space-y-2">
          {contacts.map((contact) => {
            const accessStatus = accessStatusForContact(contact);
            const hasAccess = accessStatus !== 'No Access' && accessStatus !== 'No Email';

            return (
              <div
                key={contact.id}
                className="grid gap-3 border-b py-4 md:grid-cols-[1fr_1.35fr_1fr_1fr_1fr_1.7fr]"
              >
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Name
                  </div>
                  <ContactField contact={contact} field="full_name" />
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Email
                  </div>
                  <ContactField contact={contact} field="email" isEmail />
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Mobile
                  </div>
                  <ContactField contact={contact} field="mobile" isPhone />
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Other Phone
                  </div>
                  <ContactField contact={contact} field="phone" isPhone />
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Access
                  </div>
                  <span
                    className={`mt-1 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${accessBadgeClass(accessStatus)}`}
                  >
                    {accessStatus}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {canManageAccess() || isReadOnly ? (
                    <>
                      {!hasAccess || accessStatus === 'Revoked' || accessStatus === 'Not Approved' ? (
                        <button
                          type="button"
                          disabled={busyContactId === contact.id || isReadOnly}
                          onClick={() => void grantAccessAndSendInvite(contact)}
                          className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Grant Access
                        </button>
                      ) : accessStatus === 'Suspended' ? (
                        <button
                          type="button"
                          disabled={busyContactId === contact.id || isReadOnly}
                          onClick={() => void reactivateAndSendInvite(contact)}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Reactivate
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={busyContactId === contact.id || isReadOnly}
                            onClick={() => void grantAccessAndSendInvite(contact)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Resend Invite
                          </button>

                          <button
                            type="button"
                            disabled={busyContactId === contact.id || isReadOnly}
                            onClick={() => void suspendLoginAccess(contact)}
                            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Suspend
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-slate-400">
                      Managed by GlasWeld
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {!contacts.length ? (
            <div className="text-sm text-slate-500">No contacts</div>
          ) : null}
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="mb-3 font-semibold">Add Contact</h3>

          <div className="grid gap-3 md:grid-cols-4">
            <input
              value={newContactName}
              onChange={(e) => setNewContactName(e.target.value)}
              placeholder="Contact name"
              disabled={isReadOnly}
              className="rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            />

            <input
              value={newContactEmail}
              onChange={(e) => setNewContactEmail(e.target.value)}
              placeholder="Email"
              disabled={isReadOnly}
              className="rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            />

            <input
              value={newContactPhone}
              onChange={(e) => setNewContactPhone(formatPhoneInput(e.target.value))}
              placeholder="Contact phone"
              disabled={isReadOnly}
              className="rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            />

            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => void addContact()}
              className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add Contact
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Jobs</h2>

          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => setShowCreateJob((value) => !value)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Add Job
          </button>
        </div>

        {showCreateJob && !isReadOnly ? (
          <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-3 font-semibold">Add Job for {account.account_name}</h3>

            <div className="grid gap-3 md:grid-cols-3">
              <input
                value={newJobCustomer}
                onChange={(e) => setNewJobCustomer(e.target.value)}
                placeholder="Customer name"
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              />

              <input
                type="number"
                step="0.01"
                value={newJobAmount}
                onChange={(e) => setNewJobAmount(Number(e.target.value))}
                placeholder="Invoice amount"
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={creatingJob}
                  onClick={() => void createJobFromAccount()}
                  className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {creatingJob ? 'Creating...' : 'Create Job'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowCreateJob(false)}
                  className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {jobs.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Vehicle</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Invoice</th>
                  <th className="px-3 py-2">Paid</th>
                  <th className="px-3 py-2">Open</th>
                </tr>
              </thead>

              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-t">
                    <td className="px-3 py-2">{job.invoice_date || '—'}</td>
                    <td className="px-3 py-2">{job.customer_name || '—'}</td>
                    <td className="px-3 py-2">
                      {[job.vehicle_year, job.vehicle_make, job.vehicle_model]
                        .filter(Boolean)
                        .join(' ') || '—'}
                    </td>
                    <td className="px-3 py-2">{job.job_status || '—'}</td>
                    <td className="px-3 py-2">{money(job.invoice_amount)}</td>
                    <td className="px-3 py-2">{money(job.amount_paid)}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/jobs/${job.id}`}
                        className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-slate-500">No recent jobs for this account.</div>
        )}
      </div>
    </div>
  );
}
