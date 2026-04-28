'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react';
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
  glasweld_certified: string | null;
  insurance: string | null;
  uses_onyx: string | null;
  uses_zoom_injector: string | null;
  repair_only: string | null;
  outreach_status: string | null;
  notes: string | null;
};

type ContactRow = {
  id: string;
  account_id: string;
  account_name: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  phone: string | null;
  billing_city: string | null;
  billing_state: string | null;
  glasweld_certified: string | null;
  notes: string | null;
};

export default function AccountDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [account, setAccount] = useState<AccountRow | null>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, [id]);

  async function load() {
    setLoading(true);

    // 🔐 get logged in user
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email;

    // 🔐 check shop user
    const { data: shopUser } = await supabase
      .from('shop_users')
      .select('account_id')
      .eq('user_email', email)
      .maybeSingle();

    // get account
    const { data: accountData } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .single();

    // 🚫 BLOCK if shop user and not their account
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
    setContacts((contactData as ContactRow[]) || []);
    setLoading(false);
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

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

  if (!account) {
    return <div className="p-6">Account not found</div>;
  }

  return (
    <div className="space-y-6">
      <Link href="/accounts" className="text-blue-600 flex items-center gap-2">
        <ArrowLeft className="h-4 w-4" />
        Back to accounts
      </Link>

      <h1 className="text-2xl font-semibold">{account.account_name}</h1>

      <div className="rounded-xl border bg-white p-6">
        <div><strong>City:</strong> {account.city}</div>
        <div><strong>State:</strong> {account.state}</div>
        <div><strong>Phone:</strong> {account.company_phone}</div>
      </div>

      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Contacts</h2>

        {contacts.map((c) => (
          <div key={c.id} className="border-b py-2">
            {c.full_name} - {c.email}
          </div>
        ))}

        {!contacts.length && <div>No contacts</div>}
      </div>
    </div>
  );
}