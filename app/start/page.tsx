'use client';

import { useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, ShieldCheck, Upload } from 'lucide-react';

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
    <div className="-mx-6 -my-8 bg-slate-950 text-white">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="/login-bg.png"
            alt=""
            className="h-full w-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-slate-950/75" />
        </div>

        <div className="relative mx-auto grid min-h-[calc(100vh-112px)] max-w-[1380px] gap-10 px-6 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:px-10">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-300/25 bg-brand-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-brand-200">
              <ShieldCheck className="h-4 w-4" />
              Repair or replace guidance
            </div>

            <h1 className="mt-6 text-4xl font-semibold leading-tight lg:text-6xl">
              Find out the right way to handle your windshield damage.
            </h1>

            <p className="mt-5 text-lg leading-8 text-slate-300">
              Upload damage photos and basic vehicle info. The network can review whether repair,
              replacement, cash pay, or insurance is the better next step.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {['Photo review', 'Cash or insurance', 'Qualified routing'].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <CheckCircle2 className="h-5 w-5 text-brand-300" />
                  <div className="mt-3 text-sm font-semibold text-white">{item}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white p-5 text-slate-900 shadow-[0_30px_100px_rgba(0,0,0,0.45)] lg:p-6">
            {submitState === 'success' ? (
              <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
                <div className="rounded-full bg-brand-50 p-4 text-brand-700">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <h2 className="mt-5 text-2xl font-semibold text-slate-950">
                  We received your request.
                </h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
                  The damage information is now in review. Someone from the network can follow up
                  with the best next step.
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
                    Damage Review
                  </h2>
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
        </div>
      </section>
    </div>
  );
}
