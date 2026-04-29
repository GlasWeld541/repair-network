'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Search, ArrowLeft, UserPlus, X, Pencil, Check } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Contact } from '@/lib/types';

type NewContactForm = {
  account_id: string;
  account_name: string;
  billing_city: string;
  billing_state: string;
  full_name: string;
  email: string;
  mobile: string;
  phone: string;
  notes: string;
};

type ShopUser = {
  account_id: string;
  account_name: string | null;
};

type EditingCell = {
  id: string;
  field: keyof Contact;
} | null;

const EMPTY_CONTACT_FORM: NewContactForm = {
  account_id: '',
  account_name: '',
  billing_city: '',
  billing_state: '',
  full_name: '',
  email: '',
  mobile: '',
  phone: '',
  notes: '',
};

function formatPhone(value?: string | null) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 11)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }

  return value ?? '';
}

function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 10);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function normalizePhoneForSave(value?: string | null) {
  return formatPhone(value)?.trim() || null;
}

function ContactsPageContent() {
  const searchParams = useSearchParams();

  const accountIdFilter = searchParams.get('accountId');
  const accountNameFilter = searchParams.get('accountName');

  const [rows, setRows] = useState<Contact[]>([]);
  const [query, setQuery] = useState('');
  const [shopUser, setShopUser] = useState<ShopUser | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [savingNewContact, setSavingNewContact] = useState(false);

  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [draftValue, setDraftValue] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  const [newContact, setNewContact] = useState<NewContactForm>({
    ...EMPTY_CONTACT_FORM,
    account_id: accountIdFilter ?? '',
    account_name: accountNameFilter ?? '',
  });

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountIdFilter]);

  function flashSaved() {
    setSavedMessage('Saved');
    window.setTimeout(() => setSavedMessage(''), 1200);
  }

  async function load() {
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email?.toLowerCase() || '';

    let currentShopUser: ShopUser | null = null;

    if (email) {
      const { data: shopData } = await supabase
        .from('shop_users')
        .select('account_id, account_name')
        .eq('user_email', email)
        .maybeSingle();

      currentShopUser = (shopData as ShopUser | null) || null;
      setShopUser(currentShopUser);
    }

    let queryBuilder = supabase
      .from('contacts')
      .select('*')
      .order('account_name')
      .limit(2000);

    if (currentShopUser?.account_id) {
      queryBuilder = queryBuilder.eq('account_id', currentShopUser.account_id);
    } else if (accountIdFilter) {
      queryBuilder = queryBuilder.eq('account_id', accountIdFilter);
    }

    const { data } = await queryBuilder;

    const normalized = ((data as Contact[]) ?? []).map((row) => ({
      ...row,
      mobile: formatPhone(row.mobile),
      phone: formatPhone(row.phone),
    }));

    setRows(normalized);
  }

  const filtered = useMemo(() => {
    return rows.filter((row) =>
      `${row.account_name} ${row.full_name ?? ''} ${row.email ?? ''} ${row.mobile ?? ''} ${row.phone ?? ''} ${row.billing_city ?? ''} ${row.billing_state ?? ''}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  }, [rows, query]);

  async function updateRow(id: string, patch: Partial<Contact>) {
    const rowBeingEdited = rows.find((row) => row.id === id);

    if (shopUser?.account_id && rowBeingEdited?.account_id !== shopUser.account_id) {
      window.alert('You do not have permission to edit this contact.');
      return;
    }

    const cleanedPatch: Partial<Contact> = { ...patch };

    if (Object.prototype.hasOwnProperty.call(cleanedPatch, 'mobile')) {
      cleanedPatch.mobile = normalizePhoneForSave(cleanedPatch.mobile);
    }

    if (Object.prototype.hasOwnProperty.call(cleanedPatch, 'phone')) {
      cleanedPatch.phone = normalizePhoneForSave(cleanedPatch.phone);
    }

    if (
      Object.prototype.hasOwnProperty.call(cleanedPatch, 'billing_state') &&
      typeof cleanedPatch.billing_state === 'string'
    ) {
      cleanedPatch.billing_state = cleanedPatch.billing_state.toUpperCase();
    }

    const { data, error } = await supabase
      .from('contacts')
      .update(cleanedPatch)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      window.alert(`Could not save contact: ${error.message}`);
      return;
    }

    if (data) {
      setRows((current) =>
        current.map((row) =>
          row.id === id
            ? {
                ...row,
                ...(data as Contact),
                mobile: formatPhone((data as Contact).mobile),
                phone: formatPhone((data as Contact).phone),
              }
            : row
        )
      );
    }

    flashSaved();
  }

  function openAddContactFromPage() {
    const firstRow = rows[0];

    const forcedAccountId = shopUser?.account_id ?? accountIdFilter ?? '';
    const forcedAccountName =
      shopUser?.account_name ?? accountNameFilter ?? firstRow?.account_name ?? '';

    setNewContact({
      account_id: forcedAccountId,
      account_name: forcedAccountName,
      billing_city: firstRow?.billing_city ?? '',
      billing_state: firstRow?.billing_state ?? '',
      full_name: '',
      email: '',
      mobile: '',
      phone: '',
      notes: '',
    });

    setShowContactModal(true);
  }

  async function addContact() {
    const forcedAccountId = shopUser?.account_id ?? newContact.account_id;
    const forcedAccountName = shopUser?.account_name ?? newContact.account_name;

    if (!forcedAccountId || !forcedAccountName) {
      window.alert('This page needs an account selected before adding a contact.');
      return;
    }

    if (!newContact.full_name.trim()) {
      window.alert('Contact name is required.');
      return;
    }

    setSavingNewContact(true);

    try {
      const payload = {
        account_id: forcedAccountId,
        account_name: forcedAccountName,
        full_name: newContact.full_name.trim(),
        first_name: null,
        last_name: null,
        email: newContact.email.trim() || null,
        mobile: normalizePhoneForSave(newContact.mobile),
        phone: normalizePhoneForSave(newContact.phone),
        billing_city: newContact.billing_city.trim() || null,
        billing_state: newContact.billing_state.trim().toUpperCase() || null,
        glasweld_certified: 'Unknown',
        certification_date: null,
        contact_status: 'Active',
        notes: newContact.notes.trim() || null,
      };

      const { data, error } = await supabase
        .from('contacts')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setRows((current) => [
          ...current,
          {
            ...(data as Contact),
            mobile: formatPhone((data as Contact).mobile),
            phone: formatPhone((data as Contact).phone),
          },
        ]);
      }

      setShowContactModal(false);
      setNewContact({
        ...EMPTY_CONTACT_FORM,
        account_id: forcedAccountId,
        account_name: forcedAccountName,
      });

      flashSaved();
    } catch {
      window.alert('That contact could not be added. Check the required fields and try again.');
    } finally {
      setSavingNewContact(false);
    }
  }

  function startEdit(row: Contact, field: keyof Contact, options?: { phone?: boolean }) {
    const rawValue = String(row[field] ?? '');

    setEditingCell({ id: row.id, field });
    setDraftValue(options?.phone ? formatPhoneInput(rawValue) : rawValue);
  }

  function cancelEdit() {
    setEditingCell(null);
    setDraftValue('');
  }

  async function saveEdit(row: Contact, field: keyof Contact, options?: { upper?: boolean }) {
    const nextValue = options?.upper ? draftValue.toUpperCase() : draftValue;

    setEditingCell(null);
    setDraftValue('');

    await updateRow(row.id, { [field]: nextValue } as Partial<Contact>);
  }

  function renderEditableCell(
    row: Contact,
    field: keyof Contact,
    options?: { phone?: boolean; upper?: boolean; email?: boolean }
  ) {
    const isEditing = editingCell?.id === row.id && editingCell.field === field;
    const rawValue = String(row[field] ?? '');
    const displayValue = options?.phone ? formatPhone(rawValue) : rawValue;

    if (isEditing) {
      return (
        <input
          autoFocus
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          value={draftValue}
          onChange={(e) => {
            const nextValue = options?.phone
              ? formatPhoneInput(e.target.value)
              : options?.upper
                ? e.target.value.toUpperCase()
                : e.target.value;

            setDraftValue(nextValue);
          }}
          onBlur={() => void saveEdit(row, field, options)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }

            if (e.key === 'Escape') {
              cancelEdit();
            }
          }}
        />
      );
    }

    return (
      <div className="flex items-center gap-2">
        {options?.phone && rawValue ? (
          <a
            href={`tel:${rawValue}`}
            className="rounded px-1 py-1 text-sm text-blue-700 hover:bg-slate-100"
          >
            {displayValue}
          </a>
        ) : options?.email && rawValue ? (
          <a
            href={`mailto:${rawValue}`}
            className="rounded px-1 py-1 text-sm text-blue-700 hover:bg-slate-100"
          >
            {rawValue}
          </a>
        ) : (
          <button
            type="button"
            onClick={() => startEdit(row, field, options)}
            className="rounded px-1 py-1 text-left text-sm hover:bg-slate-100"
          >
            {displayValue || '—'}
          </button>
        )}

        {(options?.phone || options?.email) && (
          <button
            type="button"
            onClick={() => startEdit(row, field, options)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  const title = shopUser?.account_name
    ? `Contacts for ${shopUser.account_name}`
    : accountIdFilter
      ? `Contacts for ${accountNameFilter ?? 'Selected Account'}`
      : 'Contacts';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            {accountIdFilter && !shopUser ? (
              <Link
                href="/accounts"
                className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-teal-700 hover:text-teal-900"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to accounts
              </Link>
            ) : null}

            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-ink">{title}</h1>

              {savedMessage ? (
                <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                  <Check className="h-4 w-4" />
                  {savedMessage}
                </div>
              ) : null}
            </div>

            <p className="mt-1 text-sm text-slate-500">
              {shopUser
                ? 'This view only shows contacts tied to your business.'
                : 'Click any field to edit. Press Enter to save or Escape to cancel.'}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-[280px]">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm"
                placeholder="Search contacts or accounts"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {(accountIdFilter || shopUser) ? (
              <button
                type="button"
                onClick={openAddContactFromPage}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-teal-600 px-3 text-sm font-medium text-white hover:bg-teal-700"
              >
                <UserPlus className="h-4 w-4" />
                Add Contact
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table className="min-w-[1400px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              {['Account', 'Contact', 'Email', 'Mobile', 'Phone', 'City', 'State', 'Certified', 'Notes'].map(
                (head) => (
                  <th key={head} className="px-4 py-3 font-semibold">
                    {head}
                  </th>
                )
              )}
            </tr>
          </thead>

          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3 font-medium text-ink">{row.account_name}</td>

                <td className="min-w-[180px] px-4 py-3">
                  {renderEditableCell(row, 'full_name')}
                </td>

                <td className="min-w-[240px] px-4 py-3">
                  {renderEditableCell(row, 'email', { email: true })}
                </td>

                <td className="min-w-[170px] px-4 py-3">
                  {renderEditableCell(row, 'mobile', { phone: true })}
                </td>

                <td className="min-w-[170px] px-4 py-3">
                  {renderEditableCell(row, 'phone', { phone: true })}
                </td>

                <td className="min-w-[160px] px-4 py-3">
                  {renderEditableCell(row, 'billing_city')}
                </td>

                <td className="min-w-[100px] px-4 py-3">
                  {renderEditableCell(row, 'billing_state', { upper: true })}
                </td>

                <td className="px-4 py-3">{row.glasweld_certified}</td>

                <td className="px-4 py-3">
                  <textarea
                    className="min-h-20 min-w-[220px] rounded border border-slate-300 px-3 py-2 text-sm"
                    value={row.notes ?? ''}
                    onChange={(e) =>
                      setRows((current) =>
                        current.map((rowItem) =>
                          rowItem.id === row.id ? { ...rowItem, notes: e.target.value } : rowItem
                        )
                      )
                    }
                    onBlur={(e) => void updateRow(row.id, { notes: e.target.value })}
                  />
                </td>
              </tr>
            ))}

            {!filtered.length ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                  No contacts found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        {shopUser
          ? 'Showing only contacts tied to your business.'
          : accountIdFilter
            ? 'Showing only contacts tied to the account you clicked from the Accounts page.'
            : 'This page pulls the first 2,000 contacts by default to keep the interface fast. You can raise that limit later.'}
      </p>

      {showContactModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-ink">Add Contact</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Create a new contact for {shopUser?.account_name ?? newContact.account_name}.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowContactModal(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm font-medium text-slate-700">Contact Name</span>
                <input
                  value={newContact.full_name}
                  onChange={(e) =>
                    setNewContact((current) => ({ ...current, full_name: e.target.value }))
                  }
                  placeholder="Jane Smith"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Email</span>
                <input
                  value={newContact.email}
                  onChange={(e) =>
                    setNewContact((current) => ({ ...current, email: e.target.value }))
                  }
                  placeholder="jane@example.com"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Mobile</span>
                <input
                  value={newContact.mobile}
                  onChange={(e) =>
                    setNewContact((current) => ({
                      ...current,
                      mobile: formatPhoneInput(e.target.value),
                    }))
                  }
                  placeholder="(555) 555-5555"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Phone</span>
                <input
                  value={newContact.phone}
                  onChange={(e) =>
                    setNewContact((current) => ({
                      ...current,
                      phone: formatPhoneInput(e.target.value),
                    }))
                  }
                  placeholder="Optional"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">City</span>
                <input
                  value={newContact.billing_city}
                  onChange={(e) =>
                    setNewContact((current) => ({
                      ...current,
                      billing_city: e.target.value,
                    }))
                  }
                  placeholder="Optional"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">State</span>
                <input
                  value={newContact.billing_state}
                  onChange={(e) =>
                    setNewContact((current) => ({
                      ...current,
                      billing_state: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="WA"
                  maxLength={2}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-sm font-medium text-slate-700">Notes</span>
                <textarea
                  className="min-h-28 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  value={newContact.notes}
                  onChange={(e) =>
                    setNewContact((current) => ({ ...current, notes: e.target.value }))
                  }
                  placeholder="Anything useful about this contact."
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowContactModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void addContact()}
                disabled={savingNewContact}
                className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingNewContact ? 'Saving...' : 'Save Contact'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ContactsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading contacts...</div>}>
      <ContactsPageContent />
    </Suspense>
  );
}