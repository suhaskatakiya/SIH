-- ============================================================================
-- 0003_indexes.sql — indexes + the booking-reference sequence
--
-- Supports the hot read paths: centre/date slot lookups, a farmer's bookings,
-- a centre's live queue ordered by seq, and event history by procurement.
-- ============================================================================

-- Slots browsed by centre + date (farmer booking, operator slot mgmt).
create index slots_centre_date_idx on public.slots (centre_id, date);

-- A farmer's bookings, newest first; and a centre's bookings for a day.
create index bookings_farmer_idx      on public.bookings (farmer_id, created_at desc);
create index bookings_centre_date_idx on public.bookings (centre_id, created_at desc);
create index bookings_slot_idx        on public.bookings (slot_id);

-- Live queue: order a centre's active entries by the deterministic seq.
create index queue_centre_date_seq_idx on public.queue_entries (centre_id, date, seq);
create index queue_state_idx           on public.queue_entries (centre_id, date, state);

-- Event history for a procurement, chronological.
create index procurement_events_proc_idx on public.procurement_events (procurement_id, created_at);

-- Operator → centre resolution (used on every operator mutation).
create index operator_centres_user_idx on public.operator_centres (operator_user_id);

-- Active rate lookup by commodity (+ state) during procurement acceptance.
create index procurement_rates_lookup_idx
  on public.procurement_rates (commodity_code, state_code)
  where active;

-- Recent OTP requests per mobile (rate limiting).
create index otp_requests_mobile_time_idx on public.otp_requests (mobile_e164, requested_at desc);

-- Human-friendly booking references: BK-<year>-<zero-padded sequence>.
create sequence public.booking_ref_seq;
-- Receipt references: PR-<year>-<zero-padded sequence>.
create sequence public.receipt_ref_seq;
-- Payment references (fallback if the operator doesn't supply one): PAY-<year>-<seq>.
create sequence public.payment_ref_seq;
