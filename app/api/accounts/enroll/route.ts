import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase';
import { geocodeText } from '@/lib/geocode';

/**
 * Add a provider to the network in one step (Shiloh, 2026-09-23: he decides who joins; 10/12 call:
 * centralize users, Trello #262): the account (shop or independent tech) on its plan, the person
 * as a contact, their login as the account's owner, and the invite to set a password and open Rex.
 * The login row ties the person to the account directly, so Rex no longer has to find them by
 * matching the account's email.
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
  providerType?: string;
  plan?: string;
  contactName?: string;
  certified?: string;
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
  const providerType = body.providerType === 'shop' ? 'shop' : 'independent_tech';
  const plan = body.plan === 'pro' ? 'pro' : 'free';
  const contactName = clean(body.contactName);
  // GlasWeld certification on the account (Yes / No / Unknown), as the Accounts list sets it. It
  // drives the certified-first ranking when jobs are assigned.
  const certified = ['Yes', 'No'].includes(clean(body.certified)) ? clean(body.certified) : 'Unknown';

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

  // The person's login becomes this account's owner, so it can't already belong to someone else.
  const { data: login } = await admin
    .from('user_roles')
    .select('role, account_id')
    .eq('user_email', email)
    .maybeSingle();
  if (login && (login.role !== 'shop' || login.account_id)) {
    return NextResponse.json(
      {
        error:
          login.role === 'shop'
            ? `${email} already signs in for another provider.`
            : `${email} is a GlasWeld ${login.role} login. Use a different email for the provider.`,
        existingId: login.role === 'shop' ? login.account_id : undefined,
      },
      { status: 409 },
    );
  }

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
      provider_type: providerType,
      subscription_tier: plan,
      glasweld_certified: certified,
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

  // The person, and their login as the owner. Done after the account so a failure here leaves a
  // provider the admin can finish from the account page (Contacts & Login Access), not a stray login.
  const { error: contactError } = await admin.from('contacts').insert({
    account_id: created.id,
    account_name: accountName,
    full_name: contactName || null,
    email,
    phone: phone || null,
  });
  const { error: accessError } = await admin.from('user_roles').upsert(
    {
      user_email: email,
      role: 'shop',
      approved: true,
      access_status: 'Active',
      account_id: created.id,
      carrier_id: null,
      shop_role: 'owner',
    },
    { onConflict: 'user_email' },
  );
  if (contactError || accessError) {
    return NextResponse.json(
      {
        error: `The account was added, but its login could not be set up: ${(accessError || contactError)?.message}. Finish it from the account page.`,
        existingId: created.id,
      },
      { status: 500 },
    );
  }

  // Someone who already has a Rex login just signs in; everyone else gets the invite.
  let invited = false;
  if (rexLoginExists !== true) {
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: 'https://repair-network.vercel.app/set-password?next=rex',
    });
    invited = !inviteError;
    if (inviteError && !/already|registered|exists/i.test(inviteError.message)) {
      return NextResponse.json({
        id: created.id,
        routable: Boolean(coords),
        addressGiven: hasAddress,
        rexLoginExists,
        invited: false,
        inviteError: inviteError.message,
      });
    }
  }

  return NextResponse.json({
    id: created.id,
    invited,
    // Routable = has coordinates, so it can be ranked by distance in the assignment list.
    routable: Boolean(coords),
    addressGiven: hasAddress,
    rexLoginExists,
  });
}
