# GlasWeld Repair Network

A branded internal network management system for GlasWeld's repair-only partner strategy.

## What this does

- Stores **accounts** and **contacts** in Supabase
- Gives you a branded web interface to search, filter, and edit records
- Highlights the fields that matter most to your carrier and TPA pitch:
  - GlasWeld Certified
  - GlasWeld Certified v2
  - Uses ONYX
  - Uses Zoom Injector
  - Repair-Only
  - Outreach Status
  - Network Fit

## Files included

- `sql/schema.sql` - create the database tables in Supabase
- `scripts/import_network.py` - import the cleaned CSV into those tables
- `final_repair_network_dataset.csv` - your cleaned source file
- `app/` - the branded Next.js web interface
- `.env.example` - environment variables template

## Exact setup steps

### 1. Create a Supabase project

Create a new project in Supabase. Then open the SQL editor and paste in the contents of:

`sql/schema.sql`

Run it.

### 2. Get your keys

From Supabase, copy:

- Project URL
- anon public key
- service role key

### 3. Create your local environment file

Copy `.env.example` to `.env.local` and fill in your values.

### 4. Import your data

Install dependencies for the importer:

```bash
pip install supabase pandas
```

Then run:

```bash
python scripts/import_network.py
```

This loads:
- unique businesses into `accounts`
- linked people into `contacts`

### 5. Install the web app

```bash
npm install
```

### 6. Run locally

```bash
npm run dev
```

Open the local URL shown in your terminal.

### 7. Deploy to Vercel

- Create a Vercel account
- Create a new project
- Upload this folder or connect it through GitHub
- Add the same environment variables from `.env.local`
- Deploy

## Recommended first edits inside the app

After import, start by updating these account-level fields:

- Uses ONYX
- Uses Zoom Injector
- Repair-Only
- Business Type
- Network Fit
- Outreach Status
- Notes

## Important note

This is intentionally a **v1 internal system**. It is designed to get your network into a live, editable database with a branded interface quickly. It is not overbuilt.
