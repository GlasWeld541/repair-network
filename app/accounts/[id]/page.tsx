'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type AccountRow = {
  id: string;
  account_name: string;
  city: string | null;
  state: string | null;
  company_phone: string | null;
};

type ContactRow = {
  id: string;
  account_id: string;
  full_name: string | null;
  email: string | null;
};

type EditingTarget =
  | { type: 'account'; field: keyof AccountRow }
  | { type: 'contact'; id: string; field: keyof ContactRow }
  | null;

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
      .select('id, account_name, city, state, company_phone')
      .eq('id', id)
      .single();

    if (shopUser?.account_id && shopUser.account_id !== id) {
      setBlocked(true);
      setLoading(false);
      return;
    }

    const { data: contactData } = await supabase
      .from('contacts')
      .select('id, account_id, full_name, email')
      .eq('account_id', id)
      .order('full_name');

    setAccount(accountData as AccountRow);
    setContacts((contactData as ContactRow[]) || []);
    setLoading(false);
  }

  async function saveAccountField(field: keyof AccountRow) {
    await supabase
      .from('accounts')
      .update({ [field]: draftValue })
      .eq('id', id);

    setEditing(null);
    await load();
  }

  async function saveContactField(contactId: string, field: keyof ContactRow) {
    await supabase
      .from('contacts')
      .update({ [field]: draftValue })
      .eq('id', contactId);

    setEditing(null);
    await load();
  }

  async function addContact() {
    if (!newContactName.trim() && !newContactEmail.trim()) return;

    await supabase.from('contacts').insert({
      account_id: id,
      account_name: account?.account_name,
      full_name: newContactName.trim() || null,
      email: newContactEmail.trim() || null,
    });

    setNewContactName('');
    setNewContactEmail('');
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

  function AccountField({
    label,
    field,
    value,
  }: {
    label: string;
    field: keyof AccountRow;
    value: string | null;
  }) {
    const isEditing = editing?.type === 'account' && editing.field === field;

    return (
      <div className="flex items-center gap-2">
        <strong>{label}:</strong>

        {isEditing ? (
          <input
            autoFocus
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onBlur={() => void saveAccountField(field)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
        ) : (
          <button
            type="button"
            onClick={() => startAccountEdit(field, value)}
            className="rounded px-1 text-left hover:bg-slate-100"
          >
            {value || '—'}
          </button>
        )}
      </div>
    );
  }

  function ContactField({
    contact,
    field,
  }: {
    contact: ContactRow;
    field: keyof ContactRow;
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
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        />
      );
    }

    return (
      <button
        type="button"
        onClick={() => startContactEdit(contact.id, field, value)}
        className="rounded px-1 text-left hover:bg-slate-100"
      >
        {value || '—'}
      </button>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/accounts" className="flex items-center gap-2 text-blue-600">
        <ArrowLeft className="h-4 w-4" />
        Back to accounts
      </Link>

      <h1
        className="inline-block cursor-pointer rounded text-2xl font-semibold hover:bg-slate-100"
        onClick={() => startAccountEdit('account_name', account.account_name)}
      >
        {editing?.type === 'account' && editing.field === 'account_name' ? (
          <input
            autoFocus
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onBlur={() => void saveAccountField('account_name')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            className="rounded border border-slate-300 px-2 py-1 text-2xl font-semibold"
          />
        ) : (
          account.account_name
        )}
      </h1>

      <div className="rounded-xl border bg-white p-6 space-y-2">
        <AccountField label="City" field="city" value={account.city} />
        <AccountField label="State" field="state" value={account.state} />
        <AccountField label="Phone" field="company_phone" value={account.company_phone} />
      </div>

      <div className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Contacts</h2>

        <div className="space-y-2">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="grid gap-3 border-b py-3 md:grid-cols-2"
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
            </div>
          ))}

          {!contacts.length ? (
            <div className="text-sm text-slate-500">No contacts</div>
          ) : null}
        </div>

        <div className="mt-6 rounded-xl border bg-slate-50 p-4">
          <h3 className="mb-3 font-semibold">Add Contact</h3>

          <div className="grid gap-3 md:grid-cols-3">
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