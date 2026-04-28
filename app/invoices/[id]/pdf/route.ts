import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return new NextResponse('Missing Supabase env variables', { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !invoice) {
      return new NextResponse('Invoice not found', { status: 404 });
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = 740;

    function draw(text: string, x = 50, size = 10, isBold = false) {
      page.drawText(String(text || '—'), {
        x,
        y,
        size,
        font: isBold ? bold : font,
      });
      y -= size + 8;
    }

    const total = Number(invoice.invoice_amount || 0);
    const paid = Number(invoice.amount_paid || 0);
    const outstanding = total - paid;

    draw('GlasWeld Repair Network', 50, 20, true);
    draw('Claims Control Platform', 50, 10);
    y -= 15;

    draw('INVOICE', 50, 18, true);
    draw(`Invoice #: ${invoice.invoice_number || invoice.id}`, 50);
    draw(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`, 50);

    y -= 20;
    draw('From', 50, 12, true);
    draw(invoice.account_name, 50);
    draw(invoice.account_email, 50);
    draw(invoice.account_phone, 50);

    y -= 15;
    draw('To', 50, 12, true);
    draw(invoice.customer_name, 50);
    draw(invoice.customer_email, 50);
    draw(invoice.customer_phone, 50);

    y -= 20;
    draw('Job Details', 50, 12, true);
    draw(`Vehicle: ${invoice.vehicle || '—'}`, 50);
    draw(`VIN: ${invoice.vin || '—'}`, 50);
    draw(`Damage: ${invoice.damage_type || '—'}`, 50);
    draw(`Notes: ${invoice.damage_notes || '—'}`, 50);

    y -= 20;
    draw('Insurance / Claim Info', 50, 12, true);
    draw(`Carrier: ${invoice.insurance_carrier || '—'}`, 50);
    draw(`Claim #: ${invoice.claim_number || '—'}`, 50);
    draw(`Policy #: ${invoice.policy_number || '—'}`, 50);
    draw(`Loss Date: ${invoice.loss_date || '—'}`, 50);

    y -= 25;
    draw('Invoice Summary', 50, 12, true);
    draw(`Total: $${total.toFixed(2)}`, 50);
    draw(`Paid: $${paid.toFixed(2)}`, 50);
    draw(`Outstanding: $${outstanding.toFixed(2)}`, 50, 12, true);

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoice.invoice_number || 'invoice'}.pdf"`,
      },
    });
  } catch (error) {
    console.error('PDF generation failed:', error);
    return new NextResponse('PDF generation failed', { status: 500 });
  }
}