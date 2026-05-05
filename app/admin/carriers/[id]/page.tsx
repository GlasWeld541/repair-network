'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Carrier = {
  id: string;
  organization_name: string;
  claims_email: string | null;
  claims_phone: string | null;
};

type Contact = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

export default function CarrierDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [carrier, setCarrier] = useState<Carrier | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    setLoading(true);

    const { data: carrierData } = await supabase
      .from('carrier_organizations')
      .select('*')
      .eq('id', id)
      .single();

    const { data: contactData } = await supabase
      .from('carrier_contacts')
      .select('*')
      .eq('carrier_id', id)
      .order('full_name');

    setCarrier(carrierData as Carrier);
    setContacts((contactData as Contact[]) || []);
    setLoading(false);
  }

  async function updateField(field: keyof Carrier, value: string) {
    await supabase
      .from('carrier_organizations')
      .update({ [field]: value || null })
      .eq('id', id);

    await load();
  }

  async function addContact() {
    if (!newName.trim()) return;

    await supabase.from('carrier_contacts').insert({
      carrier_id: id,
      full_name: newName,
      email: newEmail,
      phone: newPhone,
    });

    setNewName('');
    setNewEmail('');
    setNewPhone('');
    await load();
  }

  async function updateContact(
    contactId: string,
    field: keyof Contact,
    value: string
  ) {
    await supabase
      .from('carrier_contacts')
      .update({ [field]: value || null })
      .eq('id', contactId);

    await load();
  }

  if (loading) return <div className="p-6">Loading...</div>;
  if (!carrier) return <div className="p-6">Not found</div>;

  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-6 py-6">
      <Link href="/admin/carriers" className="text-blue-600">
        ← Back to Carriers
      </Link>

      {/* CARRIER */}
      <h1 className="text-2xl font-semibold">
        {carrier.organization_name}
      </h1>

      <div className="rounded-xl border bg-white p-6 space-y-4">
        <Editable
          label="Claims Email"
          value={carrier.claims_email}
          onSave={(v) => updateField('claims_email', v)}
        />

        <Editable
          label="Claims Phone"
          value={carrier.claims_phone}
          onSave={(v) => updateField('claims_phone', v)}
        />
      </div>

      {/* CONTACTS */}
      <div className="rounded-xl border bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold">Contacts</h2>

        {contacts.map((c) => (
          <div key={c.id} className="border-b pb-2">
            <Editable
              label="Name"
              value={c.full_name}
              onSave={(v) => updateContact(c.id, 'full_name', v)}
            />
            <Editable
              label="Email"
              value={c.email}
              onSave={(v) => updateContact(c.id, 'email', v)}
            />
            <Editable
              label="Phone"
              value={c.phone}
              onSave={(v) => updateContact(c.id, 'phone', v)}
            />
          </div>
        ))}

        {!contacts.length && <div>No contacts yet</div>}

        {/* ADD */}
        <div className="pt-4 space-y-2">
          <input
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="border p-2 w-full"
          />
          <input
            placeholder="Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="border p-2 w-full"
          />
          <input
            placeholder="Phone"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            className="border p-2 w-full"
          />

          <button
            onClick={addContact}
            className="bg-black text-white px-4 py-2"
          >
            Add Contact
          </button>
        </div>
      </div>
    </div>
  );
}

function Editable({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string | null;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  if (editing) {
    return (
      <div>
        <strong>{label}:</strong>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            onSave(draft);
          }}
          className="ml-2 border px-2"
        />
      </div>
    );
  }

  return (
    <div onClick={() => setEditing(true)}>
      <strong>{label}:</strong> {value || '—'}
    </div>
  );
}