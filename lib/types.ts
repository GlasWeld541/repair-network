export type Account = {
  id: string;
  account_name: string;
  billing_city: string | null;
  billing_state: string | null;
  account_owner: string | null;
  company_phone: string | null;
  company_email: string | null;
  glasweld_certified: string | null;
  certification_date: string | null;
  insurance: 'Yes' | 'No' | 'Unknown' | null;
  uses_onyx: 'Yes' | 'No' | 'Unknown';
  uses_zoom_injector: 'Yes' | 'No' | 'Unknown';
  repair_only: 'Yes' | 'No' | 'Likely Yes' | 'Unknown';
  business_type: string | null;
  network_fit: 'High' | 'Medium' | 'Low' | 'Unscored';
  outreach_status: 'Not Contacted' | 'Contacted' | 'Replied' | 'Qualified' | 'Onboarded' | 'Not a Fit';
  notes: string | null;
};

export type Contact = {
  id: string;
  account_id: string;
  account_name: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  mobile: string | null;
  phone: string | null;
  billing_city: string | null;
  billing_state: string | null;
  glasweld_certified: string | null;
  certification_date: string | null;
  contact_status: string | null;
  notes: string | null;
};
