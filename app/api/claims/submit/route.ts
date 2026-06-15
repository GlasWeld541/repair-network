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
  claim_routing_enabled?: boolean | null;
  claim_capacity_daily?: number | null;
  claim_capacity_weekly?: number | null;
};

type CapacityCounts = {
  today: Record<string, number>;
  week: Record<string, number>;
};

type RoutingResult = {
  account: AccountRow | null;
  distanceMiles: number | null;
  candidateCount: number;
};

type DuplicateMatch = {
  id: string;
  claim_number: string | null;
  policy_number: string | null;
  customer_name: string | null;
  loss_date: string | null;
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

async function geocodeClaimLocation(payload: ClaimPayload) {
  const suppliedLatitude = numeric(payload.loss_latitude);
  const suppliedLongitude = numeric(payload.loss_longitude);

  if (suppliedLatitude !== null && suppliedLongitude !== null) {
    return {
      latitude: suppliedLatitude,
      longitude: suppliedLongitude,
    };
  }

  const token =
    process.env.MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

  if (!token) return null;

  const location = [
    clean(payload.loss_street),
    clean(payload.loss_city),
    clean(payload.loss_state),
    clean(payload.loss_postal_code),
  ]
    .filter(Boolean)
    .join(', ');

  if (!location) return null;

  const query = encodeURIComponent(location);
  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${token}&limit=1&country=US`
  );

  if (!response.ok) return null;

  const data = await response.json();
  const center = data.features?.[0]?.center;

  if (!center || center.length !== 2) return null;

  return {
    longitude: Number(center[0]),
    latitude: Number(center[1]),
  };
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
    account.claim_routing_enabled !== false &&
    account.glasweld_certified === 'Yes' &&
    account.uses_onyx === 'Yes' &&
    account.uses_zoom_injector === 'Yes' &&
    account.repair_only === 'Yes'
  );
}

function startOfUtcDay() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcWeek() {
  const today = startOfUtcDay();
  const day = today.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  today.setUTCDate(today.getUTCDate() + mondayOffset);
  return today;
}

async function loadCapacityCounts(
  admin: ReturnType<typeof createAdminClient>,
  accountIds: string[]
): Promise<CapacityCounts> {
  if (!accountIds.length) return { today: {}, week: {} };

  const weekStart = startOfUtcWeek().toISOString();

  const { data } = await admin
    .from('jobs')
    .select('assigned_account_id, created_at')
    .in('assigned_account_id', accountIds)
    .gte('created_at', weekStart);

  const todayStart = startOfUtcDay().toISOString();

  return ((data as { assigned_account_id: string | null; created_at: string }[]) || []).reduce<CapacityCounts>(
    (counts, job) => {
      if (!job.assigned_account_id) return counts;

      counts.week[job.assigned_account_id] =
        (counts.week[job.assigned_account_id] || 0) + 1;

      if (job.created_at >= todayStart) {
        counts.today[job.assigned_account_id] =
          (counts.today[job.assigned_account_id] || 0) + 1;
      }

      return counts;
    },
    { today: {}, week: {} }
  );
}

function hasAvailableCapacity(account: AccountRow, counts: CapacityCounts) {
  const dailyLimit = Number(account.claim_capacity_daily || 0);
  const weeklyLimit = Number(account.claim_capacity_weekly || 0);

  if (dailyLimit > 0 && (counts.today[account.id] || 0) >= dailyLimit) {
    return false;
  }

  if (weeklyLimit > 0 && (counts.week[account.id] || 0) >= weeklyLimit) {
    return false;
  }

  return true;
}

async function nearestGreenlitAccount(
  admin: ReturnType<typeof createAdminClient>,
  coordinates: { latitude: number; longitude: number } | null
): Promise<RoutingResult> {
  if (!coordinates) {
    return { account: null, distanceMiles: null, candidateCount: 0 };
  }

  const { data } = await admin
    .from('accounts')
    .select(
      'id, account_name, latitude, longitude, glasweld_certified, uses_onyx, uses_zoom_injector, repair_only, network_fit, claim_routing_enabled, claim_capacity_daily, claim_capacity_weekly'
    )
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  const greenlitAccounts = ((data as AccountRow[]) || []).filter(isGreenlitAccount);
  const capacityCounts = await loadCapacityCounts(
    admin,
    greenlitAccounts.map((account) => account.id)
  );

  const candidates = greenlitAccounts
    .filter((account) => hasAvailableCapacity(account, capacityCounts))
    .map((account) => ({
      account,
      distance: distanceMiles(
        coordinates.latitude,
        coordinates.longitude,
        Number(account.latitude),
        Number(account.longitude)
      ),
    }))
    .sort((a, b) => a.distance - b.distance);

  return {
    account: candidates[0]?.account || null,
    distanceMiles: candidates[0]?.distance ?? null,
    candidateCount: candidates.length,
  };
}

async function findDuplicateClaim(
  admin: ReturnType<typeof createAdminClient>,
  carrierId: string,
  payload: ClaimPayload
) {
  const claimNumber = clean(payload.claim_number);

  if (claimNumber) {
    const { data } = await admin
      .from('claim_intakes')
      .select('id, claim_number, policy_number, customer_name, loss_date')
      .eq('carrier_id', carrierId)
      .eq('claim_number', claimNumber)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      return {
        match: data as DuplicateMatch,
        reason: `Same carrier and claim number ${claimNumber}.`,
      };
    }
  }

  const policyNumber = clean(payload.policy_number);
  const customerName = clean(payload.customer_name).toLowerCase();
  const lossDate = clean(payload.loss_date);

  if (!policyNumber || !customerName || !lossDate) {
    return { match: null, reason: null };
  }

  const { data } = await admin
    .from('claim_intakes')
    .select('id, claim_number, policy_number, customer_name, loss_date')
    .eq('carrier_id', carrierId)
    .eq('policy_number', policyNumber)
    .eq('loss_date', lossDate)
    .ilike('customer_name', clean(payload.customer_name))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data) {
    return {
      match: data as DuplicateMatch,
      reason: 'Same carrier, policy number, customer, and loss date.',
    };
  }

  return { match: null, reason: null };
}

async function queueNotification(
  admin: ReturnType<typeof createAdminClient>,
  event: {
    event_type: string;
    audience: 'admin' | 'shop' | 'carrier' | 'billing';
    claim_intake_id?: string | null;
    job_id?: string | null;
    account_id?: string | null;
    carrier_id?: string | null;
    recipient_email?: string | null;
    subject: string;
    body: string;
    metadata?: Record<string, unknown>;
  }
) {
  await admin.from('notification_events').insert({
    ...event,
    status: 'pending',
    metadata: event.metadata || {},
  });
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

    const duplicate = await findDuplicateClaim(admin, carrierId, payload);
    const geocodedLocation = await geocodeClaimLocation(payload);
    const nearestResult = await nearestGreenlitAccount(admin, geocodedLocation);
    const nearestAccount = nearestResult.account;

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
    let selectedDistanceMiles: number | null = nearestResult.distanceMiles;
    let routingMethod: 'nearest_greenlit' | 'fallback_rule' | 'admin_review' =
      selectedAccount ? 'nearest_greenlit' : 'admin_review';

    if (matchedRule?.account_id) {
      const { data: account } = await admin
        .from('accounts')
        .select('id, account_name, claim_routing_enabled, claim_capacity_daily, claim_capacity_weekly')
        .eq('id', matchedRule.account_id)
        .maybeSingle();

      const fallbackAccount = (account as AccountRow) || null;

      if (fallbackAccount?.claim_routing_enabled !== false) {
        const fallbackCounts = await loadCapacityCounts(admin, [fallbackAccount.id]);
        selectedAccount = hasAvailableCapacity(fallbackAccount, fallbackCounts)
          ? fallbackAccount
          : null;
        selectedDistanceMiles = null;
        routingMethod = selectedAccount ? 'fallback_rule' : 'admin_review';
      }
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
        duplicate_warning: Boolean(duplicate.match),
        duplicate_of_claim_id: duplicate.match?.id || null,
        duplicate_reason: duplicate.reason,
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
        loss_latitude: geocodedLocation?.latitude ?? null,
        loss_longitude: geocodedLocation?.longitude ?? null,
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

    await admin.from('claim_routing_audits').insert({
      claim_intake_id: claim.id,
      routing_method: routingMethod,
      selected_account_id: selectedAccount?.id || null,
      selected_distance_miles: selectedDistanceMiles,
      candidate_count: nearestResult.candidateCount,
      notes: selectedAccount
        ? `Claim routed by ${routingMethod.replace('_', ' ')}.`
        : 'No eligible greenlit shop or fallback route was available.',
    });

    let jobId: string | null = null;

    if (selectedAccount) {
      const { data: job, error: jobError } = await admin
        .from('jobs')
        .insert({
          claim_intake_id: claim.id,
          carrier_id: carrierId,
          claim_source: source,
          intake_origin: source === 'edi' ? 'edi' : 'carrier',
          service_type: 'repair',
          payment_path: 'insurance',
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

    await queueNotification(admin, {
      event_type: 'Claim Received',
      audience: 'admin',
      claim_intake_id: claim.id,
      carrier_id: carrierId,
      subject: `New claim received: ${claim.customer_name}`,
      body: selectedAccount
        ? 'A new claim was received and automatically assigned.'
        : 'A new claim was received and needs routing review.',
      metadata: {
        assigned: Boolean(jobId),
        duplicate_warning: Boolean(duplicate.match),
      },
    });

    if (jobId && selectedAccount) {
      await queueNotification(admin, {
        event_type: 'Claim Assigned',
        audience: 'shop',
        claim_intake_id: claim.id,
        job_id: jobId,
        account_id: selectedAccount.id,
        carrier_id: carrierId,
        subject: `New routed claim: ${claim.customer_name}`,
        body: 'A carrier claim has been assigned to this shop.',
      });
    }

    return NextResponse.json({
      success: true,
      claimId: claim.id,
      assigned: Boolean(jobId),
      status: selectedAccount ? 'Assigned' : 'Received',
      duplicateWarning: Boolean(duplicate.match),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Claim submission failed.' },
      { status: 500 }
    );
  }
}
