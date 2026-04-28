import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';

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

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

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

    const dark = rgb(0.08, 0.1, 0.16);
    const muted = rgb(0.38, 0.44, 0.52);
    const line = rgb(0.82, 0.85, 0.9);
    const light = rgb(0.95, 0.97, 0.99);

    function text(
      value: string,
      x: number,
      y: number,
      size = 10,
      isBold = false,
      color = dark
    ) {
      page.drawText(value, {
        x,
        y,
        size,
        font: isBold ? bold : font,
        color,
      });
    }

    function horizontal(y: number, x1 = 48, x2 = 564) {
      page.drawLine({
        start: { x: x1, y },
        end: { x: x2, y },
        thickness: 1,
        color: line,
      });
    }

    function box(x: number, y: number, w: number, h: number) {
      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        borderColor: line,
        borderWidth: 1,
      });
    }

    function filledBox(x: number, y: number, w: number, h: number) {
      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        color: light,
        borderColor: line,
        borderWidth: 1,
      });
    }

    const total = Number(invoice.invoice_amount || 0);
    const paid = Number(invoice.amount_paid || 0);
    const outstanding = total - paid;

    // Header
    text('GlasWeld Repair Network', 48, 730, 18, true);
    text('Claims Control Platform', 48, 712, 9, false, muted);

    text('INVOICE', 450, 730, 22, true);
    text(`Invoice #: ${clean(invoice.invoice_number)}`, 410, 708, 10);
    text(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`, 410, 692, 10);

    horizontal(670);

    // Bill From / Bill To
    text('BILL FROM', 48, 642, 9, true, muted);
    text(clean(invoice.account_name), 48, 622, 11, true);
    text(clean(invoice.account_street || invoice.account_address), 48, 606, 9);
    text(
      [invoice.account_city, invoice.account_state, invoice.account_postal_code]
        .filter(Boolean)
        .join(', ') || '—',
      48,
      592,
      9
    );
    text(clean(invoice.account_email), 48, 578, 9);
    text(clean(invoice.account_phone), 48, 564, 9);

    text('BILL TO', 330, 642, 9, true, muted);
    text(clean(invoice.customer_name), 330, 622, 11, true);
    text(clean(invoice.customer_email), 330, 606, 9);
    text(clean(invoice.customer_phone), 330, 592, 9);

    // Claim Info
    filledBox(48, 470, 516, 62);
    text('INSURANCE / CLAIM INFORMATION', 60, 512, 9, true, muted);
    text(`Carrier: ${clean(invoice.insurance_carrier)}`, 60, 494, 9);
    text(`Claim #: ${clean(invoice.claim_number)}`, 230, 494, 9);
    text(`Policy #: ${clean(invoice.policy_number)}`, 380, 494, 9);
    text(`Loss Date: ${clean(invoice.loss_date)}`, 60, 478, 9);

    // Services Table
    text('SERVICES', 48, 430, 11, true);

    const tableX = 48;
    const tableW = 516;
    const descX = 60;
    const qtyX = 425;
    const amountX = 500;
    const headerY = 392;
    const rowY = 318;
    const rowH = 74;

    filledBox(tableX, headerY, tableW, 28);
    text('Description', descX, headerY + 10, 9, true, muted);
    text('Qty', qtyX, headerY + 10, 9, true, muted);
    text('Amount', amountX, headerY + 10, 9, true, muted);

    box(tableX, rowY, tableW, rowH);

    // Column dividers
    page.drawLine({
      start: { x: 405, y: rowY },
      end: { x: 405, y: headerY + 28 },
      thickness: 1,
      color: line,
    });

    page.drawLine({
      start: { x: 475, y: rowY },
      end: { x: 475, y: headerY + 28 },
      thickness: 1,
      color: line,
    });

    text('Windshield rock chip repair', descX, rowY + 52, 10, true);
    text(`Vehicle: ${clean(invoice.vehicle)}`, descX, rowY + 35, 9);
    text(`VIN: ${clean(invoice.vin)}`, descX, rowY + 21, 9);
    text(`Damage: ${clean(invoice.damage_type)}`, descX, rowY + 7, 9);

    text('1', qtyX + 6, rowY + 35, 10);
    text(money(total), amountX - 8, rowY + 35, 10, true);

    // Notes
    filledBox(48, 245, 300, 54);
    text('NOTES', 60, 280, 9, true, muted);
    text(clean(invoice.damage_notes).slice(0, 90), 60, 262, 9);

    // Totals
    box(375, 232, 189, 92);
    text('Subtotal', 390, 294, 10);
    text(money(total), 490, 294, 10);

    text('Paid', 390, 272, 10);
    text(money(paid), 490, 272, 10);

    horizontal(258, 390, 545);

    text('Balance Due', 390, 240, 12, true);
    text(money(outstanding), 480, 240, 12, true);

    // Footer
    horizontal(90);
    text('Generated by GlasWeld Repair Network', 48, 68, 8, false, muted);
    text(
      'This invoice may be submitted to the customer or insurance carrier listed above.',
      48,
      54,
      8,
      false,
      muted
    );

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