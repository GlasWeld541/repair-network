import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function money(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function clean(value: unknown) {
  return value ? String(value) : '—';
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: 'Missing Supabase environment variables.' },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get('authorization') || '';

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !invoice) {
    return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  }

  const { data: photos } = await supabase
    .from('job_photos')
    .select('*')
    .eq('job_id', invoice.job_id);

  const pdfDoc = await PDFDocument.create();

  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = height - 60;

  function drawText(
    text: string,
    x: number,
    currentY: number,
    size = 10,
    isBold = false,
    color = rgb(0.08, 0.1, 0.16)
  ) {
    page.drawText(text, {
      x,
      y: currentY,
      size,
      font: isBold ? bold : font,
      color,
    });
  }

  function line(currentY: number) {
    page.drawLine({
      start: { x: 48, y: currentY },
      end: { x: width - 48, y: currentY },
      thickness: 1,
      color: rgb(0.82, 0.85, 0.9),
    });
  }

  drawText('GlasWeld Repair Network', 48, y, 18, true);
  drawText('Claims Control Platform', 48, y - 18, 9, false, rgb(0.35, 0.42, 0.52));

  drawText('INVOICE', width - 160, y, 18, true);
  drawText(clean(invoice.invoice_number), width - 160, y - 18, 10);
  drawText(new Date(invoice.created_at).toLocaleDateString(), width - 160, y - 34, 9, false, rgb(0.35, 0.42, 0.52));

  y -= 70;
  line(y);
  y -= 35;

  drawText('From', 48, y, 11, true);
  drawText('Bill To', 330, y, 11, true);

  y -= 20;
  drawText(clean(invoice.account_name), 48, y, 10, true);
  drawText(clean(invoice.customer_name), 330, y, 10, true);

  y -= 16;
  drawText(clean(invoice.account_street || invoice.account_address), 48, y, 9);
  drawText(clean(invoice.customer_email), 330, y, 9);

  y -= 14;
  drawText(
    [invoice.account_city, invoice.account_state, invoice.account_postal_code]
      .filter(Boolean)
      .join(', ') || '—',
    48,
    y,
    9
  );
  drawText(clean(invoice.customer_phone), 330, y, 9);

  y -= 14;
  drawText(clean(invoice.account_email), 48, y, 9);

  y -= 14;
  drawText(clean(invoice.account_phone), 48, y, 9);

  y -= 35;
  line(y);
  y -= 28;

  drawText('Job Details', 48, y, 13, true);
  y -= 22;

  drawText(`Vehicle: ${clean(invoice.vehicle)}`, 60, y, 10);
  y -= 16;
  drawText(`VIN: ${clean(invoice.vin)}`, 60, y, 10);
  y -= 16;
  drawText(`Damage: ${clean(invoice.damage_type)}`, 60, y, 10);
  y -= 16;
  drawText(`Notes: ${clean(invoice.damage_notes)}`.slice(0, 95), 60, y, 10);

  y -= 35;
  drawText('Insurance / Claim Information', 48, y, 13, true);
  y -= 22;

  drawText(`Carrier: ${clean(invoice.insurance_carrier)}`, 60, y, 10);
  y -= 16;
  drawText(`Claim #: ${clean(invoice.claim_number)}`, 60, y, 10);
  y -= 16;
  drawText(`Policy #: ${clean(invoice.policy_number)}`, 60, y, 10);
  y -= 16;
  drawText(`Loss Date: ${clean(invoice.loss_date)}`, 60, y, 10);

  y -= 40;
  line(y);
  y -= 30;

  const total = Number(invoice.invoice_amount || 0);
  const paid = Number(invoice.amount_paid || 0);
  const outstanding = total - paid;

  drawText('Invoice Summary', 48, y, 13, true);
  y -= 26;

  drawText('Total', 360, y, 11, true);
  drawText(money(total), 470, y, 11, true);
  y -= 20;

  drawText('Paid', 360, y, 11);
  drawText(money(paid), 470, y, 11);
  y -= 20;

  drawText('Outstanding', 360, y, 11, true);
  drawText(money(outstanding), 470, y, 11, true, rgb(0.55, 0.05, 0.1));

  y -= 45;

  const beforePhotos = (photos || []).filter((photo: any) => photo.type === 'before');
  const afterPhotos = (photos || []).filter((photo: any) => photo.type === 'after');

  if (beforePhotos.length || afterPhotos.length) {
    line(y);
    y -= 28;
    drawText('Repair Photos', 48, y, 13, true);
    y -= 20;

    drawText(`Before photos: ${beforePhotos.length}`, 60, y, 10);
    y -= 16;
    drawText(`After photos: ${afterPhotos.length}`, 60, y, 10);
    y -= 16;
    drawText('Photo images are stored with the job record in the repair network.', 60, y, 9, false, rgb(0.35, 0.42, 0.52));
  }

  page.drawText('Generated by GlasWeld Repair Network', {
    x: 48,
    y: 36,
    size: 8,
    font,
    color: rgb(0.45, 0.5, 0.58),
  });

  const pdfBytes = await pdfDoc.save();

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.invoice_number || 'invoice'}.pdf"`,
    },
  });
}