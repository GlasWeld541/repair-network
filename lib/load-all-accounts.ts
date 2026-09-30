import { supabase } from '@/lib/supabase';

/**
 * Every network account, read in pages past Supabase's 1000-row response cap.
 *
 * Since the cohort import there are 4,200+ accounts, and a single `from('accounts')` query
 * silently returns only the first 1000 alphabetically. Pages that looked a name up in that list
 * showed "Unknown account" for everyone after the cut-off, and their account pickers were missing
 * most accounts. Ordered by name then id so pages never overlap or skip a row. Stops at the first
 * failed page rather than throwing, so a hiccup degrades to a partial list, not a blank page.
 */
export async function loadAllAccounts<T>(columns: string): Promise<T[]> {
  const PAGE = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('accounts')
      .select(columns)
      .order('account_name')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) break;
    const page = (data as T[] | null) ?? [];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}
