'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type Ctx = { shopName: string | null; vehicle: string | null; alreadyRated: boolean };
type Phase = 'loading' | 'invalid' | 'form' | 'done';

export default function RatePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token as string;

  const [phase, setPhase] = useState<Phase>('loading');
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/rate/${token}`);
        if (!res.ok) {
          if (!cancelled) setPhase('invalid');
          return;
        }
        const data = (await res.json()) as Ctx;
        if (cancelled) return;
        setCtx(data);
        setPhase(data.alreadyRated ? 'done' : 'form');
        // Pre-select the star the customer tapped in the email (?r=N), if valid.
        const r = Number(new URLSearchParams(window.location.search).get('r'));
        if (Number.isInteger(r) && r >= 1 && r <= 5) setRating(r);
      } catch {
        if (!cancelled) setPhase('invalid');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit() {
    if (rating < 1 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/rate/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      });
      if (!res.ok) {
        setError('Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }
      setPhase('done');
    } catch {
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[100svh] flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 text-lg font-bold text-brand-700">GlasWeld</div>

        {phase === 'loading' && <p className="text-sm text-slate-500">Loading…</p>}

        {phase === 'invalid' && (
          <div>
            <h1 className="text-xl font-bold text-slate-900">This link isn&apos;t valid</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              This rating link has expired or is incorrect. If you&apos;d still like to share
              feedback, please reply to your service email or call us at{' '}
              <a href="tel:+15413881156" className="font-semibold text-brand-700">
                541-388-1156
              </a>
              .
            </p>
          </div>
        )}

        {phase === 'done' && (
          <div>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-2xl">
              ✓
            </div>
            <h1 className="text-xl font-bold text-slate-900">Thank you!</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              We appreciate your feedback — it helps us keep the quality of our repair network
              high.
            </p>
          </div>
        )}

        {phase === 'form' && (
          <div>
            <h1 className="text-xl font-bold text-slate-900">How was your service?</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {ctx?.vehicle ? `Your windshield service on your ${ctx.vehicle}` : 'Your windshield service'}
              {ctx?.shopName ? ` by ${ctx.shopName}` : ''} is complete. Tap a star to rate it.
            </p>

            <div className="mt-5 flex justify-center gap-1" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => {
                const filled = (hover || rating) >= n;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n} star${n === 1 ? '' : 's'}`}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => setRating(n)}
                    className={`px-1 text-4xl leading-none transition-transform hover:scale-110 ${
                      filled ? 'text-amber-400' : 'text-slate-300'
                    }`}
                  >
                    ★
                  </button>
                );
              })}
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Anything you'd like to add? (optional)"
              rows={3}
              className="mt-5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />

            {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

            <button
              type="button"
              onClick={submit}
              disabled={rating < 1 || submitting}
              className="mt-5 w-full rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit rating'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
