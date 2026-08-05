-- Platform fee → 5% / 5% (was 3% repair / 7% replacement).
-- Decision from the Derek/Shiloh/Nayab walkthrough: a flat 5% on both repair and
-- replacement. Update the column defaults for future accounts, and migrate existing
-- rows that are still on the old defaults (300 / 700 bps) — leaving any intentionally
-- customized per-account fee untouched.

alter table network.accounts
  alter column repair_platform_fee_bps set default 500,
  alter column replacement_platform_fee_bps set default 500;

update network.accounts
  set repair_platform_fee_bps = 500
  where repair_platform_fee_bps = 300;

update network.accounts
  set replacement_platform_fee_bps = 500
  where replacement_platform_fee_bps = 700;
