import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase';
import { geocodeText } from '@/lib/geocode';

/**
 * Enrol an independent tech into the network (Shiloh, 2026-09-23: he decides who joins).
 *
 * This replaces the old automatic enrollment, where any Rex field-tech login silently became a
 * provider. Admin-only, and done server-side because it needs two things the browser must not do:
 * check whether a Rex login exists for the email, and geocode with the server Mapbox key.
 *
 * The address is optional on purpose. A provider can be added the moment terms are agreed, and the
 * address filled in later. But a provider with no address gets no distance, so it cannot be ranked
 * by location and will sort after every provider that has one. The response says so, and so does
 * the form, so that is a known state rather than a silent one.
 */

type EnrollBody = {
  accountName?: string;
  email?: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Escape LIKE wildcards so an email containing "_" cannot match a different address. */
const likeExact = (v: string) => v.replace(/[\\%_]/g, (m) => `\\${m}`);

async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: 'network' }, cookies: { get: (name) => cookieStore.get(name)?.value } },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: role } = await supabase
    .from('user_roles')
    .select('role, approved, access_status')
    .eq('user_email', user.email.toLowerCase())
    .maybeSingle();
  if (!(role?.approved === true && role.access_status === 'Active' && role.role === 'admin')) {
    return { error: NextResponse.json({ error: 'Only an admin can add a provider.' }, { status: 403 }) };
  }
  return { error: null };
}

export async function POST(request: Request) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const body = (await request.json().catch(() => ({}))) as EnrollBody;
  const accountName = clean(body.accountName);
  const email = clean(body.email).toLowerCase();
  const phone = clean(body.phone);
  const street = clean(body.street);
  const city = clean(body.city);
  const state = clean(body.state).toUpperCase();
  const postalCode = clean(body.postalCode);

  if (!accountName) {
    return NextResponse.json({ error: 'A business or tech name is required.' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // One provider per email. The email is the link to their Rex app, so two accounts on the same
  // address would make it ambiguous which one their assigned jobs belong to.
  const { data: existing } = await admin
    .from('accounts')
    .select('id, account_name, active')
    .ilike('company_email', likeExact(email))
    .limit(1)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      {
        error: existing.active
          ? `${existing.account_name} is already in the network with this email.`
          : `${existing.account_name} already exists with this email but is not in the network. Re-activate it instead.`,
        existingId: existing.id,
      },
      { status: 409 },
    );
  }

  // Without a matching Rex login the provider's assigned jobs have nowhere to show up. Worth a
  // warning, not a refusal: the admin may be adding them before their login is created.
  let rexLoginExists: boolean | null = null;
  const { data: loginCheck, error: loginError } = await admin.rpc('rex_login_exists', { p_email: email });
  if (!loginError) rexLoginExists = loginCheck === true;

  const hasAddress = Boolean(street || city || state || postalCode);
  const coords = hasAddress
    ? await geocodeText([street, city, [state, postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', '))
    : null;

  const { data: created, error: insertError } = await admin
    .from('accounts')
    .insert({
      account_name: accountName,
      company_email: email,
      company_phone: phone || null,
      street: street || null,
      city: city || null,
      state: state || null,
      postal_code: postalCode || null,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      provider_type: 'independent_tech',
      active: true,
    })
    .select('id')
    .single();

  if (insertError || !created) {
    return NextResponse.json(
      { error: `Could not add the provider: ${insertError?.message || 'unknown error'}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    id: created.id,
    // Routable = has coordinates, so it can be ranked by distance in the assignment list.
    routable: Boolean(coords),
    addressGiven: hasAddress,
    rexLoginExists,
  });
}
