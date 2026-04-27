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

type NewContactForm = {
  full_name: string;
  email: string;
  mobile: string;
  phone: string;
  billing_city: string;
  billing_state: string;
  notes: string;
};

const YES_NO_UNKNOWN = ['Unknown', 'Yes', 'No'] as const;
const REPAIR_ONLY_OPTIONS = ['Unknown', 'Likely Yes', 'Yes', 'No'] as const;
const OUTREACH_OPTIONS = ['Not Contacted', 'Contacted', 'Replied', 'Qualified', 'Onboarded', 'Not a Fit'] as const;

const EMPTY_CONTACT: NewContactForm = {
  full_name: '',
  email: '',
  mobile: '',
  phone: '',
  billing_city: '',
  billing_state: '',
  notes: '',
};

function formatPhone(value?: string | null) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 11)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }
  return value ?? '';
}

function normalizePhoneForSave(value?: string | null) {
  return formatPhone(value)?.trim() || null;
}

export default function AccountDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [account, setAccount] = useState<AccountRow | null>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [newContact, setNewContact] = useState<NewContactForm>(EMPTY_CONTACT);

  useEffect(() => {
    async function load() {
      const [{ data: accountData }, { data: contactData }] = await Promise.all([
        supabase
          .from('accounts')
          .select(
            'id, account_name, street, city, state, postal_code, company_phone, company_email, glasweld_certified, insurance, uses_onyx, uses_zoom_injector, repair_only, outreach_status, notes'
          )
          .eq('id', id)
          .single(),
        supabase.from('contacts').select('*').eq('account_id', id).order('full_name'),
      ]);

      if (accountData) {
        setAccount({
          ...(accountData as AccountRow),
          company_phone: formatPhone((accountData as AccountRow).company_phone),
        });

        setNewContact((current) => ({
          ...current,
          billing_city: (accountData as AccountRow).city ?? '',
          billing_state: (accountData as AccountRow).state ?? '',
        }));
      }

      setContacts(
        ((contactData as ContactRow[]) ?? []).map((row) => ({
          ...row,
          mobile: formatPhone(row.mobile),
          phone: formatPhone(row.phone),
        }))
      );
    }

    void load();
  }, [id]);

  const headerStatus = useMemo(() => {
    if (!account) return 'Unknown';

    const fullyQualified =
      account.glasweld_certified === 'Yes' &&
      account.insurance === 'Yes' &&
      account.uses_onyx === 'Yes' &&
      account.uses_zoom_injector === 'Yes' &&
      account.repair_only === 'Yes' &&
      account.outreach_status === 'Onboarded';

    if (fullyQualified) return 'Fully Qualified';
    return 'In Progress';
  }, [account]);

  async function updateAccount(patch: Partial<AccountRow>) {
    if (!account) return;

    const cleanedPatch: Partial<AccountRow> = { ...patch };

    if (Object.prototype.hasOwnProperty.call(cleanedPatch, 'company_phone')) {
      cleanedPatch.company_phone = normalizePhoneForSave(cleanedPatch.company_phone);
    }
    if (Object.prototype.hasOwnProperty.call(cleanedPatch, 'state') && typeof cleanedPatch.state === 'string') {
      cleanedPatch.state = cleanedPatch.state.toUpperCase();
    }

    const { data } = await supabase
      .from('accounts')
      .update(cleanedPatch)
      .eq('id', account.id)
      .select(
        'id, account_name, street, city, state, postal_code, company_phone, company_email, glasweld_certified, insurance, uses_onyx, uses_zoom_injector, repair_only, outreach_status, notes'
      )
      .single();

    if (data) {
      setAccount({
        ...(data as AccountRow),
        company_phone: formatPhone((data as AccountRow).company_phone),
      });
    }
  }

  async function updateContact(contactId: string, patch: Partial<ContactRow>) {
    const cleanedPatch: Partial<ContactRow> = { ...patch };

    if (Object.prototype.hasOwnProperty.call(cleanedPatch, 'phone')) {
      cleanedPatch.phone = normalizePhoneForSave(cleanedPatch.phone);
    }
    if (Object.prototype.hasOwnProperty.call(cleanedPatch, 'mobile')) {
      cleanedPatch.mobile = normalizePhoneForSave(cleanedPatch.mobile);
    }
    if (Object.prototype.hasOwnProperty.call(cleanedPatch, 'billing_state') && typeof cleanedPatch.billing_state === 'string') {
      cleanedPatch.billing_state = cleanedPatch.billing_state.toUpperCase();
    }

    const { data } = await supabase.from('contacts').update(cleanedPatch).eq('id', contactId).select().single();
    if (data) {
      setContacts((current) =>
        current.map((row) =>
          row.id === contactId
            ? {
                ...(data as ContactRow),
                phone: formatPhone((data as ContactRow).phone),
                mobile: formatPhone((data as ContactRow).mobile),
              }
            : row
        )
      );
    }
  }

  async function deleteContact(contactId: string, name: string) {
    const confirmed = window.confirm(`Delete contact "${name || 'Unnamed Contact'}"?`);
    if (!confirmed) return;

    const { error } = await supabase.from('contacts').delete().eq('id', contactId);
    if (!error) {
      setContacts((current) => current.filter((row) => row.id !== contactId));
    }
  }

  async function addContact() {
    if (!account) return;
    if (!newContact.full_name.trim()) {
      window.alert('Contact name is required.');
      return;
    }

    setSavingContact(true);
    try {
      const payload = {
        account_id: account.id,
        account_name: account.account_name,
        full_name: newContact.full_name.trim(),
        first_name: null,
        last_name: null,
        email: newContact.email.trim() || null,
        mobile: normalizePhoneForSave(newContact.mobile),
        phone: normalizePhoneForSave(newContact.phone),
        billing_city: newContact.billing_city.trim() || null,
        billing_state: newContact.billing_state.trim().toUpperCase() || null,
        glasweld_certified: 'Unknown',
        contact_status: 'Active',
        notes: newContact.notes.trim() || null,
      };

      const { data, error } = await supabase.from('contacts').insert(payload).select().single();
      if (error) throw error;

      if (data) {
        setContacts((current) => [
          ...current,
          {
            ...(data as ContactRow),
            phone: formatPhone((data as ContactRow).phone),
            mobile: formatPhone((data as ContactRow).mobile),
          },
        ]);
      }

      setShowAddContact(false);
      setNewContact({
        ...EMPTY_CONTACT,
        billing_city: account.city ?? '',
        billing_state: account.state ?? '',
      });
    } catch {
      window.alert('That contact could not be added.');
    } finally {
      setSavingContact(false);
    }
  }

  function renderAccountTextCell(field: keyof AccountRow, label: string, options?: { phone?: boolean; upper?: boolean }) {
    if (!account) return null;

    const cellKey = `account-${String(field)}`;
    const isEditing = editingCell === cellKey;
    const rawValue = String(account[field] ?? '');
    const displayValue = options?.phone ? formatPhone(rawValue) : rawValue;

    return (
      <div className="space-y-1">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
        {isEditing ? (
          <input
            autoFocus
            className="w-full"
            value={rawValue}
            onChange={(e) => {
              const nextValue = options?.upper ? e.target.value.toUpperCase() : e.target.value;
              setAccount((current) => (current ? { ...current, [field]: nextValue } : current));
            }}
            onBlur={(e) => {
              const nextValue = options?.upper ? e.target.value.toUpperCase() : e.target.value;
              void updateAccount({ [field]: nextValue } as Partial<AccountRow>);
              setEditingCell(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditingCell(null);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingCell(cellKey)}
            className="group flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50"
          >
            <span className="truncate text-slate-800">{displayValue || '—'}</span>
            <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-400 opacity-0 transition group-hover:opacity-100" />
          </button>
        )}
      </div>
    );
  }

  function renderContactCell(contact: ContactRow, field: keyof ContactRow, options?: { phone?: boolean; upper?: boolean }) {
    const cellKey = `${contact.id}-${String(field)}`;
    const isEditing = editingCell === cellKey;
    const rawValue = String(contact[field] ?? '');
    const displayValue = options?.phone ? formatPhone(rawValue) : rawValue;

    if (isEditing) {
      return (
        <input
          autoFocus
          className="w-full"
          value={rawValue}
          onChange={(e) => {
            const nextValue = options?.upper ? e.target.value.toUpperCase() : e.target.value;
            setContacts((current) =>
              current.map((row) => (row.id === contact.id ? { ...row, [field]: nextValue } : row))
            );
          }}
          onBlur={(e) => {
            const nextValue = options?.upper ? e.target.value.toUpperCase() : e.target.value;
            void updateContact(contact.id, { [field]: nextValue } as Partial<ContactRow>);
            setEditingCell(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setEditingCell(null);
          }}
        />
      );
    }

    return (
      <button
        type="button"
        onClick={() => setEditingCell(cellKey)}
        className="group flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50"
      >
        <span className="truncate text-slate-800">{displayValue || '—'}</span>
        <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-400 opacity-0 transition group-hover:opacity-100" />
      </button>
    );
  }

  if (!account) {
    return <div className="p-6 text-slate-600">Loading account...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Link
            href="/accounts"
            className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-teal-700 hover:text-teal-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to accounts
          </Link>
          <h1 className="text-3xl font-semibold text-slate-900">{account.account_name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Inline-edit the account and its contacts from one page.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
          <span
            className={[
              'h-2.5 w-2.5 rounded-full',
              headerStatus === 'Fully Qualified' ? 'bg-green-600' : 'bg-yellow-500',
            ].join(' ')}
          />
          {headerStatus}
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Account details</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {renderAccountTextCell('street', 'Street')}
          {renderAccountTextCell('city', 'City')}
          {renderAccountTextCell('state', 'State', { upper: true })}
          {renderAccountTextCell('postal_code', 'Postal Code')}
          {renderAccountTextCell('company_phone', 'Phone', { phone: true })}
          {renderAccountTextCell('company_email', 'Email')}

          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Certified</div>
            <select
              value={account.glasweld_certified ?? 'Unknown'}
              onChange={(e) => void updateAccount({ glasweld_certified: e.target.value })}
            >
              {YES_NO_UNKNOWN.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Insurance</div>
            <select
              value={account.insurance ?? 'Unknown'}
              onChange={(e) => void updateAccount({ insurance: e.target.value as AccountRow['insurance'] })}
            >
              {YES_NO_UNKNOWN.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">ONYX</div>
            <select
              value={account.uses_onyx ?? 'Unknown'}
              onChange={(e) => void updateAccount({ uses_onyx: e.target.value as AccountRow['uses_onyx'] })}
            >
              {YES_NO_UNKNOWN.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Zoom Injector</div>
            <select
              value={account.uses_zoom_injector ?? 'Unknown'}
              onChange={(e) => void updateAccount({ uses_zoom_injector: e.target.value as AccountRow['uses_zoom_injector'] })}
            >
              {YES_NO_UNKNOWN.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Repair-Only</div>
            <select
              value={account.repair_only ?? 'Unknown'}
              onChange={(e) => void updateAccount({ repair_only: e.target.value as AccountRow['repair_only'] })}
            >
              {REPAIR_ONLY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Outreach Status</div>
            <select
              value={account.outreach_status ?? 'Not Contacted'}
              onChange={(e) => void updateAccount({ outreach_status: e.target.value as AccountRow['outreach_status'] })}
            >
              {OUTREACH_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div className="space-y-1 md:col-span-2 xl:col-span-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Notes</div>
            <textarea
              className="min-h-28"
              value={account.notes ?? ''}
              onChange={(e) => setAccount((current) => (current ? { ...current, notes: e.target.value } : current))}
              onBlur={(e) => void updateAccount({ notes: e.target.value })}
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Contacts</h2>
            <p className="mt-1 text-sm text-slate-500">Edit contacts inline or add a new one below.</p>
          </div>

          <button
            type="button"
            onClick={() => setShowAddContact((current) => !current)}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" />
            Add Contact
          </button>
        </div>

        {showAddContact ? (
          <div className="mb-6 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Contact Name</span>
              <input
                value={newContact.full_name}
                onChange={(e) => setNewContact((c) => ({ ...c, full_name: e.target.value }))}
                placeholder="Jane Smith"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Email</span>
              <input
                value={newContact.email}
                onChange={(e) => setNewContact((c) => ({ ...c, email: e.target.value }))}
                placeholder="jane@example.com"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Mobile</span>
              <input
                value={newContact.mobile}
                onChange={(e) => setNewContact((c) => ({ ...c, mobile: formatPhone(e.target.value) }))}
                placeholder="(555) 555-5555"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Phone</span>
              <input
                value={newContact.phone}
                onChange={(e) => setNewContact((c) => ({ ...c, phone: formatPhone(e.target.value) }))}
                placeholder="Optional"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">City</span>
              <input
                value={newContact.billing_city}
                onChange={(e) => setNewContact((c) => ({ ...c, billing_city: e.target.value }))}
                placeholder="City"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">State</span>
              <input
                value={newContact.billing_state}
                onChange={(e) => setNewContact((c) => ({ ...c, billing_state: e.target.value.toUpperCase() }))}
                placeholder="WA"
                maxLength={2}
              />
            </label>

            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Notes</span>
              <textarea
                className="min-h-24"
                value={newContact.notes}
                onChange={(e) => setNewContact((c) => ({ ...c, notes: e.target.value }))}
                placeholder="Anything useful about this contact."
              />
            </label>

            <div className="md:col-span-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddContact(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-700 hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void addContact()}
                disabled={savingContact}
                className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white hover:bg-teal-700 disabled:opacity-60"
              >
                {savingContact ? 'Saving...' : 'Save Contact'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-[1200px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                {['Name', 'Email', 'Mobile', 'Phone', 'City', 'State', 'Notes', 'Actions'].map((head) => (
                  <th key={head} className="px-4 py-3 font-semibold">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3 min-w-[200px]">{renderContactCell(contact, 'full_name')}</td>
                  <td className="px-4 py-3 min-w-[240px]">{renderContactCell(contact, 'email')}</td>
                  <td className="px-4 py-3 min-w-[170px]">{renderContactCell(contact, 'mobile', { phone: true })}</td>
                  <td className="px-4 py-3 min-w-[170px]">{renderContactCell(contact, 'phone', { phone: true })}</td>
                  <td className="px-4 py-3 min-w-[150px]">{renderContactCell(contact, 'billing_city')}</td>
                  <td className="px-4 py-3 min-w-[90px]">{renderContactCell(contact, 'billing_state', { upper: true })}</td>
                  <td className="px-4 py-3 min-w-[240px]">
                    <textarea
                      className="min-h-20 w-full"
                      value={contact.notes ?? ''}
                      onChange={(e) =>
                        setContacts((current) =>
                          current.map((row) => (row.id === contact.id ? { ...row, notes: e.target.value } : row))
                        )
                      }
                      onBlur={(e) => void updateContact(contact.id, { notes: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void deleteContact(contact.id, contact.full_name ?? '')}
                      className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 font-medium text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}

              {!contacts.length ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    No contacts yet for this account.
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
