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
      console.error('Error loading carriers:', error);
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
      console.error('Error adding carrier:', error);
      alert('Could not add carrier');
      return;
    }

    setNewName('');
    await loadCarriers();
  }

  return (
    <div className="p-6 space-y-6">
      <Link href="/admin" className="text-blue-600">
        ← Back to Admin
      </Link>

      <h1 className="text-2xl font-semibold">Carriers / TPAs</h1>

      {/* ADD NEW */}
      <div className="space-y-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Carrier name"
          className="border p-2 w-full max-w-sm"
        />

        <button
          onClick={addCarrier}
          className="bg-black text-white px-4 py-2"
        >
          Add
        </button>
      </div>

      {/* LIST */}
      <div className="space-y-2">
        {loading ? (
          <div>Loading...</div>
        ) : carriers.length ? (
          carriers.map((c) => (
            <div key={c.id} className="border p-2">
              {c.organization_name}
            </div>
          ))
        ) : (
          <div>No carriers yet</div>
        )}
      </div>
    </div>
  );
}