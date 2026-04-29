'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Search, Pencil, Check } from 'lucide-react';
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
          className="h-9 w-full rounded border border-slate-300 px-3 text-sm"
        />
      );
    }

    return (
      <div className="flex items-center gap-2">
        {opts?.phone && value ? (
          <a href={`tel:${value}`} className="text-blue-700 hover:underline">
            {formatPhone(value)}
          </a>
        ) : opts?.email && value ? (
          <a href={`mailto:${value}`} className="text-blue-700 hover:underline">
            {value}
          </a>
        ) : (
          <button
            onClick={() => startEdit(row, field, opts?.phone)}
            className="text-left hover:bg-slate-100 rounded px-1 py-1"
          >
            {value || '—'}
          </button>
        )}
        <Pencil className="h-3 w-3 text-slate-400" />
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
      {/* HEADER */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-ink">Contacts</h1>
          <p className="text-sm text-slate-500">
            Click any field to edit. Press Enter to save or Escape to cancel.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {saved && (
            <div className="flex items-center gap-1 text-emerald-600 text-sm">
              <Check className="h-4 w-4" /> {saved}
            </div>
          )}

          <div className="relative min-w-[280px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm"
              placeholder="Search contacts or accounts"
            />
          </div>
        </div>
      </div>

      {/* TABLE CARD */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table className="min-w-[1000px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Account</th>
              <th className="px-4 py-3 font-semibold">Contact</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Mobile</th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 font-semibold">City</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-ink">
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

                <td className="px-4 py-3">{renderCell(row, 'full_name')}</td>
                <td className="px-4 py-3">{renderCell(row, 'email', { email: true })}</td>
                <td className="px-4 py-3">{renderCell(row, 'mobile', { phone: true })}</td>
                <td className="px-4 py-3">{renderCell(row, 'phone', { phone: true })}</td>
                <td className="px-4 py-3">{renderCell(row, 'billing_city')}</td>
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