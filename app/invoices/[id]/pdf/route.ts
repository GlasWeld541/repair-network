import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id;

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

    let y = 750;

    function draw(text: string, size = 10, isBold = false) {
      page.drawText(text, {
        x: 50,
        y,
        size,
        font: isBold ? bold : font,
      });
      y -= size + 6;
    }

    draw('GlasWeld Repair Network', 18, true);
    draw('Invoice', 14, true);
    draw('');

    draw(`Invoice #: ${invoice.invoice_number}`);
    draw(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`);
    draw('');

    draw('Customer', 12, true);
    draw(invoice.customer_name || '—');
    draw(invoice.customer_email || '—');
    draw(invoice.customer_phone || '—');
    draw('');

    draw('Vehicle', 12, true);
    draw(invoice.vehicle || '—');
    draw(invoice.damage_type || '—');
    draw('');

    draw('Totals', 12, true);
    draw(`Total: $${invoice.invoice_amount || 0}`);
    draw(`Paid: $${invoice.amount_paid || 0}`);
    draw(
      `Outstanding: $${(invoice.invoice_amount || 0) - (invoice.amount_paid || 0)}`
    );

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=invoice-${invoice.invoice_number}.pdf`,
      },
    });
  } catch (err) {
    console.error(err);
    return new NextResponse('PDF generation failed', { status: 500 });
  }
}