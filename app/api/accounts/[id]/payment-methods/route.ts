import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase';
import { getPaymentGateway } from '@/lib/payments';

/**
 * An admin saves a provider's card for them, e.g. over the phone (demo call 2026-09-29: "if
 * they're on the phone with somebody... I'll put it in for you").
 *
 * Until now the account page could only record a card by hand (brand, last 4, expiry). Those
 * rows have no processor token, so the charge path refuses them: the fee could never actually be
 * collected. This does it properly: the admin types the card into Braintree's own form in the
 * browser (it never reaches our servers), and the one-time nonce it returns is exchanged here for
 * a stored, verified, chargeable card, exactly as a provider's self-serve save in Rex does.
 *
 *  GET  -> { clientToken }  starts the card form for this provider
 *  POST { nonce, makeDefault? } -> saves it
 */

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
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: role } = await supabase
    .from('user_roles')
    .select('role, approved, access_status')
    .eq('user_email', user.email.toLowerCase())
    .maybeSingle();
  if (!(role?.approved === true && role.access_status === 'Active' && role.role === 'admin')) {
    return NextResponse.json({ error: 'Only an admin can add a card for a provider.' }, { status: 403 });
  }
  return null;
}

async function loadAccount(id: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('accounts')
    .select('id, account_name, company_email')
    .eq('id', id)
    .maybeSingle();
  return { admin, account: data };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const gateway = getPaymentGateway();
  if (!gateway) return NextResponse.json({ error: 'Payments are not switched on yet.' }, { status: 503 });

  const { id } = await params;
  const { account } = await loadAccount(id);
  if (!account) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  try {
    const customerId = await gateway.ensureCustomer({
      accountId: account.id,
      email: account.company_email,
      companyName: account.account_name,
    });
    return NextResponse.json({ clientToken: await gateway.clientToken(customerId) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const gateway = getPaymentGateway();
  if (!gateway) return NextResponse.json({ error: 'Payments are not switched on yet.' }, { status: 503 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { nonce?: string; makeDefault?: boolean };
  if (!body.nonce) return NextResponse.json({ error: 'No card details were received.' }, { status: 400 });
  const makeDefault = body.makeDefault !== false;

  const { admin, account } = await loadAccount(id);
  if (!account) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

  let saved;
  try {
    const customerId = await gateway.ensureCustomer({
      accountId: account.id,
      email: account.company_email,
      companyName: account.account_name,
    });
    saved = await gateway.vaultFromNonce({ customerId, nonce: body.nonce, makeDefault });
  } catch (e) {
    // Braintree verifies the card as it saves it; a rejection comes back here with its reason.
    return NextResponse.json({ error: (e as Error).message.replace(/^braintree: /, '') }, { status: 400 });
  }

  if (makeDefault) {
    // One default per account is enforced by a unique index, and the charge path charges "the"
    // default, so clear the old one before inserting.
    await admin
      .from('account_payment_methods')
      .update({ is_default: false })
      .eq('account_id', account.id)
      .eq('is_default', true);
  }
  const { error } = await admin.from('account_payment_methods').insert({
    account_id: account.id,
    method_type: saved.methodType,
    status: 'active',
    is_default: makeDefault,
    card_brand: saved.cardBrand,
    last4: saved.last4,
    exp_month: saved.expMonth,
    exp_year: saved.expYear,
    bank_name: saved.bankName ?? null,
    external_payment_method_id: saved.token,
    gateway_customer_id: account.id,
    gateway_provider: 'braintree',
    verified_at: new Date().toISOString(),
    notes: 'Added by an admin through the secure card form.',
  });
  if (error) {
    // The card is stored at Braintree but not recorded here; remove it so the two don't drift.
    await gateway.removeMethod(saved.token).catch(() => {});
    return NextResponse.json({ error: `Could not record the card: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    label: `${saved.cardBrand || saved.bankName || 'Card'} ending ${saved.last4 || '????'}`,
  });
}
