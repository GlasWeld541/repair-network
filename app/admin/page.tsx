'use client';

import Link from 'next/link';
import { Eye } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    async function checkAccess() {
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

      const hasAccess =
        (data.role === 'admin' || data.role === 'demo') &&
        data.approved === true &&
        data.access_status === 'Active';

      if (!hasAccess) {
        window.location.href = '/';
        return;
      }

      setRole(data.role);
      setAuthorized(true);
      setLoading(false);
    }

    void checkAccess();
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading...</div>;
  }

  if (!authorized) {
    return null;
  }

  const isReadOnly = role === 'demo';

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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-ink">Admin</h1>

          <p className="mt-1 text-sm text-slate-500">
            Manage platform access, network structure, and insurance workflows.
          </p>
        </div>

        {isReadOnly ? (
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-soft">
            <Eye className="h-4 w-4 text-slate-500" />

            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Demo Access
              </div>

              <div className="text-sm font-medium text-slate-700">
                View Only
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-semibold text-slate-900 group-hover:text-brand-800">
                  {card.title}
                </div>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {card.description}
                </p>
              </div>

              {isReadOnly ? (
                <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  View
                </div>
              ) : null}
            </div>

            <div className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 transition group-hover:text-slate-700">
              Open →
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              Current Access Level
            </div>

            <div className="mt-1 text-sm text-slate-500">
              {isReadOnly
                ? 'Demo users can navigate the full system but cannot modify data.'
                : 'Administrator access with full system control.'}
            </div>
          </div>

          <div
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${
              isReadOnly
                ? 'border border-brand-200 bg-brand-50 text-brand-700'
                : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
          >
            {isReadOnly ? 'Demo Mode' : 'Admin'}
          </div>
        </div>
      </div>
    </div>
  );
}