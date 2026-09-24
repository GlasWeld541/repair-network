import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase';
import { geocodeText } from '@/lib/geocode';

/**
 * Re-locate a provider from the address on their account.
 *
 * Editing street/city/state/ZIP on the account page used to save the text and never geocode it,
 * so coordinates stayed empty and the provider stayed unrankable by distance no matter what
 * address was entered. That silently broke the promise that an address can be "added later".
 * The account page calls this after any address field is saved.
 *
 * Clearing the address clears the coordinates too, so a stale location can never keep ranking a
 * provider near somewhere they no longer are. Admin-only.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: 'network' }, cookies: { get: (name) => cookieStore.get(name)?.value } },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: role } = await supabase
    .from('user_roles')
    .select('role, approved, access_status')
    .eq('user_email', user.email.toLowerCase())
    .maybeSingle();
  if (!(role?.approved === true && role.access_status === 'Active' && role.role === 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: account } = await admin
    .from('accounts')
    .select('street, city, state, postal_code')
    .eq('id', id)
    .maybeSingle();
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const query = [
    account.street,
    account.city,
    [account.state, account.postal_code].filter(Boolean).join(' '),
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(', ');

  const coords = query ? await geocodeText(query) : null;
  const { error } = await admin
    .from('accounts')
    .update({ latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ routable: Boolean(coords), addressGiven: Boolean(query) });
}
