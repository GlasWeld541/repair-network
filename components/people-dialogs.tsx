'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/notifications';

/**
 * The Rex admin Users tab's person actions, on the Network People page (10/12 call: centralize
 * users). Add a staff user with a password, edit a person's name or email, and set a new
 * password. They call the same Rex endpoints the Users tab does, which accept Network admins;
 * changes to GlasWeld staff still need a super admin.
 */

type RexCall = <T>(path: string, init?: RequestInit) => Promise<T>;

export type EditablePerson = {
  user_id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
};

const input =
  'h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';
const label = 'mb-1 block text-xs font-medium text-slate-600';

function Shell({
  open,
  title,
  subtitle,
  saving,
  error,
  submitLabel,
  onClose,
  onSubmit,
  children,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  saving: boolean;
  error: string | null;
  submitLabel: string;
  onClose: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, saving, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4"
      onClick={() => !saving && onClose()}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {children}
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function useSave(onDone: () => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setSaving(false);
    }
  };
  return { saving, error, setError, run };
}

/** A GlasWeld staff login or in-house field tech, as the Rex Users tab's "Add user" made them. */
export function AddStaffDialog({
  open,
  rex,
  onClose,
  onCreated,
}: {
  open: boolean;
  rex: RexCall;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const empty = { first_name: '', last_name: '', email: '', password: '', role: 'field_tech', tier: 'field' };
  const [form, setForm] = useState(empty);
  const { saving, error, setError, run } = useSave(onCreated);
  useEffect(() => {
    if (open) {
      setForm(empty);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Shell
      open={open}
      title="Add a staff user"
      subtitle="A GlasWeld login with a role. They can sign in right away with this password."
      saving={saving}
      error={error}
      submitLabel="Add user"
      onClose={onClose}
      onSubmit={() => {
        if (form.password.length < 8) {
          setError('The password needs at least 8 characters.');
          return;
        }
        void run(async () => {
          await rex('/admin/users', {
            method: 'POST',
            body: JSON.stringify({
              email: form.email.trim(),
              password: form.password,
              first_name: form.first_name.trim(),
              last_name: form.last_name.trim(),
              role: form.role,
              // Only field techs pick a knowledge tier; CS reps and admins get theirs from the role.
              tier: form.role === 'field_tech' ? form.tier : undefined,
            }),
          });
          toast.success(`${form.email.trim()} added`);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="staff-first">First name</label>
          <input id="staff-first" className={input} value={form.first_name} onChange={set('first_name')} autoFocus />
        </div>
        <div>
          <label className={label} htmlFor="staff-last">Last name</label>
          <input id="staff-last" className={input} value={form.last_name} onChange={set('last_name')} />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="staff-email">Email</label>
        <input id="staff-email" type="email" required className={input} value={form.email} onChange={set('email')} />
      </div>
      <div>
        <label className={label} htmlFor="staff-pw">Password</label>
        <input id="staff-pw" type="text" required minLength={8} className={input} value={form.password} onChange={set('password')} />
        <p className="mt-1 text-xs text-slate-500">At least 8 characters. Share it with them; they can change it later.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="staff-role">Role</label>
          <select id="staff-role" className={input} value={form.role} onChange={set('role')}>
            <option value="field_tech">Field tech</option>
            <option value="cs_rep">CS rep</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {form.role === 'field_tech' ? (
          <div>
            <label className={label} htmlFor="staff-tier">Knowledge access</label>
            <select id="staff-tier" className={input} value={form.tier} onChange={set('tier')}>
              <option value="field">Field</option>
              <option value="pro">Pro</option>
            </select>
          </div>
        ) : (
          <p className="self-end pb-2 text-xs text-slate-500">
            {form.role === 'cs_rep' ? 'CS reps get the CS internal knowledge.' : 'Admins see everything.'}
          </p>
        )}
      </div>
    </Shell>
  );
}

/** Correct a person's name or the email they sign in with. */
export function EditPersonDialog({
  person,
  rex,
  onClose,
  onSaved,
}: {
  person: EditablePerson | null;
  rex: RexCall;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '' });
  const { saving, error, setError, run } = useSave(onSaved);
  useEffect(() => {
    if (person) {
      setForm({ first_name: person.first_name || '', last_name: person.last_name || '', email: person.email });
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Shell
      open={!!person}
      title="Edit person"
      subtitle="Their name, and the email they sign in with."
      saving={saving}
      error={error}
      submitLabel="Save"
      onClose={onClose}
      onSubmit={() =>
        person &&
        void run(async () => {
          const email = form.email.trim();
          await rex(`/admin/users/${person.user_id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              first_name: form.first_name.trim(),
              last_name: form.last_name.trim(),
              ...(email.toLowerCase() !== person.email.toLowerCase() ? { email } : {}),
            }),
          });
          toast.success('Saved');
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="edit-first">First name</label>
          <input id="edit-first" className={input} value={form.first_name} onChange={set('first_name')} autoFocus />
        </div>
        <div>
          <label className={label} htmlFor="edit-last">Last name</label>
          <input id="edit-last" className={input} value={form.last_name} onChange={set('last_name')} />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="edit-email">Email</label>
        <input id="edit-email" type="email" required className={input} value={form.email} onChange={set('email')} />
        <p className="mt-1 text-xs text-slate-500">
          Changing it changes the email they sign in with. A shop login on the Network is set from the account&apos;s
          Contacts &amp; Login Access.
        </p>
      </div>
    </Shell>
  );
}

/** Set a new password for someone who's locked out. */
export function ResetPasswordDialog({
  person,
  rex,
  onClose,
  onSaved,
}: {
  person: EditablePerson | null;
  rex: RexCall;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const { saving, error, setError, run } = useSave(onSaved);
  useEffect(() => {
    if (person) {
      setPassword('');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person]);

  return (
    <Shell
      open={!!person}
      title="Set a new password"
      subtitle={person ? `For ${person.email}. Their old password stops working.` : ''}
      saving={saving}
      error={error}
      submitLabel="Set password"
      onClose={onClose}
      onSubmit={() => {
        if (!person) return;
        if (password.length < 8) {
          setError('The password needs at least 8 characters.');
          return;
        }
        void run(async () => {
          await rex(`/admin/users/${person.user_id}/reset-password`, {
            method: 'POST',
            body: JSON.stringify({ new_password: password }),
          });
          toast.success('Password set. Share it with them.');
        });
      }}
    >
      <div>
        <label className={label} htmlFor="reset-pw">New password</label>
        <input
          id="reset-pw"
          type="text"
          required
          minLength={8}
          className={input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
      </div>
    </Shell>
  );
}
