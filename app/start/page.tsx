'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  CircleDollarSign,
  FileQuestion,
  MapPin,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';

const DAMAGE_LOCATIONS = [
  'Driver side',
  'Passenger side',
  'Center',
  'Edge',
  'Unknown',
];

const DAMAGE_SIZES = [
  'Smaller than a quarter',
  'Quarter sized',
  'Larger than a quarter',
  'Long crack',
  'Unsure',
];

const trustPoints = [
  {
    label: 'Network',
    value: 'Independent',
    body: 'A repair-first network built outside the usual replacement-driven claims funnel.',
  },
  {
    label: 'Repair-first',
    value: 'Always',
    body: 'If the original glass can be safely repaired, that is the first path reviewed.',
  },
  {
    label: 'Original seal',
    value: 'Preserve',
    body: 'When safe repair is possible, keeping the factory-installed seal has real value.',
  },
];

const storyCards = [
  {
    title: 'Can it be repaired?',
    body:
      'Repairable damage routes first to repair-only companies, so there is no incentive to turn a repair into a replacement.',
    icon: CircleDollarSign,
  },
  {
    title: 'Should you use insurance?',
    body:
      'Even covered glass claims can become part of your claim history. A low-cost repair may be cleaner as cash pay.',
    icon: AlertTriangle,
  },
  {
    title: 'Who should do the work?',
    body:
      'Auto glass companies often make far more on replacement than repair. The network separates repair and replacement partners.',
    icon: Camera,
  },
];

const processSteps = [
  {
    title: 'Upload photos',
    body: 'Send a few clear pictures of the chip or crack, plus your ZIP code and vehicle.',
  },
  {
    title: 'Get triaged',
    body: 'The damage is reviewed for repair, replacement, cash-pay, or insurance handling.',
  },
  {
    title: 'Route correctly',
    body: 'Repairable damage goes to repair partners. Replacement work goes to replacement partners.',
  },
];

const proofPoints = [
  'No obligation photo review',
  'Repair-only routing when repairable',
  'Cash and insurance paths considered',
  'No random sale of your information',
];

const comparisonRows = [
  ['Usually repairable', 'Small chip, limited cracking, not in a sensor or camera area'],
  ['Needs review', 'Long crack, edge damage, multiple chips, or damage in the driver view'],
  ['Likely replacement', 'Large spreading crack, severe impact, or compromised safety area'],
  ['Insurance question', 'Depends on your policy, deductible, state, and final service needed'],
];

type SubmitState = 'idle' | 'submitting' | 'success';

export default function ConsumerStartPage() {
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [error, setError] = useState('');
  const [tracking, setTracking] = useState<Record<string, string>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextTracking: Record<string, string> = {
      landing_page: window.location.pathname + window.location.search,
      referrer: document.referrer || '',
      device: window.innerWidth < 768 ? 'mobile' : 'desktop',
    };

    [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term',
      'gclid',
    ].forEach((key) => {
      const value = params.get(key);
      if (value) nextTracking[key] = value;
    });

    setTracking(nextTracking);
  }, []);

  const isSubmitting = submitState === 'submitting';

  const sourceLabel = useMemo(() => {
    if (tracking.gclid) return 'Google Ads';
    if (tracking.utm_source) return tracking.utm_source;
    if (tracking.referrer) return 'Referral';
    return 'Direct';
  }, [tracking]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitState('submitting');

    const form = event.currentTarget;
    const formData = new FormData(form);

    Object.entries(tracking).forEach(([key, value]) => {
      formData.set(key, value);
    });

    const response = await fetch('/api/consumer-intake', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(result.error || 'Could not submit. Please check the form and try again.');
      setSubmitState('idle');
      return;
    }

    form.reset();
    setSubmitState('success');
  }

  return (
    <div className="-mx-6 -my-8 bg-[#f7fbfc] text-slate-950">
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0">
          <img
            src="/windshield-chip-hero.png"
            alt=""
            className="h-full w-full object-cover object-center opacity-85"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.9),rgba(2,6,23,0.68),rgba(2,6,23,0.25))]" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#f7fbfc] to-transparent" />
        </div>

        <div className="relative mx-auto grid min-h-screen max-w-[1380px] gap-10 px-6 py-8 lg:grid-cols-[0.96fr_1.04fr] lg:items-center lg:px-10">
          <div className="max-w-3xl">
            <div className="mb-8 inline-flex rounded-2xl bg-white/90 px-5 py-3 shadow-[0_0_42px_rgba(255,255,255,0.7)] ring-1 ring-white/80 backdrop-blur">
              <img
                src="/glasweld-logo.png"
                alt="GlasWeld"
                className="h-16 w-auto object-contain drop-shadow-[0_2px_8px_rgba(255,255,255,0.85)]"
              />
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-brand-300/30 bg-brand-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-brand-100">
              <ShieldCheck className="h-4 w-4" />
              Windshield chip and crack help
            </div>

            <h1 className="mt-6 text-4xl font-semibold leading-[1.04] lg:text-6xl">
              Windshield damage? Know your best option first.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200">
              Start with a photo review from an independent, repair-first glass network before
              you file a claim or approve a replacement.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#damage-review"
                className="rounded-xl bg-brand-300 px-5 py-3 text-sm font-semibold text-slate-950 shadow-soft hover:bg-brand-200"
              >
                Start Photo Review
              </a>
              <a
                href="#what-to-know"
                className="rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15"
              >
                See Repair Guide
              </a>
            </div>

            <div className="mt-9 grid gap-3 sm:grid-cols-3">
              {trustPoints.map((point) => (
                <div key={point.label} className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                  <div className="text-2xl font-semibold text-white">{point.value}</div>
                  <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand-100">
                    {point.label}
                  </div>
                  <div className="mt-3 text-sm leading-6 text-slate-200">{point.body}</div>
                </div>
              ))}
            </div>
          </div>

          <DamageReviewForm
            submitState={submitState}
            setSubmitState={setSubmitState}
            isSubmitting={isSubmitting}
            error={error}
            sourceLabel={sourceLabel}
            submit={submit}
          />
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-[1380px] gap-3 px-6 py-5 sm:grid-cols-2 lg:grid-cols-4 lg:px-10">
          {proofPoints.map((point) => (
            <div key={point} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <CheckCircle2 className="h-5 w-5 text-brand-700" />
              {point}
            </div>
          ))}
        </div>
      </section>

      <section id="what-to-know" className="mx-auto max-w-[1380px] px-6 py-14 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">
              Quick answer first
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 lg:text-5xl">
              Repair when possible. Replace when necessary.
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-600">
              A replacement can average $1,300 or more. A repair can be a fraction of that.
              That difference creates incentives. This network is built to protect the repair
              option first, then route replacement only when replacement is the right answer.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {storyCards.map((card) => {
              const Icon = card.icon;

              return (
                <div key={card.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                  <div className="rounded-xl bg-brand-50 p-3 text-brand-700">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-950">{card.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{card.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-white py-14">
        <div className="mx-auto grid max-w-[1380px] gap-8 px-6 lg:grid-cols-[1fr_1fr] lg:px-10">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 text-white shadow-[0_25px_70px_rgba(15,23,42,0.25)]">
            <img
              src="/windshield-chip-hero.png"
              alt=""
              className="h-72 w-full object-cover object-center opacity-95"
            />
            <div className="p-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-brand-300/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-100">
                <FileQuestion className="h-4 w-4" />
                Cash or claim?
              </div>
              <h2 className="mt-4 text-3xl font-semibold">
                Pay cash or use insurance?
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Glass coverage can be useful, but a claim is still a claim history event.
                If the damage can be repaired affordably, cash pay may be the cleaner path.
                If replacement is needed, insurance may be worth considering.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[#f6fbfc] p-5 shadow-soft">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-brand-800">
              <Sparkles className="h-5 w-5" />
              A better first step
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Damage type</th>
                    <th className="px-4 py-3">What it may mean</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row[0]} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3 font-semibold text-slate-950">{row[0]}</td>
                      <td className="px-4 py-3 text-slate-700">{row[1]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Final repairability depends on inspection. Coverage, deductible, claim handling,
              and out-of-pocket costs vary by carrier, state, and policy.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1380px] px-6 py-14 lg:px-10">
        <div className="mb-8 max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">
            How it works
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 lg:text-5xl">
            Get moving in minutes.
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {processSteps.map((step, index) => (
            <div key={step.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                {index + 1}
              </div>
              <h3 className="mt-5 text-xl font-semibold text-slate-950">{step.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-brand-200 bg-brand-50 p-5 text-sm leading-6 text-brand-900">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-700" />
            <div>
              Repairable claims and jobs route first to repair-only companies. There is no
              replacement upside for them, which removes the incentive to convert a repairable
              chip into a replacement job.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function DamageReviewForm({
  submitState,
  setSubmitState,
  isSubmitting,
  error,
  sourceLabel,
  submit,
}: {
  submitState: SubmitState;
  setSubmitState: (state: SubmitState) => void;
  isSubmitting: boolean;
  error: string;
  sourceLabel: string;
  submit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div id="damage-review" className="rounded-2xl border border-white/10 bg-white p-5 text-slate-900 shadow-[0_30px_100px_rgba(0,0,0,0.45)] lg:p-6">
      {submitState === 'success' ? (
        <div className="flex min-h-[560px] flex-col items-center justify-center text-center">
          <div className="rounded-full bg-brand-50 p-4 text-brand-700">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <h2 className="mt-5 text-2xl font-semibold text-slate-950">
            We received your request.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
            Your damage information is now in review. The next step is figuring out whether
            repair, replacement, cash pay, or insurance makes the most sense.
          </p>
          <button
            type="button"
            onClick={() => setSubmitState('idle')}
            className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
          >
            Submit Another
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
              Intake source: {sourceLabel}
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">
              Start Your Review
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Tell us where the damage is and upload photos. We will use that to route the next step.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <input name="customer_name" placeholder="Name" required />
            <input name="customer_phone" placeholder="Phone" />
            <input name="customer_email" type="email" placeholder="Email" />
            <input name="postal_code" placeholder="ZIP code" required />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <input name="vehicle_year" placeholder="Year" />
            <input name="vehicle_make" placeholder="Make" />
            <input name="vehicle_model" placeholder="Model" />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <select name="damage_location" defaultValue="">
              <option value="">Damage location</option>
              {DAMAGE_LOCATIONS.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>

            <select name="damage_size" defaultValue="">
              <option value="">Damage size</option>
              {DAMAGE_SIZES.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </div>

          <textarea
            name="damage_notes"
            className="min-h-24"
            placeholder="What happened? Any cracks, chips, edge damage, or visibility concerns?"
          />

          <div className="grid gap-3 md:grid-cols-3">
            <select name="payment_path" defaultValue="unknown">
              <option value="unknown">Cash or insurance?</option>
              <option value="cash">Prefer cash if sensible</option>
              <option value="insurance">May use insurance</option>
            </select>

            <input name="insurance_carrier" placeholder="Insurance carrier, optional" />
            <input name="policy_number" placeholder="Policy ID / number, optional" />
          </div>

          <label className="block rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white p-2 text-brand-700 shadow-soft">
                <Camera className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Damage photos
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Up to five photos.
                </div>
              </div>
            </div>
            <input
              name="photos"
              type="file"
              accept="image/*"
              multiple
              className="mt-4 w-full border-0 bg-transparent px-0"
            />
          </label>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-soft hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            {isSubmitting ? 'Submitting...' : 'Submit For Review'}
          </button>
        </form>
      )}
    </div>
  );
}
