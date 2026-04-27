'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import HomeCoverageMap from '@/components/home-coverage-map';

const overviewCards = [
  {
    title: 'Repair only',
    body:
      'Every location in this network focuses on repair. No windshield replacement revenue means no incentive to convert a repairable claim.',
  },
  {
    title: 'Certified process',
    body:
      'Locations are selected for quality, consistency, and lower claim risk. The network is built to protect outcomes, not just fill geography.',
  },
  {
    title: 'Better claim results',
    body:
      'Lower severity, fewer unnecessary replacements, and a more consistent repair-first experience for both carriers and customers.',
  },
];

const standards = [
  {
    title: 'GlasWeld Certification',
    body: 'Training and standards built to improve repair quality and reduce risk.',
  },
  {
    title: 'ONYX Resin',
    body: 'Better finished appearance helps improve customer satisfaction after repair.',
  },
  {
    title: 'Zoom Injector',
    body: 'Controlled injection helps reduce crack-out risk during the repair process.',
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

      // 🔥 THIS is the key behavior
      if (data?.account_id) {
        router.push('/jobs'); // shops go here
      }
    };

    run();
  }, [router]);

  return (
    <div className="space-y-8">
      {/* 👇 EVERYTHING BELOW IS YOUR ORIGINAL FILE (UNCHANGED) */}

      <section className="overflow-hidden rounded-[30px] bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 px-8 py-10 text-white shadow-xl lg:px-12 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-300">
              Repair-first network
            </div>

            <h1 className="mt-4 max-w-none text-4xl font-semibold leading-[1.08] tracking-[-0.03em] lg:text-[56px]">
              Eliminate unnecessary windshield replacements at the source.
            </h1>

            <p className="mt-6 max-w-[920px] text-lg leading-8 text-slate-300">
              This network is built exclusively with repair-focused businesses that do not perform
              full windshield replacements. Without a financial incentive to upsell replacements,
              claims are handled correctly the first time, reducing cost while maintaining a
              higher-quality customer experience.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {overviewCards.map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
              >
                <div className="text-base font-semibold text-white">{card.title}</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* keep rest exactly as-is */}
      <section className="space-y-3">
        <div className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
          Real-time repair coverage footprint
        </div>
        <HomeCoverageMap />
      </section>
    </div>
  );
}