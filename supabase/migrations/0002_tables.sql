-- ============================================================================
-- 0002_tables.sql — the 11 Phase 1 tables + every CHECK/UNIQUE/FK (§4.1)
--
-- Money and quantities are NUMERIC (never float). The API serializes them to
-- decimal STRINGS to match the contract (e.g. "18.40", "2441.00").
-- All critical mutations happen through the SECURITY DEFINER RPCs in later
-- migrations; direct table writes are blocked by RLS (0006).
-- ============================================================================

-- 1. profiles — one row per auth user. id == auth.users.id (§4.1).
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  role             public.role_enum not null default 'FARMER',
  mobile_e164      text not null unique,
  profile_complete boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint profiles_mobile_e164_format check (mobile_e164 ~ '^\+[1-9][0-9]{7,14}$')
);
comment on table public.profiles is 'Account + role. Role is never self-elevated (§4.1).';

-- 2. farmers — farmer identity + minimal profile (data minimization, §4.9).
create table public.farmers (
  id                     uuid primary key default extensions.gen_random_uuid(),
  user_id                uuid not null unique references public.profiles (id) on delete cascade,
  full_name              text not null,
  state_code             text not null,
  district               text not null,
  village                text not null,
  external_farmer_ref    text,
  preferred_language     text not null default 'hi',
  privacy_acknowledged_at timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- 3. centres — procurement centres.
create table public.centres (
  id                  uuid primary key default extensions.gen_random_uuid(),
  name                text not null,
  state_code          text not null,
  district            text not null,
  address_text        text,
  avg_service_minutes integer not null,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint centres_avg_service_minutes_positive check (avg_service_minutes > 0)
);

-- 4. operator_centres — which operator may act at which centre (§4.1).
-- Every operator mutation checks this link.
create table public.operator_centres (
  id               uuid primary key default extensions.gen_random_uuid(),
  operator_user_id uuid not null references public.profiles (id) on delete cascade,
  centre_id        uuid not null references public.centres (id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (operator_user_id, centre_id)
);

-- 5. procurement_rates — authoritative MSP/scheme rate config (§4.1, §4.9).
-- Read-only to farmer/operator; no edit API in Phase 1.
create table public.procurement_rates (
  id             uuid primary key default extensions.gen_random_uuid(),
  state_code     text not null,
  scheme         text not null,
  season         text not null,
  commodity_code text not null,
  rate_per_qtl   numeric(12, 2) not null,
  source         text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint procurement_rates_rate_positive check (rate_per_qtl > 0)
);

-- 6. slots — bookable capacity windows (§4.1). booked_count never exceeds capacity.
create table public.slots (
  id           uuid primary key default extensions.gen_random_uuid(),
  centre_id    uuid not null references public.centres (id) on delete cascade,
  date         date not null,
  start_time   time not null,
  end_time     time not null,
  capacity     integer not null,
  booked_count integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint slots_capacity_positive     check (capacity > 0),
  constraint slots_booked_count_nonneg    check (booked_count >= 0),
  constraint slots_booked_within_capacity check (booked_count <= capacity),
  constraint slots_time_order             check (end_time > start_time),
  unique (centre_id, date, start_time, end_time)
);

-- 7. bookings — a farmer's appointment for a slot (§4.1).
create table public.bookings (
  id                    uuid primary key default extensions.gen_random_uuid(),
  reference             text not null unique,
  farmer_id             uuid not null references public.farmers (id) on delete cascade,
  centre_id             uuid not null references public.centres (id),
  slot_id               uuid not null references public.slots (id),
  commodity_code        text not null,
  expected_quantity_qtl numeric(12, 2) not null,
  status                public.booking_status not null default 'BOOKED',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint bookings_quantity_positive check (expected_quantity_qtl > 0)
);

-- 8. queue_entries — live queue position for a checked-in booking (§4.1).
-- `seq` is a deterministic per-centre-per-day counter (no arbitrary priority).
create table public.queue_entries (
  id         uuid primary key default extensions.gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  centre_id  uuid not null references public.centres (id),
  date       date not null,
  seq        bigint not null,
  state      public.queue_state not null default 'WAITING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (centre_id, date, seq)
);

-- 9. procurements — one per booking; quality/quantity/rate/amount (§4.1).
create table public.procurements (
  id                uuid primary key default extensions.gen_random_uuid(),
  booking_id        uuid not null unique references public.bookings (id) on delete cascade,
  centre_id         uuid not null references public.centres (id),
  commodity_code    text not null,
  status            public.procurement_status not null default 'NOT_STARTED',
  quality_status    public.quality_status,
  quantity_qtl      numeric(12, 2),
  rate_per_qtl      numeric(12, 2),
  amount            numeric(14, 2),
  receipt_reference text unique,
  reject_reason     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint procurements_quantity_positive check (quantity_qtl is null or quantity_qtl > 0),
  constraint procurements_rate_positive     check (rate_per_qtl is null or rate_per_qtl > 0),
  constraint procurements_amount_nonneg     check (amount is null or amount >= 0)
);

-- 10. procurement_events — append-only audit trail (§4.1). No UPDATE/DELETE for
-- ordinary roles (enforced by RLS in 0006 + a guard trigger in 0005).
create table public.procurement_events (
  id             uuid primary key default extensions.gen_random_uuid(),
  procurement_id uuid not null references public.procurements (id) on delete cascade,
  type           public.procurement_event_type not null,
  actor_user_id  uuid references public.profiles (id),
  reason_code    text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

-- 11. payments — one per procurement; workflow state only, no money movement (§4.7).
create table public.payments (
  procurement_id uuid primary key references public.procurements (id) on delete cascade,
  amount         numeric(14, 2),
  status         public.payment_status not null default 'NOT_STARTED',
  reference      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint payments_amount_nonneg check (amount is null or amount >= 0)
);

-- Rate-limit / attempt bookkeeping for OTP (§4.2). Never stores the OTP itself.
create table public.otp_requests (
  id          uuid primary key default extensions.gen_random_uuid(),
  mobile_e164 text not null,
  requested_at timestamptz not null default now(),
  attempts    integer not null default 0,
  constraint otp_requests_mobile_format check (mobile_e164 ~ '^\+[1-9][0-9]{7,14}$')
);
