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

    const { data } = await supabase
      .from('contacts')
      .update(cleanedPatch)
      .eq('id', id)
      .select()
      .single();

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

  function startEdit(row: Contact, field: keyof Contact, options?: { phone?: boolean }) {
    const rawValue = String(row[field] ?? '');
    setEditingCell({ id: row.id, field });
    setDraftValue(options?.phone ? formatPhoneInput(rawValue) : rawValue);
  }

  function cancelEdit() {
    setEditingCell(null);
    setDraftValue('');
  }

  async function saveEdit(row: Contact, field: keyof Contact) {
    setEditingCell(null);
    setDraftValue('');
    await updateRow(row.id, { [field]: draftValue });
  }

  function renderEditableCell(
    row: Contact,
    field: keyof Contact,
    options?: { phone?: boolean; email?: boolean }
  ) {
    const isEditing = editingCell?.id === row.id && editingCell.field === field;
    const rawValue = String(row[field] ?? '');

    if (isEditing) {
      return (
        <input
          autoFocus
          value={draftValue}
          onChange={(e) =>
            setDraftValue(options?.phone ? formatPhoneInput(e.target.value) : e.target.value)
          }
          onBlur={() => void saveEdit(row, field)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') cancelEdit();
          }}
          className="rounded border px-2 py-1 text-sm"
        />
      );
    }

    return (
      <div className="flex items-center gap-2">
        {options?.phone && rawValue ? (
          <a href={`tel:${rawValue}`} className="text-blue-700">
            {formatPhone(rawValue)}
          </a>
        ) : options?.email && rawValue ? (
          <a href={`mailto:${rawValue}`} className="text-blue-700">
            {rawValue}
          </a>
        ) : (
          <button onClick={() => startEdit(row, field)}>{rawValue || '—'}</button>
        )}
        <Pencil className="h-3 w-3" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Contacts</h1>

      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>Account</th>
            <th>Contact</th>
            <th>Email</th>
            <th>Mobile</th>
            <th>Phone</th>
            <th>City</th>
          </tr>
        </thead>

        <tbody>
          {filtered.map((row) => (
            <tr key={row.id}>
              <td>
                {row.account_id ? (
                  <Link
                    href={`/accounts/${row.account_id}`}
                    className="text-blue-700 hover:underline"
                  >
                    {row.account_name}
                  </Link>
                ) : (
                  row.account_name
                )}
              </td>

              <td>{renderEditableCell(row, 'full_name')}</td>
              <td>{renderEditableCell(row, 'email', { email: true })}</td>
              <td>{renderEditableCell(row, 'mobile', { phone: true })}</td>
              <td>{renderEditableCell(row, 'phone', { phone: true })}</td>
              <td>{renderEditableCell(row, 'billing_city')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ContactsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ContactsPageContent />
    </Suspense>
  );
}