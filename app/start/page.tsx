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
    label: 'Repair-first review',
    value: '1st',
    body: 'We look for the lowest-severity correct outcome before anyone pushes a replacement.',
  },
  {
    label: 'Typical repair',
    value: '$80-$150',
    body: 'Many small chips can be handled without starting an insurance claim.',
  },
  {
    label: 'Typical replacement',
    value: '$1,300',
    body: 'A replacement can be many times more expensive than a proper repair.',
  },
];

const storyCards = [
  {
    title: 'A small chip does not always need a claim',
    body:
      'If the repair is inexpensive, paying cash may be simpler than opening a glass claim. The right answer depends on your policy, deductible, state, and damage.',
    icon: CircleDollarSign,
  },
  {
    title: 'Replacement incentives can distort advice',
    body:
      'Some glass claim channels also own or favor replacement service locations. That can make it hard for consumers to know whether the first recommendation is truly neutral.',
    icon: AlertTriangle,
  },
  {
    title: 'Photos help separate repair from replacement',
    body:
      'Damage size, location, edge proximity, and crack length matter. A photo review gives the network a better starting point before anyone sells you anything.',
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

const comparisonRows = [
  ['Goal', 'Find the correct path first', 'Capture and route the transaction'],
  ['Small repair', 'May be better as cash pay', 'May become an unnecessary claim'],
  ['Replacement', 'Only when repair is not sensible', 'Often becomes the default path'],
  ['Visibility', 'Photo review and status tracking', 'Consumer may not see the routing logic'],
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
    <div className="-mx-6 -my-8 bg-[#f6fbfc] text-slate-950">
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0">
          <img
            src="/login-bg.png"
            alt=""
            className="h-full w-full object-cover opacity-55"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.92),rgba(2,6,23,0.72),rgba(2,6,23,0.45))]" />
        </div>

        <div className="relative mx-auto grid min-h-[calc(100vh-112px)] max-w-[1380px] gap-10 px-6 py-10 lg:grid-cols-[0.96fr_1.04fr] lg:items-center lg:px-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-300/30 bg-brand-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-brand-100">
              <ShieldCheck className="h-4 w-4" />
              Windshield damage decision review
            </div>

            <h1 className="mt-6 text-4xl font-semibold leading-[1.04] lg:text-6xl">
              Do not file a glass claim or approve a replacement until you know what you actually need.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200">
              Upload photos first. We help sort out whether repair, replacement, cash pay,
              or insurance is the smarter path before the glass claims machine takes over.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#damage-review"
                className="rounded-xl bg-brand-300 px-5 py-3 text-sm font-semibold text-slate-950 shadow-soft hover:bg-brand-200"
              >
                Start Free Review
              </a>
              <a
                href="#what-to-know"
                className="rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15"
              >
                What to Know First
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

      <section id="what-to-know" className="mx-auto max-w-[1380px] px-6 py-14 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">
              The part most people are not told
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 lg:text-5xl">
              The first company to control the intake often controls the outcome.
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-600">
              Most consumers just want the safest, cheapest, least painful answer. But the glass
              workflow can be built around claims, replacements, and routing control. This review
              starts with your damage instead of somebody else&apos;s incentive.
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
              src="/login-bg.png"
              alt=""
              className="h-72 w-full object-cover opacity-80"
            />
            <div className="p-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-brand-300/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-100">
                <FileQuestion className="h-4 w-4" />
                Claim or cash?
              </div>
              <h2 className="mt-4 text-3xl font-semibold">
                A claim is not always the consumer-friendly answer.
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                A low-cost repair may be simpler as cash pay. A true replacement may need a
                different path. The point is to make that call after review, not after a routing
                system has already nudged the job toward the highest invoice.
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
                    <th className="px-4 py-3">Question</th>
                    <th className="px-4 py-3">Repair Network Review</th>
                    <th className="px-4 py-3">Typical Claims Funnel</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row[0]} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3 font-semibold text-slate-950">{row[0]}</td>
                      <td className="px-4 py-3 text-slate-700">{row[1]}</td>
                      <td className="px-4 py-3 text-slate-600">{row[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Insurance rules vary by carrier, state, policy, deductible, and claim history.
              This review is not insurance advice. It is a practical damage intake so you can ask
              better questions before choosing a path.
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
            Simple for the consumer. Structured for the network.
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
              Repairable damage routes to repair-focused partners. Replacement work routes to
              replacement partners. That segmentation is intentional because the incentives and
              equipment are different.
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
              Free Damage Review
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Takes about a minute. Photos help us understand whether repair is realistic.
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

          <div className="grid gap-3 md:grid-cols-2">
            <select name="payment_path" defaultValue="unknown">
              <option value="unknown">Cash or insurance?</option>
              <option value="cash">Prefer cash if sensible</option>
              <option value="insurance">May use insurance</option>
            </select>

            <input name="insurance_carrier" placeholder="Insurance carrier, optional" />
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
