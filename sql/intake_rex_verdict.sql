-- Customer Requests moved from the Rex admin to this intake queue (10/12 call). Brings over what
-- the Rex screen had and the queue lacked:
--   rex_verdict  Rex's SmartScan verdict as data: {overall, spots[]}, spot N = mark N = close-up N
--   admin_notes  the team's notes on the lead
-- and backfills past leads from Rex's copy (public.customer_intakes): the verdict, notes, and the
-- windshield / VIN / camera-zone photos the old 5-photo cap dropped (the marked windshield is
-- drawn on the windshield photo, so those leads showed no marks).
alter table network.consumer_intakes
  add column if not exists rex_verdict jsonb,
  add column if not exists admin_notes text;

update network.consumer_intakes ci
   set rex_verdict = jsonb_build_object(
         'overall', jsonb_build_object(
           'outcome', r.verdict->>'outcome', 'headline', r.verdict->>'headline',
           'detail', r.verdict->>'detail', 'damageRead', r.verdict->>'damageRead'),
         'spots', '[]'::jsonb)
  from public.customer_intakes r
 where r.repair_network_intake_id::text = ci.id::text
   and ci.rex_verdict is null
   and r.verdict ? 'outcome';

update network.consumer_intakes ci
   set admin_notes = r.admin_notes
  from public.customer_intakes r
 where r.repair_network_intake_id::text = ci.id::text
   and ci.admin_notes is null
   and coalesce(r.admin_notes, '') <> '';

insert into network.consumer_intake_photos (consumer_intake_id, file_name, file_url, storage_path)
select ci.id, x.name, x.url, null
  from network.consumer_intakes ci
  join public.customer_intakes r on r.repair_network_intake_id::text = ci.id::text
 cross join lateral (values
   ('windshield.jpg', r.windshield_photo_url),
   ('vin.jpg', r.vin_photo_url),
   ('adas.jpg', r.adas_photo_url)
 ) as x(name, url)
 where x.url is not null
   and not exists (
     select 1 from network.consumer_intake_photos p
      where p.consumer_intake_id = ci.id
        and lower(p.file_name) like split_part(x.name, '.', 1) || '%'
   );
