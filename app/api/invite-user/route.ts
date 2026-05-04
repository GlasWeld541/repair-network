import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Invite service is not configured.' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email.trim().toLowerCase(),
      {
        redirectTo: 'https://repair-network.vercel.app/set-password',
      }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}