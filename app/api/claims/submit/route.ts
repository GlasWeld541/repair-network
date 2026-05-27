import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase';

type ClaimPayload = {
  carrier_id?: string;
  source?: 'manual' | 'edi' | 'api';
  claim_number?: string;
  policy_number?: string;
  loss_date?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  vehicle_year?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_vin?: string;
  damage_type?: string;
  damage_notes?: string;
  loss_street?: string;
  loss_city?: string;
  loss_state?: string;
  loss_postal_code?: string;
  loss_latitude?: number | string;
  loss_longitude?: number | string;
  preferred_contact_method?: string;
  notes?: string;
};

type RoutingRule = {
  account_id: string;
  state: string | null;
  postal_prefix: string | null;
};

type AccountRow = {
  id: string;
  account_name: string | null;
  latitude?: number | null;
  longitude?: number | null;
  glasweld_certified?: string | null;
  uses_onyx?: string | null;
  uses_zoom_injector?: string | null;
  repair_only?: string | null;
  network_fit?: string | null;
};

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function authorizedEdiCarrier(request: Request, payload: ClaimPayload) {
  const token = process.env.EDI_INGEST_TOKEN;
  if (!token || !payload.carrier_id) return null;

  const authorization = request.headers.get('authorization') || '';
  return authorization === `Bearer ${token}` ? payload.carrier_id : null;
}

async function loggedInCarrierId() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role, approved, access_status, carrier_id')
    .eq('user_email', user.email.toLowerCase())
    .maybeSingle();

  if (
    roleData?.role !== 'carrier' ||
    roleData.approved !== true ||
    roleData.access_status !== 'Active' ||
    !roleData.carrier_id
  ) {
    return null;
  }

  return {
    carrierId: roleData.carrier_id as string,
    email: user.email.toLowerCase(),
  };
}

function ruleMatches(rule: RoutingRule, payload: ClaimPayload) {
  const state = clean(payload.loss_state).toUpperCase();
  const postalCode = clean(payload.loss_postal_code);

  if (rule.state && rule.state.toUpperCase() !== state) return false;
  if (rule.postal_prefix && !postalCode.startsWith(rule.postal_prefix)) return false;

  return true;
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function distanceMiles(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(destinationLat - originLat);
  const dLng = toRad(destinationLng - originLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(originLat)) *
      Math.cos(toRad(destinationLat)) *
      Math.sin(dLng / 2) ** 2;

  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isGreenlitAccount(account: AccountRow) {
  const networkFit = String(account.network_fit || '').toLowerCase();

  if (networkFit.includes('do not use') || networkFit.includes('red')) {
    return false;
  }

  return (
    account.glasweld_certified === 'Yes' &&
    account.uses_onyx === 'Yes' &&
    account.uses_zoom_injector === 'Yes' &&
    account.repair_only === 'Yes'
  );
}

async function nearestGreenlitAccount(
  admin: ReturnType<typeof createAdminClient>,
  payload: ClaimPayload
) {
  const lossLatitude = numeric(payload.loss_latitude);
  const lossLongitude = numeric(payload.loss_longitude);

  if (lossLatitude === null || lossLongitude === null) return null;

  const { data } = await admin
    .from('accounts')
    .select(
      'id, account_name, latitude, longitude, glasweld_certified, uses_onyx, uses_zoom_injector, repair_only, network_fit'
    )
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  const candidates = ((data as AccountRow[]) || [])
    .filter(isGreenlitAccount)
    .map((account) => ({
      account,
      distance: distanceMiles(
        lossLatitude,
        lossLongitude,
        Number(account.latitude),
        Number(account.longitude)
      ),
    }))
    .sort((a, b) => a.distance - b.distance);

  return candidates[0]?.account || null;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ClaimPayload;
    const loggedInCarrier = await loggedInCarrierId();
    const ediCarrierId = authorizedEdiCarrier(request, payload);
    const carrierId = loggedInCarrier?.carrierId || ediCarrierId;
    const submittedByEmail = loggedInCarrier?.email || null;
    const source = ediCarrierId && !loggedInCarrier ? 'edi' : payload.source || 'manual';

    if (!carrierId) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    if (!clean(payload.customer_name)) {
      return NextResponse.json(
        { error: 'Customer name is required.' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data: carrier } = await admin
      .from('carrier_organizations')
      .select('id, organization_name, claim_submission_enabled')
      .eq('id', carrierId)
      .maybeSingle();

    if (!carrier || carrier.claim_submission_enabled === false) {
      return NextResponse.json(
        { error: 'Claim submission is not enabled for this carrier.' },
        { status: 403 }
      );
    }

    const nearestAccount = await nearestGreenlitAccount(admin, payload);

    const { data: rules } = await admin
      .from('carrier_claim_routing_rules')
      .select('account_id, state, postal_prefix')
      .eq('carrier_id', carrierId)
      .eq('active', true)
      .order('priority', { ascending: true });

    const matchedRule = nearestAccount
      ? null
      : ((rules as RoutingRule[]) || []).find((rule) =>
      ruleMatches(rule, payload)
    );

    let selectedAccount: AccountRow | null = nearestAccount;

    if (matchedRule?.account_id) {
      const { data: account } = await admin
        .from('accounts')
        .select('id, account_name')
        .eq('id', matchedRule.account_id)
        .maybeSingle();

      selectedAccount = (account as AccountRow) || null;
    }

    const { data: claim, error: claimError } = await admin
      .from('claim_intakes')
      .insert({
        carrier_id: carrierId,
        submitted_by_email: submittedByEmail,
        source,
        intake_status: selectedAccount ? 'assigned' : 'received',
        carrier_visible_status: selectedAccount ? 'Assigned' : 'Received',
        assignment_status: selectedAccount ? 'Auto Assigned' : 'Needs Review',
        assigned_account_id: selectedAccount?.id || null,
        claim_number: clean(payload.claim_number) || null,
        policy_number: clean(payload.policy_number) || null,
        loss_date: clean(payload.loss_date) || null,
        customer_name: clean(payload.customer_name),
        customer_phone: clean(payload.customer_phone) || null,
        customer_email: clean(payload.customer_email) || null,
        vehicle_year: clean(payload.vehicle_year) || null,
        vehicle_make: clean(payload.vehicle_make) || null,
        vehicle_model: clean(payload.vehicle_model) || null,
        vehicle_vin: clean(payload.vehicle_vin) || null,
        damage_type: clean(payload.damage_type) || null,
        damage_notes: clean(payload.damage_notes) || null,
        loss_street: clean(payload.loss_street) || null,
        loss_city: clean(payload.loss_city) || null,
        loss_state: clean(payload.loss_state).toUpperCase() || null,
        loss_postal_code: clean(payload.loss_postal_code) || null,
        loss_latitude: numeric(payload.loss_latitude),
        loss_longitude: numeric(payload.loss_longitude),
        preferred_contact_method: clean(payload.preferred_contact_method) || null,
        raw_payload: payload,
        notes: clean(payload.notes) || null,
      })
      .select('*')
      .single();

    if (claimError || !claim) {
      return NextResponse.json(
        { error: claimError?.message || 'Could not submit claim.' },
        { status: 500 }
      );
    }

    let jobId: string | null = null;

    if (selectedAccount) {
      const { data: job, error: jobError } = await admin
        .from('jobs')
        .insert({
          claim_intake_id: claim.id,
          carrier_id: carrierId,
          claim_source: source,
          assigned_account_id: selectedAccount.id,
          assigned_account_name: selectedAccount.account_name,
          customer_name: claim.customer_name,
          customer_phone: claim.customer_phone,
          customer_email: claim.customer_email,
          vehicle_year: claim.vehicle_year,
          vehicle_make: claim.vehicle_make,
          vehicle_model: claim.vehicle_model,
          vehicle_vin: claim.vehicle_vin,
          damage_type: claim.damage_type,
          damage_notes: claim.damage_notes,
          insurance_carrier: carrier.organization_name,
          claim_number: claim.claim_number,
          policy_number: claim.policy_number,
          loss_date: claim.loss_date,
          job_status: 'New',
          invoice_amount: 0,
          amount_paid: 0,
          invoice_date: new Date().toISOString().slice(0, 10),
        })
        .select('id')
        .single();

      if (!jobError && job?.id) {
        jobId = job.id as string;

        await admin
          .from('claim_intakes')
          .update({ assigned_job_id: jobId })
          .eq('id', claim.id);
      }
    }

    await admin.from('claim_status_events').insert({
      claim_intake_id: claim.id,
      event_type: selectedAccount ? 'Claim Assigned' : 'Claim Received',
      visible_to_carrier: true,
      note: selectedAccount
        ? 'Claim was received and assigned into the repair network.'
        : 'Claim was received and is waiting for routing review.',
      created_by_email: submittedByEmail,
    });

    return NextResponse.json({
      success: true,
      claimId: claim.id,
      assigned: Boolean(jobId),
      status: selectedAccount ? 'Assigned' : 'Received',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Claim submission failed.' },
      { status: 500 }
    );
  }
}
