-- Where the customer marked the damage on their windshield photo (SmartScan), so the intake queue
-- and the job page can draw the marks on the photo, as Rex's old request queue did.
--   damage_marks  [{ "x": 0..1, "y": 0..1 }, ...], one per marked spot, as fractions of the
--                 windshield photo's width and height (the photo saved as windshield.*)
alter table network.consumer_intakes
  add column if not exists damage_marks jsonb;

-- Backfill from Rex's copy of each lead (public.customer_intakes keeps the marks and the id of the
-- Network intake it was forwarded as). A single legacy {x,y} point becomes a one-mark list.
update network.consumer_intakes ci
set damage_marks = case
    when jsonb_typeof(pi.damage_mark) = 'array' then (
      select jsonb_agg(jsonb_build_object('x', m->'x', 'y', m->'y'))
      from jsonb_array_elements(pi.damage_mark) m
      where jsonb_typeof(m->'x') = 'number' and jsonb_typeof(m->'y') = 'number'
    )
    when jsonb_typeof(pi.damage_mark->'x') = 'number' then
      jsonb_build_array(jsonb_build_object('x', pi.damage_mark->'x', 'y', pi.damage_mark->'y'))
    else null
  end
from public.customer_intakes pi
where pi.repair_network_intake_id = ci.id::text
  and pi.damage_mark is not null
  and ci.damage_marks is null;
