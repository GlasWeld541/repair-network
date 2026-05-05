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
  website: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  notes: string | null;
};

type Contact = {
  id: string;
  full_name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean | null;
};

function cleanPhone(value: string | null) {
  return (value || '').replace(/\D/g, '');
}

function phoneHref(value: string | null) {
  const digits = cleanPhone(value);
  return digits ? `tel:${digits}` : '#';
}

function emailHref(value: string | null) {
  return value ? `mailto:${value}` : '#';
}

export default function CarrierDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [carrier, setCarrier] = useState<Carrier | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');

  useEffect(() => {
    void load();
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
      .order('is_primary', { ascending: false })
      .order('full_name');

    setCarrier(carrierData as Carrier);
    setContacts((contactData as Contact[]) || []);
    setLoading(false);
  }

  async function updateCarrier(field: keyof Carrier, value: string) {
    await supabase
      .from('carrier_organizations')
      .update({ [field]: value.trim() || null })
      .eq('id', id);

    await load();
  }

  async function addContact() {
    if (!newName.trim() && !newEmail.trim()) return;

    await supabase.from('carrier_contacts').insert({
      carrier_id: id,
      full_name: newName.trim() || null,
      title: newTitle.trim() || null,
      email: newEmail.trim() || null,
      phone: newPhone.trim() || null,
      is_primary: contacts.length === 0,
    });

    setNewName('');
    setNewTitle('');
    setNewEmail('');
    setNewPhone('');
    await load();
  }

  async function updateContact(
    contactId: string,
    field: keyof Contact,
    value: string | boolean
  ) {
    await supabase
      .from('carrier_contacts')
      .update({ [field]: value === '' ? null : value })
      .eq('id', contactId);

    await load();
  }

  async function setPrimaryContact(contactId: string) {
    await supabase
      .from('carrier_contacts')
      .update({ is_primary: false })
      .eq('carrier_id', id);

    await supabase
      .from('carrier_contacts')
      .update({ is_primary: true })
      .eq('id', contactId);

    await load();
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading...</div>;
  if (!carrier) return <div className="p-6">Carrier not found</div>;

  const primaryContact = contacts.find((contact) => contact.is_primary);

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-6 py-6">
      <Link href="/admin/carriers" className="text-sm text-blue-600">
        ← Back to Carriers
      </Link>

      <div>
        <EditableText
          value={carrier.organization_name}
          className="text-3xl font-semibold text-slate-900"
          onSave={(value) => updateCarrier('organization_name', value)}
        />
        <p className="mt-1 text-sm text-slate-500">
          Carrier / TPA profile, claims information, and contacts.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">
            General Information
          </h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              label="Claims Email"
              value={carrier.claims_email}
              onSave={(value) => updateCarrier('claims_email', value)}
            />
            <Field
              label="Claims Phone"
              value={carrier.claims_phone}
              onSave={(value) => updateCarrier('claims_phone', value)}
            />
            <Field
              label="Website"
              value={carrier.website}
              onSave={(value) => updateCarrier('website', value)}
            />
            <Field
              label="Street"
              value={carrier.street}
              onSave={(value) => updateCarrier('street', value)}
            />
            <Field
              label="City"
              value={carrier.city}
              onSave={(value) => updateCarrier('city', value)}
            />
            <Field
              label="State"
              value={carrier.state}
              onSave={(value) => updateCarrier('state', value)}
            />
            <Field
              label="ZIP"
              value={carrier.postal_code}
              onSave={(value) => updateCarrier('postal_code', value)}
            />
          </div>

          <div className="mt-5">
            <Field
              label="Notes"
              value={carrier.notes}
              onSave={(value) => updateCarrier('notes', value)}
              large
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Quick View</h2>

          <div className="mt-4 space-y-4 text-sm">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Claims
              </div>

              {carrier.claims_email ? (
                <a
                  href={emailHref(carrier.claims_email)}
                  className="mt-1 block text-blue-600 hover:underline"
                >
                  {carrier.claims_email}
                </a>
              ) : (
                <div className="mt-1 text-slate-500">No claims email</div>
              )}

              {carrier.claims_phone ? (
                <a
                  href={phoneHref(carrier.claims_phone)}
                  className="block text-blue-600 hover:underline"
                >
                  {carrier.claims_phone}
                </a>
              ) : (
                <div className="text-slate-500">No claims phone</div>
              )}
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Address
              </div>
              <div className="mt-1 text-slate-900">
                {[carrier.street, carrier.city, carrier.state, carrier.postal_code]
                  .filter(Boolean)
                  .join(', ') || 'No address entered'}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Primary Contact
              </div>

              {primaryContact ? (
                <div className="mt-1 space-y-1">
                  <div className="font-medium text-slate-900">
                    {primaryContact.full_name || 'Unnamed contact'}
                  </div>
                  {primaryContact.title ? (
                    <div className="text-slate-500">{primaryContact.title}</div>
                  ) : null}
                  {primaryContact.email ? (
                    <a
                      href={emailHref(primaryContact.email)}
                      className="block text-blue-600 hover:underline"
                    >
                      {primaryContact.email}
                    </a>
                  ) : null}
                  {primaryContact.phone ? (
                    <a
                      href={phoneHref(primaryContact.phone)}
                      className="block text-blue-600 hover:underline"
                    >
                      {primaryContact.phone}
                    </a>
                  ) : null}
                </div>
              ) : (
                <div className="mt-1 text-slate-500">No primary contact</div>
              )}
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Contacts
              </div>
              <div className="mt-1 text-slate-900">{contacts.length}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Contacts</h2>

        <div className="mt-5 space-y-3">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className={`rounded-xl border p-4 ${
                contact.is_primary
                  ? 'border-emerald-300 bg-emerald-50/50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="grid gap-3 md:grid-cols-5">
                <ContactField
                  label="Name"
                  value={contact.full_name}
                  onSave={(value) => updateContact(contact.id, 'full_name', value)}
                />
                <ContactField
                  label="Title"
                  value={contact.title}
                  onSave={(value) => updateContact(contact.id, 'title', value)}
                />
                <ContactField
                  label="Email"
                  value={contact.email}
                  isLink={Boolean(contact.email)}
                  href={emailHref(contact.email)}
                  onSave={(value) => updateContact(contact.id, 'email', value)}
                />
                <ContactField
                  label="Phone"
                  value={contact.phone}
                  isLink={Boolean(contact.phone)}
                  href={phoneHref(contact.phone)}
                  onSave={(value) => updateContact(contact.id, 'phone', value)}
                />

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Primary
                  </div>

                  {contact.is_primary ? (
                    <div className="mt-1 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                      Primary
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPrimaryContact(contact.id)}
                      className="mt-1 rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Make Primary
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {!contacts.length ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
              No contacts yet.
            </div>
          ) : null}
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Add Contact
          </h3>

          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
            />
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Title / Role"
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
            />
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Email"
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
            />
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="Phone"
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
            />
          </div>

          <button
            onClick={addContact}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Add Contact
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onSave,
  large = false,
}: {
  label: string;
  value: string | null;
  onSave: (value: string) => void;
  large?: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-1">
        <EditableText value={value || ''} onSave={onSave} large={large} />
      </div>
    </div>
  );
}

function ContactField({
  label,
  value,
  onSave,
  isLink = false,
  href = '#',
}: {
  label: string;
  value: string | null;
  onSave: (value: string) => void;
  isLink?: boolean;
  href?: string;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <EditableText
        value={value || ''}
        onSave={onSave}
        isLink={isLink}
        href={href}
      />
    </div>
  );
}

function EditableText({
  value,
  onSave,
  className = '',
  large = false,
  isLink = false,
  href = '#',
}: {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  large?: boolean;
  isLink?: boolean;
  href?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  if (editing) {
    if (large) {
      return (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (draft !== value) onSave(draft);
          }}
          className="min-h-[100px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      );
    }

    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft !== value) onSave(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className="h-9 w-full rounded-lg border border-slate-300 px-3 text-sm"
      />
    );
  }

  if (isLink && value) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="rounded px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 hover:underline"
        >
          {value}
        </a>

        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`block w-full rounded-lg px-2 py-1 text-left hover:bg-slate-100 ${
        className || 'text-sm text-slate-900'
      }`}
    >
      {value || '—'}
    </button>
  );
}