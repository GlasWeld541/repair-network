import os
from pathlib import Path
import pandas as pd
from supabase import create_client
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "final_repair_network_dataset.csv"

load_dotenv(ROOT / ".env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

client = create_client(SUPABASE_URL, SUPABASE_KEY)

df = pd.read_csv(CSV_PATH).fillna("")

def clean(x):
    return str(x).strip()

def norm(x):
    return clean(x).lower()

def yn_unknown(x):
    x = norm(x)
    if x in {"true", "yes", "y"}:
        return "Yes"
    if x in {"false", "no", "n"}:
        return "No"
    return "Unknown" if x == "" else clean(x)

account_id_map = {}
account_count = 0

for _, row in df.iterrows():
    account_name = clean(row.get("Account Name_contact", ""))
    billing_city = clean(row.get("Billing City_contact", ""))
    billing_state = clean(row.get("Billing State_contact", ""))

    if not account_name:
        continue

    key = (norm(account_name), norm(billing_city), norm(billing_state))

    if key in account_id_map:
        continue

    existing = (
        client.table("accounts")
        .select("id")
        .eq("account_name", account_name)
        .eq("billing_city", billing_city)
        .eq("billing_state", billing_state)
        .execute()
    )

    if existing.data:
        account_id = existing.data[0]["id"]
    else:
        try:
            inserted = client.table("accounts").insert({
                "account_name": account_name,
                "billing_city": billing_city or None,
                "billing_state": billing_state or None,
                "account_owner": clean(row.get("Account Owner", "")) or None,
                "company_phone": None,
                "company_email": None,
                "glasweld_certified": yn_unknown(row.get("GlasWeld Certified", "")),
                "glasweld_certified_v2": yn_unknown(row.get("GlasWeld Certified v2", "")),
                "uses_onyx": "Unknown",
                "uses_zoom_injector": "Unknown",
                "repair_only": "Likely Yes",
                "business_type": "Unknown",
                "network_fit": "Unscored",
                "outreach_status": "Not Contacted",
                "notes": None,
            }).execute()
            account_id = inserted.data[0]["id"]
            account_count += 1
        except Exception:
            continue

    account_id_map[key] = account_id

contact_count = 0

for _, row in df.iterrows():
    account_name = clean(row.get("Account Name_contact", ""))
    billing_city = clean(row.get("Billing City_contact", ""))
    billing_state = clean(row.get("Billing State_contact", ""))

    key = (norm(account_name), norm(billing_city), norm(billing_state))
    account_id = account_id_map.get(key)

    if not account_id:
        continue

    client.table("contacts").insert({
        "account_id": account_id,
        "account_name": account_name,
        "full_name": clean(row.get("Full Name", "")) or None,
        "first_name": None,
        "last_name": None,
        "email": clean(row.get("Email (Contacts)", "")) or None,
        "mobile": clean(row.get("Mobile", "")) or None,
        "phone": clean(row.get("Phone (Contacts)", "")) or None,
        "billing_city": billing_city or None,
        "billing_state": billing_state or None,
        "glasweld_certified": yn_unknown(row.get("GlasWeld Certified", "")),
        "glasweld_certified_v2": yn_unknown(row.get("GlasWeld Certified v2", "")),
        "certification_date": None,
        "contact_status": "Active",
        "notes": None,
    }).execute()
    contact_count += 1

print(f"Imported {account_count} accounts and {contact_count} contacts.")
