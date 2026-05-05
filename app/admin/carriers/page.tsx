'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Carrier = {
  id: string;
  organization_name: string;
};

export default function CarriersPage() {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCarriers();
  }, []);

  async function loadCarriers() {
    setLoading(true);

    const { data } = await supabase
      .from('carrier_organizations')
      .select('id, organization_name')
      .order('organization_name');

    setCarriers((data as Carrier[]) || []);
    setLoading(false);
  }

  async function addCarrier() {
    if (!newName.trim()) return;

    await supabase.from('carrier_organizations').insert({
      organization_name: newName.trim(),
    });

    setNewName('');
    await loadCarriers();
  }

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-6 py-6">
      <div>
        <Link href="/admin" className="text-sm text-blue-600">
          ← Back to Admin
        </Link>

        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          Carriers & TPAs
        </h1>
      </div>

      {/* ADD */}
      <div className="rounded-2xl border bg-white p-5">
        <div className="flex gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Carrier name"
            className="h-10 flex-1 border px-3"
          />

          <button
            onClick={addCarrier}
            className="bg-black text-white px-4"
          >
            Add
          </button>
        </div>
      </div>

      {/* LIST */}
      <div className="rounded-2xl border bg-white">
        {loading ? (
          <div className="p-6">Loading...</div>
        ) : carriers.length ? (
          carriers.map((c) => (
            <Link
              key={c.id}
              href={`/admin/carriers/${c.id}`}
              className="block border-t p-4 hover:bg-slate-50"
            >
              {c.organization_name}
            </Link>
          ))
        ) : (
          <div className="p-6 text-slate-500">No carriers yet</div>
        )}
      </div>
    </div>
  );
}