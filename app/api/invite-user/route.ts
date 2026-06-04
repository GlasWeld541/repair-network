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
    const redirectTo = 'https://repair-network.vercel.app/set-password';

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      normalizedEmail,
      { redirectTo }
    );

    if (error) {
      const alreadyExists = /already|registered|exists/i.test(error.message);

      if (alreadyExists) {
        const { data: resetData, error: resetError } =
          await supabaseAdmin.auth.resetPasswordForEmail(normalizedEmail, {
            redirectTo,
          });

        if (resetError) {
          return NextResponse.json({ error: resetError.message }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          mode: 'password_reset',
          data: resetData,
        });
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, mode: 'invite', data });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
