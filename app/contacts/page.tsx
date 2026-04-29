'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Search, Pencil, Check } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Contact } from '@/lib/types';

type EditingCell = {
  id: string;
  field: keyof Contact;
} | null;

function formatPhone(value?: string | null) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return value ?? '';
}

function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function ContactsPageContent() {
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<Contact[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<EditingCell>(null);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .order('account_name')
      .limit(2000);

    setRows((data as Contact[]) || []);
  }

  function flashSaved() {
    setSaved('Saved');
    setTimeout(() => setSaved(''), 1200);
  }

  async function save(row: Contact, field: keyof Contact) {
    setEditing(null);

    await supabase
      .from('contacts')
      .update({ [field]: draft })
      .eq('id', row.id);

    setRows((r) =>
      r.map((x) =>
        x.id === row.id ? { ...x, [field]: draft } : x
      )
    );

    flashSaved();
  }

  function startEdit(row: Contact, field: keyof Contact, isPhone?: boolean) {
    setEditing({ id: row.id, field });
    setDraft(isPhone ? formatPhoneInput(String(row[field] || '')) : String(row[field] || ''));
  }

  function renderCell(row: Contact, field: keyof Contact, opts?: { phone?: boolean; email?: boolean }) {
    const isEditing = editing?.id === row.id && editing.field === field;
    const value = String(row[field] || '');

    if (isEditing) {
      return (
        <input
          autoFocus
          value={draft}
          onChange={(e) =>
            setDraft(opts?.phone ? formatPhoneInput(e.target.value) : e.target.value)
          }
          onBlur={() => save(row, field)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setEditing(null);
          }}
          className="border rounded px-2 py-1 text-sm"
        />
      );
    }

    return (
      <div className="flex items-center gap-1">
        {opts?.phone && value ? (
          <a href={`tel:${value}`} className="text-blue-700">
            {formatPhone(value)}
          </a>
        ) : opts?.email && value ? (
          <a href={`mailto:${value}`} className="text-blue-700">
            {value}
          </a>
        ) : (
          <button onClick={() => startEdit(row, field, opts?.phone)}>
            {value || '—'}
          </button>
        )}
        <Pencil className="h-3 w-3 opacity-50" />
      </div>
    );
  }

  const filtered = useMemo(() => {
    return rows.filter((r) =>
      `${r.account_name} ${r.full_name} ${r.email}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  }, [rows, query]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Contacts</h1>

        <div className="flex items-center gap-3">
          {saved && (
            <div className="flex items-center gap-1 text-green-600 text-sm">
              <Check className="h-4 w-4" /> {saved}
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-2 top-2 h-4 w-4 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 border rounded px-3 py-2 text-sm"
              placeholder="Search"
            />
          </div>
        </div>
      </div>

      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Account</th>
              <th className="px-4 py-2 text-left">Contact</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Mobile</th>
              <th className="px-4 py-2 text-left">Phone</th>
              <th className="px-4 py-2 text-left">City</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-4 py-2">
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

                <td className="px-4 py-2">{renderCell(row, 'full_name')}</td>
                <td className="px-4 py-2">{renderCell(row, 'email', { email: true })}</td>
                <td className="px-4 py-2">{renderCell(row, 'mobile', { phone: true })}</td>
                <td className="px-4 py-2">{renderCell(row, 'phone', { phone: true })}</td>
                <td className="px-4 py-2">{renderCell(row, 'billing_city')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ContactsPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <ContactsPageContent />
    </Suspense>
  );
}