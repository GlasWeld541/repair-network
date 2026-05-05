'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Carrier = {
  id: string;
  organization_name: string;
  claims_email: string | null;
  claims_phone: string | null;
};

export default function CarrierDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [carrier, setCarrier] = useState<Carrier | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCarrier();
  }, [id]);

  async function loadCarrier() {
    const { data } = await supabase
      .from('carrier_organizations')
      .select('*')
      .eq('id', id)
      .single();

    setCarrier(data as Carrier);
    setLoading(false);
  }

  if (loading) return <div className="p-6">Loading...</div>;
  if (!carrier) return <div className="p-6">Not found</div>;

  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-6 py-6">
      <Link href="/admin/carriers" className="text-blue-600">
        ← Back to Carriers
      </Link>

      <h1 className="text-2xl font-semibold">
        {carrier.organization_name}
      </h1>

      <div className="rounded-xl border bg-white p-6 space-y-3">
        <div>
          <strong>Claims Email:</strong> {carrier.claims_email || '—'}
        </div>

        <div>
          <strong>Claims Phone:</strong> {carrier.claims_phone || '—'}
        </div>
      </div>
    </div>
  );
}