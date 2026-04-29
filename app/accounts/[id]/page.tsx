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

export default function AccountDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [account, setAccount] = useState<AccountRow | null>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<AccountRow | null>(null);

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
      .select('*')
      .eq('id', id)
      .single();

    if (shopUser?.account_id && shopUser.account_id !== id) {
      setBlocked(true);
      setLoading(false);
      return;
    }

    const { data: contactData } = await supabase
      .from('contacts')
      .select('*')
      .eq('account_id', id)
      .order('full_name');

    setAccount(accountData as AccountRow);
    setForm(accountData as AccountRow);
    setContacts((contactData as ContactRow[]) || []);
    setLoading(false);
  }

  async function saveAccount() {
    if (!form) return;

    await supabase
      .from('accounts')
      .update({
        account_name: form.account_name,
        city: form.city,
        state: form.state,
        company_phone: form.company_phone,
      })
      .eq('id', id);

    setEditing(false);
    await load();
  }

  async function addContact() {
    if (!newContactName) return;

    await supabase.from('contacts').insert({
      account_id: id,
      account_name: account?.account_name,
      full_name: newContactName,
      email: newContactEmail,
    });

    setNewContactName('');
    setNewContactEmail('');
    await load();
  }

  if (loading) return <div className="p-6">Loading...</div>;

  if (blocked) {
    return (
      <div className="p-10 text-center">
        <h1 className="text-xl font-semibold text-red-600">Access Denied</h1>
        <Link href="/accounts" className="text-blue-600 underline">
          Back
        </Link>
      </div>
    );
  }

  if (!account || !form) return <div className="p-6">Not found</div>;

  return (
    <div className="space-y-6">
      <Link href="/accounts" className="flex items-center gap-2 text-blue-600">
        <ArrowLeft className="h-4 w-4" />
        Back to accounts
      </Link>

      <h1 className="text-2xl font-semibold">{account.account_name}</h1>

      {/* ACCOUNT INFO */}
      <div className="rounded-xl border bg-white p-6 space-y-3">

        {editing ? (
          <>
            <input
              value={form.account_name}
              onChange={(e) => setForm({ ...form, account_name: e.target.value })}
              className="border p-2 w-full"
              placeholder="Account Name"
            />

            <input
              value={form.city || ''}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="border p-2 w-full"
              placeholder="City"
            />

            <input
              value={form.state || ''}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              className="border p-2 w-full"
              placeholder="State"
            />

            <input
              value={form.company_phone || ''}
              onChange={(e) => setForm({ ...form, company_phone: e.target.value })}
              className="border p-2 w-full"
              placeholder="Phone"
            />

            <button
              onClick={saveAccount}
              className="bg-green-600 text-white px-4 py-2 rounded"
            >
              Save
            </button>
          </>
        ) : (
          <>
            <div><strong>City:</strong> {account.city}</div>
            <div><strong>State:</strong> {account.state}</div>
            <div><strong>Phone:</strong> {account.company_phone}</div>

            <button
              onClick={() => setEditing(true)}
              className="bg-slate-900 text-white px-4 py-2 rounded mt-2"
            >
              Edit
            </button>
          </>
        )}
      </div>

      {/* CONTACTS */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Contacts</h2>

        {contacts.map((c) => (
          <div key={c.id} className="border-b py-2">
            {c.full_name} - {c.email}
          </div>
        ))}

        {!contacts.length && <div>No contacts</div>}

        {/* ADD CONTACT */}
        <div className="mt-4 space-y-2">
          <input
            value={newContactName}
            onChange={(e) => setNewContactName(e.target.value)}
            placeholder="Contact Name"
            className="border p-2 w-full"
          />

          <input
            value={newContactEmail}
            onChange={(e) => setNewContactEmail(e.target.value)}
            placeholder="Email"
            className="border p-2 w-full"
          />

          <button
            onClick={addContact}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Add Contact
          </button>
        </div>
      </div>
    </div>
  );
}