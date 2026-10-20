'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';

/**
 * Pick a provider account by typing its name. There are thousands of accounts (4,200+ after the
 * cohort import), so they are searched in the database a page at a time instead of listed in a
 * <select>: a select per row with every account froze the Access & Users page (10/20).
 */

type Option = { id: string; account_name: string | null; city: string | null; state: string | null };

export function AccountSearchSelect({
  value,
  onChange,
  disabled,
  placeholder = 'Search shop by name',
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [label, setLabel] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Option[]>([]);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // The results list is drawn over the page (a portal, fixed to the input's position) so a card
  // with overflow-hidden can't cut it off.
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  // The chosen account's name, looked up by id.
  useEffect(() => {
    let live = true;
    if (!value) {
      setLabel('');
      return;
    }
    void supabase
      .from('accounts')
      .select('account_name')
      .eq('id', value)
      .maybeSingle()
      .then(({ data }) => live && setLabel(data?.account_name || 'Unnamed account'));
    return () => {
      live = false;
    };
  }, [value]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(async () => {
      setSearching(true);
      let q = supabase.from('accounts').select('id, account_name, city, state').order('account_name').limit(20);
      const needle = query.replace(/[(),%*]/g, ' ').trim();
      if (needle) q = q.or(`account_name.ilike.%${needle}%,company_email.ilike.%${needle}%,city.ilike.%${needle}%`);
      const { data } = await q;
      if (live) {
        setOptions((data as Option[]) || []);
        setSearching(false);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (r) setPos({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 260) });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  return (
    <div ref={boxRef} className="relative w-full min-w-0">
      <input
        value={open ? query : label}
        onFocus={() => {
          setQuery('');
          setOpen(true);
        }}
        onChange={(e) => setQuery(e.target.value)}
        disabled={disabled}
        placeholder={label || placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      />
      {open && !disabled && pos && typeof document !== 'undefined' ? createPortal(
        <div
          ref={listRef}
          style={{ position: 'fixed', left: pos.left, top: pos.top, width: pos.width }}
          className="z-[60] max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {value ? (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-50"
            >
              Clear selection
            </button>
          ) : null}
          {searching && !options.length ? <div className="px-3 py-2 text-xs text-slate-500">Searching…</div> : null}
          {!searching && !options.length ? <div className="px-3 py-2 text-xs text-slate-500">No matching shop.</div> : null}
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onChange(o.id);
                setLabel(o.account_name || 'Unnamed account');
                setOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${o.id === value ? 'bg-brand-50' : ''}`}
            >
              <span className="text-slate-900">{o.account_name || 'Unnamed account'}</span>
              {o.city || o.state ? (
                <span className="ml-1 text-xs text-slate-500">{[o.city, o.state].filter(Boolean).join(', ')}</span>
              ) : null}
            </button>
          ))}
        </div>,
        document.body
      ) : null}
    </div>
  );
}
