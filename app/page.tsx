'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import HomeCoverageMap from '@/components/home-coverage-map';
import { ShieldCheck, BadgeCheck, TrendingDown } from 'lucide-react';

const overviewCards = [
  {
    title: 'Repair only',
    body:
      'Every location in this network focuses on repair. No windshield replacement revenue means no incentive to convert a repairable claim.',
    icon: ShieldCheck,
  },
  {
    title: 'Certified process',
    body:
      'Locations are selected for quality, consistency, and lower claim risk. The network is built to protect outcomes, not just fill geography.',
    icon: BadgeCheck,
  },
  {
    title: 'Better claim results',
    body:
      'Lower severity, fewer unnecessary replacements, and a more consistent repair-first experience for both carriers and customers.',
    icon: TrendingDown,
  },
];

export default function HomePage() {
  const router = useRouter();

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

  return (
    <div className="space-y-10">
      {/* HERO */}
      <section className="overflow-hidden rounded-[30px] bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 px-10 py-12 text-white shadow-[0_25px_60px_rgba(15,23,42,0.45)] lg:px-14 lg:py-14">
        <div className="grid gap-10 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.32em] text-teal-300">
              Repair-first network
            </div>

            {/* 🔥 STRONGER HEADLINE */}
            <h1 className="mt-5 max-w-none text-4xl font-semibold leading-[1.06] tracking-[-0.035em] lg:text-[58px]">
              Reduce glass claim costs by eliminating unnecessary replacements.
            </h1>

            <p className="mt-6 max-w-[920px] text-lg leading-8 text-slate-300">
              This network is built exclusively with repair-focused businesses that do not perform
              full windshield replacements. Without a financial incentive to upsell replacements,
              claims are handled correctly the first time, reducing cost while maintaining a
              higher-quality customer experience.
            </p>

            {/* 🔥 OPTIONAL PROOF METRIC (high impact) */}
            <div className="mt-6 text-sm text-teal-300 font-medium tracking-wide">
              85+ verified repair-only locations nationwide
            </div>
          </div>

          {/* RIGHT SIDE CARDS */}
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

      {/* MAP SECTION */}
      <section className="space-y-4">
        <div className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-600">
          Real-time repair coverage footprint
        </div>

        <div className="text-lg font-semibold text-slate-800">
          Live qualified repair footprint
        </div>

        <HomeCoverageMap />
      </section>
    </div>
  );
}