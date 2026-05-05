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

    const { data, error } = await supabase
      .from('carrier_organizations')
      .select('id, organization_name')
      .order('organization_name');

    if (error) {
      console.error(error);
      setCarriers([]);
    } else {
      setCarriers((data as Carrier[]) || []);
    }

    setLoading(false);
  }

  async function addCarrier() {
    if (!newName.trim()) return;

    const { error } = await supabase
      .from('carrier_organizations')
      .insert({
        organization_name: newName.trim(),
      });

    if (error) {
      console.error(error);
      alert('Could not add carrier');
      return;
    }

    setNewName('');
    await loadCarriers();
  }

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-6 py-6">
      {/* HEADER */}
      <div>
        <Link href="/admin" className="text-sm text-blue-600">
          ← Back to Admin
        </Link>

        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          Carriers & TPAs
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Manage insurance carriers and routing partners.
        </p>
      </div>

      {/* ADD CARD */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Enter carrier name..."
            className="h-11 flex-1 rounded-lg border border-slate-300 px-4 text-sm"
          />

          <button
            onClick={addCarrier}
            className="h-11 rounded-lg bg-slate-900 px-6 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Add Carrier
          </button>
        </div>
      </div>

      {/* LIST CARD */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            All Carriers
          </h2>
        </div>

        <div>
          {loading ? (
            <div className="p-6 text-sm text-slate-500">Loading...</div>
          ) : carriers.length ? (
            carriers.map((c) => (
              <div
                key={c.id}
                className="border-t px-5 py-3 text-sm text-slate-900 hover:bg-slate-50"
              >
                {c.organization_name}
              </div>
            ))
          ) : (
            <div className="p-6 text-sm text-slate-500">
              No carriers yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}