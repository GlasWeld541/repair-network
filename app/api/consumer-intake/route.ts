import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

type IntakePayload = Record<string, string>;

const TEXT_FIELDS = [
  'lead_type',
  'source',
  'customer_name',
  'customer_phone',
  'customer_email',
  'postal_code',
  'city',
  'state',
  'street',
  'vehicle_year',
  'vehicle_make',
  'vehicle_model',
  'vehicle_vin',
  'damage_location',
  'damage_size',
  'damage_notes',
  'insurance_carrier',
  'policy_number',
  'claim_number',
  'agent_name',
  'agent_email',
  'agent_phone',
  'preferred_contact_method',
  'landing_page',
  'referrer',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'gclid',
  'device',
] as const;

function clean(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedSource(payload: IntakePayload) {
  if (payload.gclid) return 'google_ads';
  if (payload.utm_source?.toLowerCase().includes('google')) return 'google_ads';
  if (payload.utm_medium?.toLowerCase() === 'organic') return 'organic';
  if (payload.lead_type === 'agent') return 'agent';
  if (payload.referrer) return 'referral';
  return payload.source || 'web';
}

function normalizedPaymentPath(value: string) {
  if (value === 'cash' || value === 'insurance') return value;
  return 'unknown';
}

function safeFileName(fileName: string) {
  return fileName
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9.\-_]/g, '')
    .toLowerCase();
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const payload = TEXT_FIELDS.reduce<IntakePayload>((summary, field) => {
      summary[field] = clean(formData.get(field));
      return summary;
    }, {});

    const customerName = payload.customer_name;
    const customerPhone = payload.customer_phone;
    const customerEmail = payload.customer_email;

    if (!customerName) {
      return NextResponse.json(
        { error: 'Customer name is required.' },
        { status: 400 }
      );
    }

    if (!customerPhone && !customerEmail) {
      return NextResponse.json(
        { error: 'Phone or email is required.' },
        { status: 400 }
      );
    }

    if (!payload.postal_code) {
      return NextResponse.json(
        { error: 'ZIP code is required.' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const source = normalizedSource(payload);
    const leadType = payload.lead_type === 'agent' ? 'agent' : 'consumer';

    const { data: intake, error } = await admin
      .from('consumer_intakes')
      .insert({
        lead_type: leadType,
        source,
        payment_path: normalizedPaymentPath(formData.get('payment_path') as string),
        customer_name: customerName,
        customer_phone: customerPhone || null,
        customer_email: customerEmail || null,
        postal_code: payload.postal_code || null,
        city: payload.city || null,
        state: payload.state ? payload.state.toUpperCase() : null,
        street: payload.street || null,
        vehicle_year: payload.vehicle_year || null,
        vehicle_make: payload.vehicle_make || null,
        vehicle_model: payload.vehicle_model || null,
        vehicle_vin: payload.vehicle_vin || null,
        damage_location: payload.damage_location || null,
        damage_size: payload.damage_size || null,
        damage_notes: payload.damage_notes || null,
        insurance_carrier: payload.insurance_carrier || null,
        policy_number: payload.policy_number || null,
        claim_number: payload.claim_number || null,
        agent_name: payload.agent_name || null,
        agent_email: payload.agent_email || null,
        agent_phone: payload.agent_phone || null,
        preferred_contact_method: payload.preferred_contact_method || null,
        landing_page: payload.landing_page || null,
        referrer: payload.referrer || null,
        utm_source: payload.utm_source || null,
        utm_medium: payload.utm_medium || null,
        utm_campaign: payload.utm_campaign || null,
        utm_content: payload.utm_content || null,
        utm_term: payload.utm_term || null,
        gclid: payload.gclid || null,
        device: payload.device || null,
        raw_payload: payload,
      })
      .select('id')
      .single();

    if (error || !intake?.id) {
      return NextResponse.json(
        { error: error?.message || 'Could not submit intake.' },
        { status: 500 }
      );
    }

    const files = formData
      .getAll('photos')
      .filter((value): value is File => value instanceof File && value.size > 0)
      .slice(0, 5);

    for (const file of files) {
      const cleanName = safeFileName(file.name || 'damage-photo.jpg');
      const storagePath = `${intake.id}/${Date.now()}-${cleanName}`;
      const bytes = await file.arrayBuffer();

      const { error: uploadError } = await admin.storage
        .from('consumer-damage-photos')
        .upload(storagePath, bytes, {
          contentType: file.type || 'image/jpeg',
          upsert: false,
        });

      if (uploadError) continue;

      const { data: publicUrl } = admin.storage
        .from('consumer-damage-photos')
        .getPublicUrl(storagePath);

      await admin.from('consumer_intake_photos').insert({
        consumer_intake_id: intake.id,
        file_name: file.name || cleanName,
        file_url: publicUrl.publicUrl,
        storage_path: storagePath,
      });
    }

    await admin.from('notification_events').insert([
      {
        event_type: 'Consumer Intake Received',
        audience: 'admin',
        consumer_intake_id: intake.id,
        status: 'pending',
        subject: `New ${leadType} glass intake: ${customerName}`,
        body: 'A new consumer-first intake was submitted and needs triage.',
        metadata: {
          source,
          postal_code: payload.postal_code,
          payment_path: normalizedPaymentPath(formData.get('payment_path') as string),
        },
      },
      {
        event_type: 'Consumer Intake Confirmation',
        audience: 'customer',
        consumer_intake_id: intake.id,
        recipient_email: customerEmail || null,
        status: 'pending',
        subject: 'We received your windshield review request',
        body:
          'We received your windshield damage information. The next step is a repair-first review so we can help determine whether repair, replacement, cash pay, or insurance is the smarter path.',
        metadata: {
          customer_phone: customerPhone || null,
          source,
          postal_code: payload.postal_code,
        },
      },
    ]);

    return NextResponse.json({
      success: true,
      intakeId: intake.id,
    });
  } catch {
    return NextResponse.json(
      { error: 'Intake submission failed.' },
      { status: 500 }
    );
  }
}
