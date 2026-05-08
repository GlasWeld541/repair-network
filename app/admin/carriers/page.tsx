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
  const [currentRole, setCurrentRole] = useState<string | null>(null);

  const isReadOnly = currentRole === 'demo';

  useEffect(() => {
    void loadCarriers();
  }, []);

  async function loadCarriers() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email?.toLowerCase() || '';

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, approved, access_status')
      .eq('user_email', email)
      .maybeSingle();

    if (!roleData || roleData.approved !== true || roleData.access_status !== 'Active') {
      window.location.href = '/login';
      return;
    }

    if (roleData.role !== 'admin' && roleData.role !== 'demo') {
      window.location.href = '/';
      return;
    }

    setCurrentRole(roleData.role);

    const { data } = await supabase
      .from('carrier_organizations')
      .select('id, organization_name')
      .order('organization_name');

    setCarriers((data as Carrier[]) || []);
    setLoading(false);
  }

  async function addCarrier() {
    if (isReadOnly) return;
    if (!newName.trim()) return;

    await supabase.from('carrier_organizations').insert({
      organization_name: newName.trim(),
    });

    setNewName('');
    await loadCarriers();
  }

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-6 py-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/admin" className="text-sm text-blue-600">
            ← Back to Admin
          </Link>

          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            Carriers & TPAs
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Manage insurance carrier and TPA organizations.
          </p>
        </div>

        {isReadOnly ? (
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            Demo View Only
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Carrier name"
            disabled={isReadOnly}
            className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          />

          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => void addCarrier()}
            className="rounded-lg bg-black px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading...</div>
        ) : carriers.length ? (
          carriers.map((carrier, index) => (
            <Link
              key={carrier.id}
              href={`/admin/carriers/${carrier.id}`}
              className={`block p-4 text-sm font-medium text-slate-900 hover:bg-slate-50 ${
                index === 0 ? '' : 'border-t border-slate-100'
              }`}
            >
              {carrier.organization_name}
            </Link>
          ))
        ) : (
          <div className="p-6 text-sm text-slate-500">No carriers yet</div>
        )}
      </div>
    </div>
  );
}