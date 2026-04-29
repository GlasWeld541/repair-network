'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
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

export default function AccountDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [account, setAccount] = useState<AccountRow | null>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);

  const [editing, setEditing] = useState<EditingTarget>(null);
  const [draftValue, setDraftValue] = useState('');

  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');

  useEffect(() => {
    void load();
  }, [id]);

  async function load() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email;

    const { data: shopUser } = await supabase
      .from('shop_users')
      .select('account_id')
      .eq('user_email', email)
      .maybeSingle();

    const { data: accountData } = await supabase
      .from('accounts')
      .select(
        'id, account_name, street, city, state, postal_code, company_phone, company_email'
      )
      .eq('id', id)
      .single();

    if (shopUser?.account_id && shopUser.account_id !== id) {
      setBlocked(true);
      setLoading(false);
      return;
    }

    const { data: contactData } = await supabase
      .from('contacts')
      .select('id, account_id, full_name, email, mobile, phone')
      .eq('account_id', id)
      .order('full_name');

    setAccount(accountData as AccountRow);
    setContacts((contactData as ContactRow[]) || []);
    setLoading(false);
  }

  async function saveAccountField(field: keyof AccountRow) {
    await supabase
      .from('accounts')
      .update({ [field]: draftValue.trim() || null })
      .eq('id', id);

    setEditing(null);
    await load();
  }

  async function saveContactField(contactId: string, field: keyof ContactRow) {
    await supabase
      .from('contacts')
      .update({ [field]: draftValue.trim() || null })
      .eq('id', contactId);

    setEditing(null);
    await load();
  }

  async function addContact() {
    if (!newContactName.trim() && !newContactEmail.trim() && !newContactPhone.trim()) {
      return;
    }

    await supabase.from('contacts').insert({
      account_id: id,
      account_name: account?.account_name,
      full_name: newContactName.trim() || null,
      email: newContactEmail.trim() || null,
      mobile: newContactPhone.trim() || null,
    });

    setNewContactName('');
    setNewContactEmail('');
    setNewContactPhone('');
    await load();
  }

  function startAccountEdit(field: keyof AccountRow, value: string | null) {
    setEditing({ type: 'account', field });
    setDraftValue(value || '');
  }

  function startContactEdit(
    contactId: string,
    field: keyof ContactRow,
    value: string | null
  ) {
    setEditing({ type: 'contact', id: contactId, field });
    setDraftValue(value || '');
  }

  function AccountField({
    label,
    field,
    value,
    isPhone = false,
  }: {
    label: string;
    field: keyof AccountRow;
    value: string | null;
    isPhone?: boolean;
  }) {
    const isEditing = editing?.type === 'account' && editing.field === field;

    return (
      <div className="grid gap-1">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {label}
        </div>

        {isEditing ? (
          <input
            autoFocus
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onBlur={() => void saveAccountField(field)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
        ) : (
          <button
            type="button"
            onClick={() => startAccountEdit(field, value)}
            className="rounded px-1 py-1 text-left text-sm hover:bg-slate-100"
          >
            {isPhone ? formatPhone(value) : value || '—'}
          </button>
        )}
      </div>
    );
  }

  function ContactField({
    contact,
    field,
    isPhone = false,
  }: {
    contact: ContactRow;
    field: keyof ContactRow;
    isPhone?: boolean;
  }) {
    const value = contact[field] as string | null;
    const isEditing =
      editing?.type === 'contact' &&
      editing.id === contact.id &&
      editing.field === field;

    if (isEditing) {
      return (
        <input
          autoFocus
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          onBlur={() => void saveContactField(contact.id, field)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        />
      );
    }

    return (
      <button
        type="button"
        onClick={() => startContactEdit(contact.id, field, value)}
        className="rounded px-1 py-1 text-left text-sm hover:bg-slate-100"
      >
        {isPhone ? formatPhone(value) : value || '—'}
      </button>
    );
  }

  if (loading) return <div className="p-6">Loading...</div>;

  if (blocked) {
    return (
      <div className="p-10 text-center">
        <h1 className="text-xl font-semibold text-red-600">Access Denied</h1>
        <p className="mt-2 text-slate-500">
          You do not have permission to view this account.
        </p>
        <Link href="/accounts" className="mt-4 inline-block text-blue-600 underline">
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
      <Link href="/accounts" className="flex items-center gap-2 text-blue-600">
        <ArrowLeft className="h-4 w-4" />
        Back to accounts
      </Link>

      <div>
        {titleEditing ? (
          <input
            autoFocus
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onBlur={() => void saveAccountField('account_name')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="rounded border border-slate-300 px-3 py-2 text-2xl font-semibold"
          />
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

      <div className="rounded-xl border bg-white p-6">
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
          />
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Contacts</h2>

        <div className="space-y-2">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="grid gap-3 border-b py-3 md:grid-cols-4"
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
                <ContactField contact={contact} field="email" />
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
            </div>
          ))}

          {!contacts.length ? (
            <div className="text-sm text-slate-500">No contacts</div>
          ) : null}
        </div>

        <div className="mt-6 rounded-xl border bg-slate-50 p-4">
          <h3 className="mb-3 font-semibold">Add Contact</h3>

          <div className="grid gap-3 md:grid-cols-4">
            <input
              value={newContactName}
              onChange={(e) => setNewContactName(e.target.value)}
              placeholder="Contact name"
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            />

            <input
              value={newContactEmail}
              onChange={(e) => setNewContactEmail(e.target.value)}
              placeholder="Email"
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            />

            <input
              value={newContactPhone}
              onChange={(e) => setNewContactPhone(e.target.value)}
              placeholder="Contact phone"
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            />

            <button
              type="button"
              onClick={() => void addContact()}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Add Contact
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}