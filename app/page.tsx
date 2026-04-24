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
  return (
    <div className="space-y-8">
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'NETWORK LOCATIONS', value: '84' },
          { label: 'ACTIVE CONTACTS', value: '91' },
          { label: 'FULLY QUALIFIED SHOPS', value: '0' },
          { label: 'INSURANCE-READY LOCATIONS', value: '0' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm"
          >
            <div className="text-[11px] tracking-[0.28em] text-slate-500">{stat.label}</div>
            <div className="mt-3 text-3xl font-semibold text-slate-900">{stat.value}</div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
          Real-time repair coverage footprint
        </div>
        <HomeCoverageMap />
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
          <h3 className="text-2xl font-semibold text-slate-900">Why this network works</h3>
          <div className="mt-6 space-y-5">
            <div className="rounded-2xl bg-slate-50 p-5">
              <div className="text-base font-semibold text-slate-900">No replacement incentive</div>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                These businesses are repair-focused. That removes the usual financial pressure to
                turn a repair into a replacement.
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-5">
              <div className="text-base font-semibold text-slate-900">Cleaner claim decisions</div>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Repairable claims stay repairable more often, helping reduce unnecessary severity
                and escalation.
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-5">
              <div className="text-base font-semibold text-slate-900">Better customer outcomes</div>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Better process and better finished appearance lead to stronger customer confidence.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
          <h3 className="text-2xl font-semibold text-slate-900">Network standards</h3>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Each location is selected to support quality, consistency, and lower claim risk.
          </p>

          <div className="mt-6 space-y-4">
            {standards.map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-base font-semibold text-slate-900">{item.title}</div>
                <p className="mt-2 text-sm leading-7 text-slate-600">{item.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
          <h3 className="text-2xl font-semibold text-slate-900">What this means for claims</h3>
          <div className="mt-6 space-y-4">
            {[
              'Lower replacement conversion risk',
              'Lower average claim cost',
              'Reduced severity on repairable events',
              'More consistent repair-first execution',
              'Better customer satisfaction',
            ].map((item) => (
              <div key={item} className="rounded-2xl bg-slate-50 px-5 py-4 text-sm font-medium text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}