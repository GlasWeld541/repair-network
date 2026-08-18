'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import HomeCoverageMap from '@/components/home-coverage-map';
import { ShieldCheck, BadgeCheck, TrendingDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const overviewCards = [
  {
    title: 'Repair-only first',
    body:
      'Repairable damage should be inspected by someone who is not financially rewarded for turning it into a replacement.',
    icon: ShieldCheck,
  },
  {
    title: 'Two ways carriers save',
    body:
      'Keep repairable damage out of the claims system when possible. For claims that must be opened, reduce severity by stopping unnecessary replacements before they happen.',
    icon: TrendingDown,
  },
  {
    title: 'Right provider, right outcome',
    body:
      'Repairable chips go first to repair-only providers. True replacements go to qualified full-service shops. The decision is based on the glass, not replacement revenue.',
    icon: BadgeCheck,
  },
];

export default function HomePage() {
  const router = useRouter();

  const [totalLocations, setTotalLocations] = useState(0);
  const [statesCovered, setStatesCovered] = useState(0);
  const [repairOnlyCount, setRepairOnlyCount] = useState(0);
  const [countersLoading, setCountersLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data } = await supabase
        .from('shop_users')
        .select('account_id')
        .eq('user_email', user.email?.toLowerCase())
        .maybeSingle();

      if (data?.account_id) {
        router.push('/jobs');
      }
    };

    run();
  }, [router]);

  useEffect(() => {
    async function loadCounters() {
      // Page past Supabase's ~1000-row response cap so the headline counters reflect
      // the whole network, not the first 1000 accounts.
      type CounterRow = { id: string; state: string | null; repair_only: string | null };
      const PAGE = 1000;
      const rows: CounterRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data } = await supabase
          .from('accounts')
          .select('id, state, repair_only')
          .range(from, from + PAGE - 1);
        const page = (data as CounterRow[] | null) ?? [];
        rows.push(...page);
        if (page.length < PAGE) break;
      }

      setTotalLocations(rows.length);

      setStatesCovered(
        new Set(
          rows
            .map((row) => row.state?.trim().toUpperCase())
            .filter(Boolean)
        ).size
      );

      setRepairOnlyCount(
        rows.filter(
          (row) => row.repair_only?.trim().toLowerCase() === 'yes'
        ).length
      );

      setCountersLoading(false);
    }

    void loadCounters();
  }, []);

  return (
    <div className="space-y-10">
      <section className="overflow-hidden rounded-[30px] bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 px-6 py-10 text-white shadow-[0_25px_60px_rgba(15,23,42,0.45)] sm:px-10 sm:py-12 lg:px-14 lg:py-14">
        <div className="grid gap-10 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.32em] text-teal-300">
              Repair-first glass network
            </div>

            <h1 className="mt-5 max-w-none text-4xl font-semibold leading-[1.06] tracking-[-0.035em] lg:text-[58px]">
              Fewer glass claims. Lower claim severity. Better glass decisions.
            </h1>

            <p className="mt-6 max-w-[920px] text-lg leading-8 text-slate-300">
              GlasWeld puts a neutral repair-first decision in front of the glass claim. Repairable
              chips are routed first to providers who do not profit from replacing the windshield,
              removing the conflict that turns repairable damage into unnecessary replacements. When
              replacement is truly necessary, the customer is routed to a qualified full-service
              glass provider.
            </p>

            <div className="mt-8 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { value: totalLocations, label: 'Provider locations' },
                { value: statesCovered, label: 'States covered' },
                { value: repairOnlyCount, label: 'Repair-only providers' },
                {
                  value: Math.max(0, totalLocations - repairOnlyCount),
                  label: 'Replacement-capable providers',
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  {countersLoading ? (
                    <Skeleton className="h-9 w-16 rounded-lg bg-white/20" />
                  ) : (
                    <div className="text-3xl font-semibold text-white">
                      {stat.value.toLocaleString()}
                    </div>
                  )}
                  <div className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            {overviewCards.map((card) => {
              const Icon = card.icon;

              return (
                <div
                  key={card.title}
                  className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md transition hover:bg-white/10"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-teal-300" />
                    <div className="text-base font-semibold text-white">
                      {card.title}
                    </div>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    {card.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-600">
          Real-time glass network footprint
        </div>

        <div className="text-lg font-semibold text-slate-800">
          Live repair-first provider footprint
        </div>

        <HomeCoverageMap />
      </section>
    </div>
  );
}