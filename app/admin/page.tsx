'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    async function checkAdmin() {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError || !userData.user) {
        window.location.href = '/login';
        return;
      }

      const email = userData.user.email?.toLowerCase() || '';

      const { data, error } = await supabase
        .from('user_roles')
        .select('role, approved, access_status')
        .eq('user_email', email)
        .maybeSingle();

      if (error || !data) {
        window.location.href = '/';
        return;
      }

      const isAdmin =
        data.role === 'admin' &&
        data.approved === true &&
        data.access_status === 'Active';

      if (!isAdmin) {
        window.location.href = '/';
        return;
      }

      setAuthorized(true);
      setLoading(false);
    }

    void checkAdmin();
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading...</div>;
  }

  if (!authorized) {
    return null;
  }

  // 🔥 CLEANED + STRUCTURED
  const cards = [
    {
      title: 'Access & Users',
      description:
        'Approve access requests, manage users, and assign roles.',
      href: '/admin/users',
    },
    {
      title: 'Shops',
      description:
        'Manage repair network shops, accounts, and permissions.',
      href: '/accounts',
    },
    {
      title: 'Carriers & TPAs',
      description:
        'Manage insurance carriers, TPAs, and their organizations.',
      href: '/admin/carriers',
    },
    {
      title: 'Claims & Routing',
      description:
        'Configure claim intake, routing rules, and workflow behavior.',
      href: '/admin/routing',
    },
  ];

  return (
    <div className="mx-auto max-w-[1380px] space-y-8 px-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold text-ink">Admin</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage platform access, network structure, and insurance workflows.
        </p>
      </div>

      {/* 🔥 2x2 GRID = MUCH CLEANER */}
      <div className="grid gap-5 md:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="text-lg font-semibold text-slate-900 group-hover:text-black">
              {card.title}
            </div>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              {card.description}
            </p>

            <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400 group-hover:text-slate-600">
              Open →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}