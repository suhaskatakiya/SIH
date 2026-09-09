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

-- 1. auth.users (mock auth records for local / Supabase instances)
insert into auth.users (
  id, instance_id, aud, role, phone, phone_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
(
  '22222222-2222-4222-8222-222222222222'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  '+919876543210',
  now(), now(), now(),
  '{"provider":"phone","providers":["phone"]}'::jsonb,
  '{}'::jsonb
),
(
  '44444444-4444-4444-8444-444444444444'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  '+919812345678',
  now(), now(), now(),
  '{"provider":"phone","providers":["phone"]}'::jsonb,
  '{}'::jsonb
),
(
  '33333333-3333-4333-8333-333333333333'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  '+919999900001',
  now(), now(), now(),
  '{"provider":"phone","providers":["phone"]}'::jsonb,
  '{}'::jsonb
)
on conflict (id) do nothing;

-- 2. public.profiles
insert into public.profiles (id, role, mobile_e164, profile_complete)
values
  ('22222222-2222-4222-8222-222222222222'::uuid, 'FARMER', '+919876543210', true),
  ('44444444-4444-4444-8444-444444444444'::uuid, 'FARMER', '+919812345678', true),
  ('33333333-3333-4333-8333-333333333333'::uuid, 'OPERATOR', '+919999900001', true)
on conflict (id) do update set role = excluded.role, profile_complete = excluded.profile_complete;

-- 3. public.farmers
insert into public.farmers (user_id, full_name, state_code, district, village, external_farmer_ref, preferred_language, privacy_acknowledged_at)
values
(
  '22222222-2222-4222-8222-222222222222'::uuid,
  'Ramesh Patel',
  'GJ',
  'Gandhinagar',
  'Demo Village',
  'GJ-GNR-004821',
  'hi',
  now()
),
(
  '44444444-4444-4444-8444-444444444444'::uuid,
  'Suresh Kumar',
  'GJ',
  'Gandhinagar',
  'Demo Village North',
  null,
  'hi',
  now()
)
on conflict (user_id) do update set
  full_name = excluded.full_name,
  state_code = excluded.state_code,
  district = excluded.district,
  village = excluded.village,
  external_farmer_ref = excluded.external_farmer_ref;

-- 4. public.centres
insert into public.centres (id, name, state_code, district, address_text, avg_service_minutes, active)
values (
  '11111111-1111-4111-8111-111111111111'::uuid,
  'SIH Demo Procurement Centre 01',
  'GJ',
  'Gandhinagar',
  'APMC Yard, Sector 11, Gandhinagar',
  10,
  true
)
on conflict (id) do update set
  name = excluded.name,
  state_code = excluded.state_code,
  district = excluded.district,
  avg_service_minutes = excluded.avg_service_minutes,
  active = excluded.active;

-- 5. public.operator_centres
insert into public.operator_centres (operator_user_id, centre_id)
values (
  '33333333-3333-4333-8333-333333333333'::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid
)
on conflict (operator_user_id, centre_id) do nothing;

-- 6. public.procurement_rates
insert into public.procurement_rates (id, state_code, scheme, season, commodity_code, rate_per_qtl, source, active)
values
(
  '88888888-8888-4888-8888-888888888881'::uuid,
  'GJ',
  'MSP Kharif',
  '2026-27',
  'PADDY_COMMON',
  2441.00,
  'Government of India MSP Notification 2026-27',
  true
),
(
  '88888888-8888-4888-8888-888888888882'::uuid,
  'GJ',
  'MSP Kharif',
  '2026-27',
  'PADDY_GRADE_A',
  2489.00,
  'Government of India MSP Notification 2026-27',
  true
),
(
  '88888888-8888-4888-8888-888888888883'::uuid,
  'GJ',
  'MSP Rabi',
  '2026-27',
  'WHEAT',
  2425.00,
  'Government of India MSP Notification 2026-27',
  true
),
(
  '88888888-8888-4888-8888-888888888884'::uuid,
  'GJ',
  'MSP Kharif',
  '2026-27',
  'MAIZE',
  2225.00,
  'Government of India MSP Notification 2026-27',
  true
),
(
  '88888888-8888-4888-8888-888888888885'::uuid,
  'GJ',
  'MSP Rabi',
  '2026-27',
  'BARLEY',
  1850.00,
  'Government of India MSP Notification 2026-27',
  true
),
(
  '88888888-8888-4888-8888-888888888886'::uuid,
  'GJ',
  'MSP Kharif',
  '2026-27',
  'BAJRA',
  2625.00,
  'Government of India MSP Notification 2026-27',
  true
),
(
  '88888888-8888-4888-8888-888888888887'::uuid,
  'GJ',
  'MSP Kharif',
  '2026-27',
  'JOWAR_HYBRID',
  3371.00,
  'Government of India MSP Notification 2026-27',
  true
),
(
  '88888888-8888-4888-8888-888888888888'::uuid,
  'GJ',
  'MSP Rabi',
  '2026-27',
  'CHANA',
  5650.00,
  'Government of India MSP Notification 2026-27',
  true
),
(
  '88888888-8888-4888-8888-888888888889'::uuid,
  'GJ',
  'MSP Kharif',
  '2026-27',
  'TUR_ARHAR',
  7550.00,
  'Government of India MSP Notification 2026-27',
  true
),
(
  '88888888-8888-4888-8888-88888888888a'::uuid,
  'GJ',
  'MSP Kharif',
  '2026-27',
  'MOONG',
  8682.00,
  'Government of India MSP Notification 2026-27',
  true
),
(
  '88888888-8888-4888-8888-88888888888b'::uuid,
  'GJ',
  'MSP Kharif',
  '2026-27',
  'URAD',
  7400.00,
  'Government of India MSP Notification 2026-27',
  true
),
(
  '88888888-8888-4888-8888-88888888888c'::uuid,
  'GJ',
  'MSP Kharif',
  '2026-27',
  'SOYBEAN_YELLOW',
  4892.00,
  'Government of India MSP Notification 2026-27',
  true
),
(
  '88888888-8888-4888-8888-88888888888d'::uuid,
  'GJ',
  'MSP Rabi',
  '2026-27',
  'MUSTARD',
  5950.00,
  'Government of India MSP Notification 2026-27',
  true
),
(
  '88888888-8888-4888-8888-88888888888e'::uuid,
  'GJ',
  'MSP Kharif',
  '2026-27',
  'GROUNDNUT',
  6783.00,
  'Government of India MSP Notification 2026-27',
  true
),
(
  '88888888-8888-4888-8888-88888888888f'::uuid,
  'GJ',
  'MSP Kharif',
  '2026-27',
  'COTTON_MEDIUM',
  7121.00,
  'Government of India MSP Notification 2026-27',
  true
)
on conflict (id) do update set
  rate_per_qtl = excluded.rate_per_qtl,
  active = excluded.active;

-- 7. public.slots for today and upcoming 2 days
-- Slot 1 (Today 09:00 - 09:30): Suresh's pre-booked slot
insert into public.slots (id, centre_id, date, start_time, end_time, capacity, booked_count, active)
values (
  '55555555-5555-4555-8555-555555555551'::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid,
  current_date,
  '09:00'::time,
  '09:30'::time,
  12,
  1,
  true
)
on conflict (centre_id, date, start_time, end_time) do update set
  booked_count = greatest(public.slots.booked_count, 1),
  active = true;

-- Remaining slots for today
insert into public.slots (centre_id, date, start_time, end_time, capacity, booked_count, active)
select '11111111-1111-4111-8111-111111111111'::uuid, current_date, t.st::time, t.et::time, 12, 0, true
from (values
  ('09:30', '10:00'),
  ('10:00', '10:30'),
  ('10:30', '11:00'),
  ('11:00', '11:30')
) as t(st, et)
on conflict (centre_id, date, start_time, end_time) do nothing;

-- Slots for tomorrow (Day + 1)
insert into public.slots (centre_id, date, start_time, end_time, capacity, booked_count, active)
select '11111111-1111-4111-8111-111111111111'::uuid, current_date + interval '1 day', t.st::time, t.et::time, 12, 0, true
from (values
  ('09:00', '09:30'),
  ('09:30', '10:00'),
  ('10:00', '10:30'),
  ('10:30', '11:00'),
  ('11:00', '11:30')
) as t(st, et)
on conflict (centre_id, date, start_time, end_time) do nothing;

-- Slots for Day + 2
insert into public.slots (centre_id, date, start_time, end_time, capacity, booked_count, active)
select '11111111-1111-4111-8111-111111111111'::uuid, current_date + interval '2 days', t.st::time, t.et::time, 12, 0, true
from (values
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
  '66666666-6666-4666-8666-666666666661'::uuid,
  'BK-2026-0001',
  f.id,
  '11111111-1111-4111-8111-111111111111'::uuid,
  '55555555-5555-4555-8555-555555555551'::uuid,
  'PADDY_COMMON',
  22.00,
  'IN_QUEUE'
from public.farmers f
where f.user_id = '44444444-4444-4444-8444-444444444444'::uuid
on conflict (reference) do nothing;

-- 9. Suresh's queue entry (checked-in, WAITING)
insert into public.queue_entries (booking_id, centre_id, date, seq, state)
values (
  '66666666-6666-4666-8666-666666666661'::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid,
  current_date,
  1,
  'WAITING'
)
on conflict (booking_id) do nothing;

-- 10. Procurement shell
insert into public.procurements (id, booking_id, centre_id, commodity_code, status)
values (
  '77777777-7777-4777-8777-777777777771'::uuid,
  '66666666-6666-4666-8666-666666666661'::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid,
  'PADDY_COMMON',
  'NOT_STARTED'
)
on conflict (booking_id) do nothing;

-- 11. Payment shell
insert into public.payments (procurement_id, status)
values (
  '77777777-7777-4777-8777-777777777771'::uuid,
  'NOT_STARTED'
)
on conflict (procurement_id) do nothing;

-- 12. Advance booking_ref_seq past seed data (BK-2026-0001) so next booking is BK-2026-0002
select setval('public.booking_ref_seq', 1, true);
