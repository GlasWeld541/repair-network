'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Carrier = {
  id: string;
  organization_name: string;
};

type Account = {
  id: string;
  account_name: string | null;
};

type RoutingRule = {
  id: string;
  carrier_id: string;
  account_id: string;
  rule_name: string | null;
  state: string | null;
  postal_prefix: string | null;
  priority: number;
  active: boolean;
};

export default function AdminRoutingPage() {
  const [loading, setLoading] = useState(true);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [newRule, setNewRule] = useState({
    carrier_id: '',
    account_id: '',
    rule_name: '',
    state: '',
    postal_prefix: '',
    priority: 100,
  });

  const isDemo = currentRole === 'demo';

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email?.toLowerCase() || '';

    if (!email) {
      window.location.href = '/login';
      return;
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, approved, access_status')
      .eq('user_email', email)
      .maybeSingle();

    if (
      !roleData ||
      roleData.approved !== true ||
      roleData.access_status !== 'Active' ||
      (roleData.role !== 'admin' && roleData.role !== 'demo')
    ) {
      window.location.href = '/';
      return;
    }

    setCurrentRole(roleData.role);

    const [{ data: carrierRows }, { data: accountRows }, { data: ruleRows }] =
      await Promise.all([
        supabase
          .from('carrier_organizations')
          .select('id, organization_name')
          .order('organization_name'),
        supabase
          .from('accounts')
          .select('id, account_name')
          .order('account_name'),
        supabase
          .from('carrier_claim_routing_rules')
          .select('*')
          .order('priority', { ascending: true }),
      ]);

    setCarriers((carrierRows as Carrier[]) || []);
    setAccounts((accountRows as Account[]) || []);
    setRules((ruleRows as RoutingRule[]) || []);
    setLoading(false);
  }

  function carrierName(id: string) {
    return carriers.find((carrier) => carrier.id === id)?.organization_name || 'Unknown carrier';
  }

  function accountName(id: string) {
    return accounts.find((account) => account.id === id)?.account_name || 'Unknown account';
  }

  async function addRule() {
    if (isDemo) return;

    if (!newRule.carrier_id || !newRule.account_id) {
      window.alert('Select a carrier and account.');
      return;
    }

    const { error } = await supabase.from('carrier_claim_routing_rules').insert({
      carrier_id: newRule.carrier_id,
      account_id: newRule.account_id,
      rule_name: newRule.rule_name.trim() || null,
      state: newRule.state.trim().toUpperCase() || null,
      postal_prefix: newRule.postal_prefix.trim() || null,
      priority: Number(newRule.priority || 100),
      active: true,
    });

    if (error) {
      window.alert(`Could not add rule: ${error.message}`);
      return;
    }

    setNewRule({
      carrier_id: '',
      account_id: '',
      rule_name: '',
      state: '',
      postal_prefix: '',
      priority: 100,
    });
    await load();
  }

  async function toggleRule(rule: RoutingRule) {
    if (isDemo) return;

    await supabase
      .from('carrier_claim_routing_rules')
      .update({ active: !rule.active })
      .eq('id', rule.id);

    await load();
  }

  async function deleteRule(ruleId: string) {
    if (isDemo) return;

    const confirmed = window.confirm('Delete this routing rule?');
    if (!confirmed) return;

    await supabase.from('carrier_claim_routing_rules').delete().eq('id', ruleId);
    await load();
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading routing...</div>;

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Routing Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Claims route to the nearest greenlit shop when coordinates are available. Rules below are fallback overrides by carrier, state, or ZIP prefix.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-lg font-semibold text-slate-900">Add Fallback Rule</h2>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <select value={newRule.carrier_id} onChange={(e) => setNewRule((current) => ({ ...current, carrier_id: e.target.value }))} disabled={isDemo} className="h-11 xl:col-span-2">
            <option value="">Select carrier / TPA</option>
            {carriers.map((carrier) => (
              <option key={carrier.id} value={carrier.id}>{carrier.organization_name}</option>
            ))}
          </select>

          <select value={newRule.account_id} onChange={(e) => setNewRule((current) => ({ ...current, account_id: e.target.value }))} disabled={isDemo} className="h-11 xl:col-span-2">
            <option value="">Select fallback account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.account_name || 'Unnamed Account'}</option>
            ))}
          </select>

          <input value={newRule.state} onChange={(e) => setNewRule((current) => ({ ...current, state: e.target.value.toUpperCase().slice(0, 2) }))} disabled={isDemo} placeholder="State" className="h-11" />
          <input value={newRule.postal_prefix} onChange={(e) => setNewRule((current) => ({ ...current, postal_prefix: e.target.value }))} disabled={isDemo} placeholder="ZIP prefix" className="h-11" />
          <input value={newRule.rule_name} onChange={(e) => setNewRule((current) => ({ ...current, rule_name: e.target.value }))} disabled={isDemo} placeholder="Rule name" className="h-11 xl:col-span-2" />
          <input type="number" value={newRule.priority} onChange={(e) => setNewRule((current) => ({ ...current, priority: Number(e.target.value || 100) }))} disabled={isDemo} placeholder="Priority" className="h-11" />
          <button type="button" onClick={() => void addRule()} disabled={isDemo} className="h-11 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white shadow-soft hover:bg-brand-700 disabled:opacity-60">
            Add Rule
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Fallback Rules</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1000px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Carrier / TPA</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">ZIP Prefix</th>
                <th className="px-4 py-3">Fallback Account</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{rule.priority}</td>
                  <td className="px-4 py-3">{carrierName(rule.carrier_id)}</td>
                  <td className="px-4 py-3">{rule.state || 'Any'}</td>
                  <td className="px-4 py-3">{rule.postal_prefix || 'Any'}</td>
                  <td className="px-4 py-3">{accountName(rule.account_id)}</td>
                  <td className="px-4 py-3">{rule.active ? 'Active' : 'Disabled'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => void toggleRule(rule)} disabled={isDemo} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                        {rule.active ? 'Disable' : 'Enable'}
                      </button>
                      <button type="button" onClick={() => void deleteRule(rule.id)} disabled={isDemo} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rules.length ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    No fallback routing rules yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
