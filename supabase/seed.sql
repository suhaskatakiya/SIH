-- ============================================================================
-- seed.sql — Consistent SIH Demo Fixtures (§5.6)
--
-- Provides standard test identities and centre configuration for local dev and demos:
--   1. Ramesh Patel  (+919876543210) — FARMER (fresh profile completed)
--   2. Suresh Kumar  (+919812345678) — FARMER (pre-seeded waiting in today's queue)
--   3. Centre Op 01  (+919999900001) — OPERATOR for SIH Demo Procurement Centre 01
--   4. SIH Demo Procurement Centre 01 in Gandhinagar, Gujarat
--   5. MSP rate for PADDY_COMMON (2441.00 INR/qtl, Kharif 2026-27)
--   6. Bookable slots for today and upcoming 2 days
--   7. Suresh's booking (BK-2026-0001) in today's 09:00 slot with live WAITING queue entry
-- ============================================================================

begin;

-- Fixed UUID constants
create temp table _seed_constants (
  centre_id   uuid,
  ramesh_uid  uuid,
  suresh_uid  uuid,
  op_uid      uuid,
  slot_1_id   uuid,
  booking_1_id uuid,
  proc_1_id   uuid
) on commit drop;

insert into _seed_constants values (
  '11111111-1111-4111-8111-111111111111'::uuid,
  '22222222-2222-4222-8222-222222222222'::uuid,
  '44444444-4444-4444-8444-444444444444'::uuid,
  '33333333-3333-4333-8333-333333333333'::uuid,
  '55555555-5555-4555-8555-555555555551'::uuid,
  '66666666-6666-4666-8666-666666666661'::uuid,
  '77777777-7777-4777-8777-777777777771'::uuid
);

-- 1. auth.users (mock records for local / Supabase instances)
insert into auth.users (
  id, instance_id, aud, role, phone, phone_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
select
  c.ramesh_uid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  '+919876543210',
  now(), now(), now(),
  '{"provider":"phone","providers":["phone"]}'::jsonb,
  '{}'::jsonb
from _seed_constants c
on conflict (id) do nothing;

insert into auth.users (
  id, instance_id, aud, role, phone, phone_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
select
  c.suresh_uid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  '+919812345678',
  now(), now(), now(),
  '{"provider":"phone","providers":["phone"]}'::jsonb,
  '{}'::jsonb
from _seed_constants c
on conflict (id) do nothing;

insert into auth.users (
  id, instance_id, aud, role, phone, phone_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
select
  c.op_uid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  '+919999900001',
  now(), now(), now(),
  '{"provider":"phone","providers":["phone"]}'::jsonb,
  '{}'::jsonb
from _seed_constants c
on conflict (id) do nothing;

-- 2. public.profiles
insert into public.profiles (id, role, mobile_e164, profile_complete)
select c.ramesh_uid, 'FARMER', '+919876543210', true from _seed_constants c
on conflict (id) do update set role = excluded.role, profile_complete = excluded.profile_complete;

insert into public.profiles (id, role, mobile_e164, profile_complete)
select c.suresh_uid, 'FARMER', '+919812345678', true from _seed_constants c
on conflict (id) do update set role = excluded.role, profile_complete = excluded.profile_complete;

insert into public.profiles (id, role, mobile_e164, profile_complete)
select c.op_uid, 'OPERATOR', '+919999900001', true from _seed_constants c
on conflict (id) do update set role = excluded.role, profile_complete = excluded.profile_complete;

-- 3. public.farmers
insert into public.farmers (user_id, full_name, state_code, district, village, external_farmer_ref, preferred_language, privacy_acknowledged_at)
select c.ramesh_uid, 'Ramesh Patel', 'GJ', 'Gandhinagar', 'Demo Village', 'GJ-GNR-004821', 'hi', now()
from _seed_constants c
on conflict (user_id) do update set
  full_name = excluded.full_name,
  state_code = excluded.state_code,
  district = excluded.district,
  village = excluded.village,
  external_farmer_ref = excluded.external_farmer_ref;

insert into public.farmers (user_id, full_name, state_code, district, village, external_farmer_ref, preferred_language, privacy_acknowledged_at)
select c.suresh_uid, 'Suresh Kumar', 'GJ', 'Gandhinagar', 'Demo Village North', null, 'hi', now()
from _seed_constants c
on conflict (user_id) do update set
  full_name = excluded.full_name,
  state_code = excluded.state_code,
  district = excluded.district,
  village = excluded.village;

-- 4. public.centres
insert into public.centres (id, name, state_code, district, address_text, avg_service_minutes, active)
select c.centre_id, 'SIH Demo Procurement Centre 01', 'GJ', 'Gandhinagar', 'APMC Yard, Sector 11, Gandhinagar', 10, true
from _seed_constants c
on conflict (id) do update set
  name = excluded.name,
  state_code = excluded.state_code,
  district = excluded.district,
  avg_service_minutes = excluded.avg_service_minutes,
  active = excluded.active;

-- 5. public.operator_centres
insert into public.operator_centres (operator_user_id, centre_id)
select c.op_uid, c.centre_id from _seed_constants c
on conflict (operator_user_id, centre_id) do nothing;

-- 6. public.procurement_rates
insert into public.procurement_rates (state_code, scheme, season, commodity_code, rate_per_qtl, source, active)
values (
  'GJ',
  'MSP Kharif',
  '2026-27',
  'PADDY_COMMON',
  2441.00,
  'Government of India MSP Notification 2026-27',
  true
)
on conflict do nothing;

-- 7. public.slots for today and upcoming 2 days
-- Slot 1 (Today 09:00 - 09:30): Suresh's pre-booked slot
insert into public.slots (id, centre_id, date, start_time, end_time, capacity, booked_count, active)
select c.slot_1_id, c.centre_id, current_date, '09:00'::time, '09:30'::time, 12, 1, true
from _seed_constants c
on conflict (centre_id, date, start_time, end_time) do update set
  booked_count = greatest(public.slots.booked_count, 1),
  active = true;

-- Remaining slots for today
insert into public.slots (centre_id, date, start_time, end_time, capacity, booked_count, active)
select c.centre_id, current_date, t.st::time, t.et::time, 12, 0, true
from _seed_constants c,
(values
  ('09:30', '10:00'),
  ('10:00', '10:30'),
  ('10:30', '11:00'),
  ('11:00', '11:30')
) as t(st, et)
on conflict (centre_id, date, start_time, end_time) do nothing;

-- Slots for tomorrow (Day + 1)
insert into public.slots (centre_id, date, start_time, end_time, capacity, booked_count, active)
select c.centre_id, current_date + interval '1 day', t.st::time, t.et::time, 12, 0, true
from _seed_constants c,
(values
  ('09:00', '09:30'),
  ('09:30', '10:00'),
  ('10:00', '10:30'),
  ('10:30', '11:00'),
  ('11:00', '11:30')
) as t(st, et)
on conflict (centre_id, date, start_time, end_time) do nothing;

-- Slots for Day + 2
insert into public.slots (centre_id, date, start_time, end_time, capacity, booked_count, active)
select c.centre_id, current_date + interval '2 days', t.st::time, t.et::time, 12, 0, true
from _seed_constants c,
(values
  ('09:00', '09:30'),
  ('09:30', '10:00'),
  ('10:00', '10:30'),
  ('10:30', '11:00'),
  ('11:00', '11:30')
) as t(st, et)
on conflict (centre_id, date, start_time, end_time) do nothing;

-- 8. Suresh's booking (BK-2026-0001) in today's first slot
insert into public.bookings (
  id, reference, farmer_id, centre_id, slot_id,
  commodity_code, expected_quantity_qtl, status
)
select
  c.booking_1_id,
  'BK-2026-0001',
  f.id,
  c.centre_id,
  c.slot_1_id,
  'PADDY_COMMON',
  22.00,
  'IN_QUEUE'
from _seed_constants c
join public.farmers f on f.user_id = c.suresh_uid
on conflict (reference) do nothing;

-- 9. Suresh's queue entry (checked-in, WAITING)
insert into public.queue_entries (booking_id, centre_id, date, seq, state)
select c.booking_1_id, c.centre_id, current_date, 1, 'WAITING'
from _seed_constants c
on conflict (booking_id) do nothing;

-- 10. Procurement shell
insert into public.procurements (id, booking_id, centre_id, commodity_code, status)
select c.proc_1_id, c.booking_1_id, c.centre_id, 'PADDY_COMMON', 'NOT_STARTED'
from _seed_constants c
on conflict (booking_id) do nothing;

-- 11. Payment shell
insert into public.payments (procurement_id, status)
select c.proc_1_id, 'NOT_STARTED'
from _seed_constants c
on conflict (procurement_id) do nothing;

commit;
