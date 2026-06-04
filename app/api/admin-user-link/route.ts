import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase';

const REDIRECT_TO = 'https://repair-network.vercel.app/set-password';

export async function POST(request: Request) {
  try {
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

    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, approved, access_status')
      .eq('user_email', user.email.toLowerCase())
      .maybeSingle();

    const isAdmin =
      roleData?.role === 'admin' &&
      roleData.approved === true &&
      roleData.access_status === 'Active';

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const { email } = await request.json();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail) {
      return NextResponse.json({ error: 'Email required.' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: recoveryData, error: recoveryError } =
      await admin.auth.admin.generateLink({
        type: 'recovery',
        email: normalizedEmail,
        options: { redirectTo: REDIRECT_TO },
      });

    if (!recoveryError && recoveryData.properties?.action_link) {
      return NextResponse.json({
        success: true,
        mode: 'password_reset',
        setupLink: recoveryData.properties.action_link,
      });
    }

    const { data: inviteData, error: inviteError } =
      await admin.auth.admin.generateLink({
        type: 'invite',
        email: normalizedEmail,
        options: { redirectTo: REDIRECT_TO },
      });

    if (inviteError || !inviteData.properties?.action_link) {
      return NextResponse.json(
        {
          error:
            inviteError?.message ||
            recoveryError?.message ||
            'Could not generate setup link.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      mode: 'invite',
      setupLink: inviteData.properties.action_link,
    });
  } catch {
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
