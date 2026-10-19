import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Only a signed-in Network admin may send invites (both callers are admin screens). */
async function isNetworkAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: 'network' }, cookies: { get: (name) => cookieStore.get(name)?.value } },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return false;
  const { data: role } = await supabase
    .from('user_roles')
    .select('role, approved, access_status')
    .eq('user_email', user.email.toLowerCase())
    .maybeSingle();
  return role?.role === 'admin' && role.approved === true && role.access_status === 'Active';
}

export async function POST(req: Request) {
  try {
    if (!(await isNetworkAdmin())) {
      return NextResponse.json({ error: 'Only an admin can send invites.' }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Invite service is not configured.' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      db: { schema: 'network' },
    });

    const { email, next } = await req.json();
    // A shop login works in Rex (providers use Rex, the Network is GlasWeld's admin), so the
    // account page asks for next=rex and the set-password page sends them on to Rex afterwards.
    const redirectTo =
      next === 'rex'
        ? 'https://repair-network.vercel.app/set-password?next=rex'
        : 'https://repair-network.vercel.app/set-password';

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
