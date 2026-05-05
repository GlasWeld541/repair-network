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
    return null; // already redirected
  }

  const cards = [
    {
      title: 'Access Requests',
      description: 'Review pending users, approve access, and assign roles.',
      href: '/admin/users',
    },
    {
      title: 'Users / Roles',
      description:
        'Manage user access, suspend users, revoke users, and update roles.',
      href: '/admin/users',
    },
    {
      title: 'Carriers / TPAs',
      description: 'Manage insurance carrier and TPA organizations.',
      href: '/admin/carriers',
    },
    {
      title: 'Shops',
      description: 'Manage repair network shops and account-level access.',
      href: '/accounts',
    },
    {
      title: 'Routing Settings',
      description:
        'Configure claim routing logic, qualification rules, and fallback behavior.',
      href: '/admin/routing',
    },
    {
      title: 'Claims Setup',
      description:
        'Prepare claim intake fields, carrier portal rules, and EDI workflows.',
      href: '/admin/claims',
    },
  ];

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold text-ink">Admin</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage access, organizations, routing, and platform setup.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="text-lg font-semibold text-slate-900">
              {card.title}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {card.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}