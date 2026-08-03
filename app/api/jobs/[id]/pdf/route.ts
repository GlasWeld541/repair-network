import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// pdf-lib's Helvetica can only encode WinAnsi (~Latin-1). Real customer names / damage
// notes may carry emoji, CJK, or smart punctuation, which make drawText throw. Normalize
// the common smart punctuation and drop anything else outside the printable Latin-1 range
// so a job never 500s on exotic input.
function safe(value: unknown): string {
  return String(value ?? '')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—―]/g, '-')
    .replace(/…/g, '...')
    .replace(/•/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
    .trim();
}

function clean(value: unknown) {
  return safe(value) || '—';
}

// A blank fill-in line for the paper workflow when a field isn't set yet.
function orBlank(value: unknown, blank = '______________________________') {
  const s = safe(value);
  return s || blank;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Service-role (server-only): the `anon` role has no grant on network.jobs, so the
    // anon-key pattern used elsewhere would fail here. This route reads a single job by
    // id and renders a paper assignment sheet — no user-supplied filtering.
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return new NextResponse('Server not configured', { status: 500 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { db: { schema: 'network' }, auth: { persistSession: false } }
    );

    const { data: job, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !job) {
      return new NextResponse('Job not found', { status: 404 });
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
      page.drawText(value, { x, y, size, font: isBold ? bold : font, color });
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

    // Wrap a string to `maxChars`-wide lines (Helvetica ~9pt), capped at `maxLines`.
    function wrap(value: string, maxChars: number, maxLines: number): string[] {
      const words = String(value || '').split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let current = '';
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length > maxChars && current) {
          lines.push(current);
          current = word;
          if (lines.length === maxLines - 1) break;
        } else {
          current = candidate;
        }
      }
      if (current && lines.length < maxLines) lines.push(current);
      // If we ran out of room mid-text, mark the last line as truncated.
      const consumed = lines.join(' ').split(/\s+/).filter(Boolean).length;
      if (consumed < words.length && lines.length) {
        lines[lines.length - 1] = `${lines[lines.length - 1]}...`;
      }
      return lines;
    }

    const jobShort = String(id).slice(0, 8).toUpperCase();
    const created = job.created_at
      ? new Date(job.created_at).toLocaleDateString()
      : '—';
    const vehicle =
      [job.vehicle_year, job.vehicle_make, job.vehicle_model]
        .filter(Boolean)
        .join(' ') || '—';

    // Header
    text('GlasWeld Repair Network', 48, 740, 18, true);
    text('Job Assignment Sheet', 48, 723, 9, false, muted);

    text('JOB', 512, 740, 22, true);
    text(`Job #: ${jobShort}`, 430, 718, 10);
    text(`Date: ${created}`, 430, 703, 10);

    horizontal(692);

    // Status + assigned shop/tech band
    filledBox(48, 650, 516, 30);
    text('STATUS', 60, 668, 8, true, muted);
    text(clean(job.job_status || 'New'), 60, 654, 12, true);
    text('ASSIGNED TO', 300, 668, 8, true, muted);
    text(clean(job.assigned_account_name), 300, 654, 12, true);

    // Customer (left) / Vehicle (right)
    text('CUSTOMER', 48, 620, 9, true, muted);
    text(clean(job.customer_name), 48, 602, 11, true);
    text(`Phone: ${clean(job.customer_phone)}`, 48, 587, 9);
    text(`Email: ${clean(job.customer_email)}`, 48, 573, 9);

    text('VEHICLE', 320, 620, 9, true, muted);
    text(vehicle, 320, 602, 11, true);
    text(`VIN: ${clean(job.vehicle_vin)}`, 320, 587, 9);
    text(
      `Service: ${clean(job.service_type)}   -   Payment: ${clean(job.payment_path)}`,
      320,
      573,
      9
    );

    // Damage
    filledBox(48, 470, 516, 80);
    text('DAMAGE', 60, 534, 9, true, muted);
    text(`Type: ${clean(job.damage_type)}`, 60, 516, 10, true);
    const noteLines = wrap(safe(job.damage_notes) || '—', 96, 3);
    noteLines.forEach((ln, i) => text(ln, 60, 500 - i * 14, 9));

    // Insurance / claim
    filledBox(48, 388, 516, 62);
    text('INSURANCE / CLAIM INFORMATION', 60, 432, 9, true, muted);
    text(`Carrier: ${clean(job.insurance_carrier)}`, 60, 414, 9);
    text(`Claim #: ${clean(job.claim_number)}`, 240, 414, 9);
    text(`Policy #: ${clean(job.policy_number)}`, 410, 414, 9);
    text(`Loss Date: ${clean(job.loss_date)}`, 60, 398, 9);

    // Technician of record (pre-filled by Rex when a shop finishes; blank line otherwise)
    text('TECHNICIAN', 48, 360, 9, true, muted);
    text(`Name: ${orBlank(job.tech_name)}`, 60, 342, 10);

    // On-site notes area for the paper workflow
    text('WORK PERFORMED / NOTES', 48, 316, 9, true, muted);
    box(48, 160, 516, 148);

    // Sign-off
    text('Technician signature: ______________________________', 48, 135, 10);
    text('Date: ____________________', 380, 135, 10);

    // Footer
    horizontal(96);
    text('Generated by GlasWeld Repair Network', 48, 74, 8, false, muted);
    text(
      'Print and hand to the assigned shop/technician for the on-site repair.',
      48,
      60,
      8,
      false,
      muted
    );

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        // inline → opens in the browser PDF viewer so the shop can print directly.
        'Content-Disposition': `inline; filename="job-${jobShort}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Job PDF generation failed:', error);
    return new NextResponse('PDF generation failed', { status: 500 });
  }
}
