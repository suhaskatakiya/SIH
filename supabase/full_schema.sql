-- ========================================================
-- CropSaathi Complete Phase 1 Database Schema & Seed
-- ========================================================

-- >>> 0001_enums.sql <<<
-- ============================================================================
-- 0001_enums.sql — extensions + enum types (§4.1)
--
-- Enum labels mirror @cropsaathi/contracts common.ts EXACTLY. A drift here is a
-- contract break, so keep these in lockstep with the Zod enums.
-- ============================================================================

-- gen_random_uuid(), digest(), etc. Supabase ships these in the `extensions` schema.
create extension if not exists pgcrypto with schema extensions;

-- Account role. No self-promotion: new users are always FARMER (§4.1).
create type public.role_enum as enum ('FARMER', 'OPERATOR');

-- Booking lifecycle (§4.1 bookings).
create type public.booking_status as enum (
  'BOOKED',
  'CHECKED_IN',
  'IN_QUEUE',
  'IN_SERVICE',
  'COMPLETED',
  'CANCELLED'
);

-- Queue entry lifecycle (§4.1 queue_entries).
create type public.queue_state as enum (
  'WAITING',
  'CALLED',
  'IN_SERVICE',
  'COMPLETED'
);

-- Coarse procurement workflow position. Advances one step per appended event.
-- QUALITY_IN_PROGRESS is produced by the QUALITY_STARTED event (§4.6).
create type public.procurement_status as enum (
  'NOT_STARTED',
  'QUALITY_IN_PROGRESS',
  'QUALITY_ACCEPTED',
  'QUALITY_REJECTED',
  'WEIGHMENT_RECORDED',
  'PROCUREMENT_ACCEPTED',
  'RECEIPT_GENERATED'
);

create type public.quality_status as enum ('PENDING', 'ACCEPTED', 'REJECTED');

create type public.payment_status as enum (
  'NOT_STARTED',
  'INITIATED',
  'PROCESSING',
  'CREDITED',
  'FAILED'
);

-- Event types accepted by POST /operator/procurements/{id}/events (§2.G).
create type public.procurement_event_type as enum (
  'QUALITY_STARTED',
  'QUALITY_ACCEPTED',
  'QUALITY_REJECTED',
  'WEIGHMENT_RECORDED',
  'PROCUREMENT_ACCEPTED',
  'RECEIPT_GENERATED'
);


-- >>> 0002_tables.sql <<<
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


-- >>> 0003_indexes.sql <<<
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


-- >>> 0004_helpers.sql <<<
-- ============================================================================
-- 0004_helpers.sql — shared helpers used by RLS policies and the RPCs
--
-- Domain errors are raised as `CROPSAATHI:<CODE>` where <CODE> is one of the
-- contract error codes (common.ts ERROR_CODES). The Edge Function strips the
-- prefix and maps the code to the right HTTP status + universal error envelope,
-- so no raw SQL/Supabase error text ever leaks (§4.8).
--
-- Ownership helpers are SECURITY DEFINER so RLS policies can call them without
-- recursing into the very tables they protect.
-- ============================================================================

-- Raise a domain error carrying a contract error code.
create or replace function public.app_error(p_code text)
returns void
language plpgsql
as $$
begin
  raise exception 'CROPSAATHI:%', p_code using errcode = 'P0001';
end;
$$;

-- The authenticated user id (from the request JWT). NULL when unauthenticated.
create or replace function public.current_uid()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

-- Role of the current user, or NULL if no profile.
create or replace function public.current_role()
returns public.role_enum
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

-- The farmers.id owned by the current user (NULL if none).
create or replace function public.my_farmer_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select f.id from public.farmers f where f.user_id = auth.uid();
$$;

-- The single centre the current operator is assigned to (NULL if none).
create or replace function public.my_operator_centre()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select oc.centre_id
  from public.operator_centres oc
  where oc.operator_user_id = auth.uid()
  order by oc.created_at
  limit 1;
$$;

-- Is the current user an operator assigned to this centre?
create or replace function public.is_operator_for_centre(p_centre uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.operator_centres oc
    where oc.operator_user_id = auth.uid()
      and oc.centre_id = p_centre
  );
$$;

-- Mask an E.164 number for display: keep first 3 + last 4, star the middle.
-- e.g. +919876543210 -> +91******3210  (matches the §2 example).
create or replace function public.mask_mobile(p text)
returns text
language sql
immutable
as $$
  select case
    when p is null or length(p) < 8 then coalesce(p, '')
    else left(p, 3) || repeat('*', greatest(length(p) - 7, 1)) || right(p, 4)
  end;
$$;

-- Reference generators (year-scoped, zero-padded, from dedicated sequences).
create or replace function public.next_booking_ref()
returns text
language sql
volatile
as $$
  select 'BK-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('public.booking_ref_seq')::text, 4, '0');
$$;

create or replace function public.next_receipt_ref()
returns text
language sql
volatile
as $$
  select 'PR-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('public.receipt_ref_seq')::text, 4, '0');
$$;

create or replace function public.next_payment_ref()
returns text
language sql
volatile
as $$
  select 'PAY-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('public.payment_ref_seq')::text, 4, '0');
$$;

-- Generic updated_at bumper.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- >>> 0005_triggers.sql <<<
-- ============================================================================
-- 0005_triggers.sql — signup profile creation, updated_at, event immutability
-- ============================================================================

-- Create a FARMER profile automatically when a phone-OTP user first appears in
-- auth.users. Role defaults to FARMER (no self-promotion, §4.1); operators are
-- provisioned manually (see seed.sql / SETUP.md). Runs as definer to bypass RLS.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mobile text;
begin
  if new.phone is null or length(new.phone) = 0 then
    return new; -- non-phone signups are out of scope for Phase 1
  end if;
  v_mobile := case when left(new.phone, 1) = '+' then new.phone else '+' || new.phone end;
  insert into public.profiles (id, mobile_e164, role, profile_complete)
  values (new.id, v_mobile, 'FARMER', false)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at maintenance on every table that carries it.
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger farmers_set_updated_at
  before update on public.farmers
  for each row execute function public.set_updated_at();
create trigger centres_set_updated_at
  before update on public.centres
  for each row execute function public.set_updated_at();
create trigger procurement_rates_set_updated_at
  before update on public.procurement_rates
  for each row execute function public.set_updated_at();
create trigger slots_set_updated_at
  before update on public.slots
  for each row execute function public.set_updated_at();
create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();
create trigger queue_entries_set_updated_at
  before update on public.queue_entries
  for each row execute function public.set_updated_at();
create trigger procurements_set_updated_at
  before update on public.procurements
  for each row execute function public.set_updated_at();
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- Belt-and-suspenders immutability: procurement_events rows are never rewritten.
-- (RLS in 0006 also denies UPDATE/DELETE to ordinary roles; this BEFORE UPDATE
-- guard does not interfere with ON DELETE CASCADE cleanup.)
create or replace function public.prevent_event_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'CROPSAATHI:%', 'INTERNAL_ERROR' using errcode = 'P0001';
end;
$$;

create trigger procurement_events_no_update
  before update on public.procurement_events
  for each row execute function public.prevent_event_update();


-- >>> 0006_rls.sql <<<
-- ============================================================================
-- 0006_rls.sql — Row Level Security (§4.8)
--
-- The real authorization boundary for any DIRECT table access. All app writes
-- go through the SECURITY DEFINER RPCs (0007–0011), which bypass RLS and do
-- their own role/ownership checks; these policies independently guarantee that
-- a farmer can only ever READ their own rows and an operator only their centre,
-- even if someone queried the tables directly with a user token.
--
-- Ownership predicates call SECURITY DEFINER helpers so a policy never recurses
-- into the table it protects.
-- ============================================================================

-- Extra ownership helpers (definer) used by the policies below.
create or replace function public.is_my_booking(p_booking uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.bookings b
    join public.farmers f on f.id = b.farmer_id
    where b.id = p_booking and f.user_id = auth.uid()
  );
$$;

create or replace function public.procurement_visible(p_proc uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.procurements pr
    where pr.id = p_proc
      and (public.is_my_booking(pr.booking_id) or public.is_operator_for_centre(pr.centre_id))
  );
$$;

-- Turn RLS on everywhere.
alter table public.profiles           enable row level security;
alter table public.farmers            enable row level security;
alter table public.centres            enable row level security;
alter table public.operator_centres   enable row level security;
alter table public.procurement_rates  enable row level security;
alter table public.slots              enable row level security;
alter table public.bookings           enable row level security;
alter table public.queue_entries      enable row level security;
alter table public.procurements       enable row level security;
alter table public.procurement_events enable row level security;
alter table public.payments           enable row level security;
alter table public.otp_requests       enable row level security;

-- profiles: read only your own.
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

-- farmers: read only your own.
create policy farmers_select_own on public.farmers
  for select using (user_id = auth.uid());

-- centres: any authenticated user may browse.
create policy centres_select_authenticated on public.centres
  for select using (auth.uid() is not null);

-- operator_centres: an operator sees only their own links.
create policy operator_centres_select_own on public.operator_centres
  for select using (operator_user_id = auth.uid());

-- procurement_rates: read-only to farmer/operator (§4.8). No write policy.
create policy procurement_rates_select_authenticated on public.procurement_rates
  for select using (auth.uid() is not null);

-- slots: any authenticated user may read (farmers browse, operators manage via RPC).
create policy slots_select_authenticated on public.slots
  for select using (auth.uid() is not null);

-- bookings: the owning farmer, or an operator at the booking's centre.
create policy bookings_select_owner_or_operator on public.bookings
  for select using (
    farmer_id = public.my_farmer_id()
    or public.is_operator_for_centre(centre_id)
  );

-- queue_entries: the owning farmer, or an operator at the centre.
create policy queue_select_owner_or_operator on public.queue_entries
  for select using (
    public.is_my_booking(booking_id)
    or public.is_operator_for_centre(centre_id)
  );

-- procurements: the owning farmer, or an operator at the centre.
create policy procurements_select_owner_or_operator on public.procurements
  for select using (
    public.is_my_booking(booking_id)
    or public.is_operator_for_centre(centre_id)
  );

-- procurement_events: visible with the parent procurement. Append-only — no
-- UPDATE/DELETE policy exists, so ordinary roles can never mutate the audit log.
create policy procurement_events_select_visible on public.procurement_events
  for select using (public.procurement_visible(procurement_id));

-- payments: visible with the parent procurement.
create policy payments_select_visible on public.payments
  for select using (public.procurement_visible(procurement_id));

-- otp_requests: no policy at all — only the service role (which bypasses RLS)
-- ever touches this table.


-- >>> 0007_rpc_profile.sql <<<
-- ============================================================================
-- 0007_rpc_profile.sql — me / farmer profile update / farmer dashboard
--
-- All api_* functions are SECURITY DEFINER: they read auth.uid() from the
-- request JWT, enforce role/ownership explicitly (so 403 vs 404 match the
-- contract), and return exact-shape JSON. Money/quantity are cast to text so
-- NUMERIC precision survives to the wire (e.g. "18.40").
-- ============================================================================

-- GET /api/v1/me
create or replace function public.api_get_me()
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_prof   public.profiles;
  v_farmer public.farmers;
  v_farmer_json json := null;
begin
  if v_uid is null then perform public.app_error('UNAUTHENTICATED'); end if;
  select * into v_prof from public.profiles where id = v_uid;
  if not found then perform public.app_error('UNAUTHENTICATED'); end if;

  select * into v_farmer from public.farmers where user_id = v_uid;
  if found then
    v_farmer_json := json_build_object(
      'id',                 v_farmer.id,
      'full_name',          v_farmer.full_name,
      'state_code',         v_farmer.state_code,
      'district',           v_farmer.district,
      'village',            v_farmer.village,
      'external_farmer_ref', v_farmer.external_farmer_ref,
      'preferred_language', v_farmer.preferred_language
    );
  end if;

  return json_build_object(
    'id',               v_prof.id,
    'role',             v_prof.role,
    'mobile_masked',    public.mask_mobile(v_prof.mobile_e164),
    'profile_complete', v_prof.profile_complete,
    'farmer',           v_farmer_json
  );
end;
$$;

-- PUT /api/v1/farmers/me  (body already Zod-validated by the API)
create or replace function public.api_update_farmer(p json)
returns json
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_role      public.role_enum;
  v_privacy   boolean := coalesce((p->>'privacy_acknowledged')::boolean, false);
  v_farmer_id uuid;
begin
  if v_uid is null then perform public.app_error('UNAUTHENTICATED'); end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then perform public.app_error('UNAUTHENTICATED'); end if;
  if v_role <> 'FARMER' then perform public.app_error('FARMER_ONLY'); end if;
  if not v_privacy then perform public.app_error('PRIVACY_ACK_REQUIRED'); end if;

  insert into public.farmers (
    user_id, full_name, state_code, district, village,
    external_farmer_ref, preferred_language, privacy_acknowledged_at
  ) values (
    v_uid,
    p->>'full_name',
    p->>'state_code',
    p->>'district',
    p->>'village',
    nullif(p->>'external_farmer_ref', ''),
    coalesce(nullif(p->>'preferred_language', ''), 'hi'),
    now()
  )
  on conflict (user_id) do update set
    full_name           = excluded.full_name,
    state_code          = excluded.state_code,
    district            = excluded.district,
    village             = excluded.village,
    external_farmer_ref = excluded.external_farmer_ref,
    preferred_language  = excluded.preferred_language,
    privacy_acknowledged_at = coalesce(public.farmers.privacy_acknowledged_at, excluded.privacy_acknowledged_at)
  returning id into v_farmer_id;

  update public.profiles set profile_complete = true where id = v_uid;

  return json_build_object('farmer_id', v_farmer_id, 'profile_complete', true);
end;
$$;

-- GET /api/v1/farmer/dashboard
create or replace function public.api_farmer_dashboard()
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_role    public.role_enum;
  v_farmer  uuid;
  b         public.bookings;
  s         public.slots;
  c         public.centres;
  pr        public.procurements;
  pay       public.payments;
  v_queue   json := null;
  v_proc    json := null;
  v_pay     json := null;
begin
  if v_uid is null then perform public.app_error('UNAUTHENTICATED'); end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then perform public.app_error('UNAUTHENTICATED'); end if;
  if v_role <> 'FARMER' then perform public.app_error('FARMER_ONLY'); end if;

  v_farmer := public.my_farmer_id();
  if v_farmer is null then
    return json_build_object('upcoming_booking', null, 'active_queue', null,
                             'procurement', null, 'payment', null);
  end if;

  -- Prefer the most recent still-active booking; else the most recent overall.
  select * into b
  from public.bookings
  where farmer_id = v_farmer and status <> 'CANCELLED'
  order by (status <> 'COMPLETED') desc, created_at desc
  limit 1;

  if not found then
    return json_build_object('upcoming_booking', null, 'active_queue', null,
                             'procurement', null, 'payment', null);
  end if;

  select * into s from public.slots  where id = b.slot_id;
  select * into c from public.centres where id = b.centre_id;

  -- Active queue only while not completed (matches mock).
  v_queue := public.queue_status_json(b.id);
  if v_queue is not null and (v_queue->>'state') = 'COMPLETED' then
    v_queue := null;
  end if;

  select * into pr from public.procurements where booking_id = b.id;
  if found then
    v_proc := json_build_object(
      'id',                pr.id,
      'booking_id',        pr.booking_id,
      'status',            pr.status,
      'quality_status',    pr.quality_status,
      'amount',            pr.amount::text,
      'receipt_reference', pr.receipt_reference
    );
    select * into pay from public.payments where procurement_id = pr.id;
    if found then
      v_pay := json_build_object(
        'procurement_id', pay.procurement_id,
        'amount',         pay.amount::text,
        'status',         pay.status,
        'reference',      pay.reference,
        'updated_at',     pay.updated_at
      );
    end if;
  end if;

  return json_build_object(
    'upcoming_booking', json_build_object(
      'id',                    b.id,
      'reference',             b.reference,
      'centre_name',           c.name,
      'commodity_code',        b.commodity_code,
      'expected_quantity_qtl', b.expected_quantity_qtl::text,
      'slot_date',             s.date::text,
      'slot_start',            to_char(s.start_time, 'HH24:MI'),
      'slot_end',              to_char(s.end_time, 'HH24:MI'),
      'status',                b.status
    ),
    'active_queue', v_queue,
    'procurement',  v_proc,
    'payment',      v_pay
  );
end;
$$;


-- >>> 0008_rpc_slots.sql <<<
-- ============================================================================
-- 0008_rpc_slots.sql — shared role guards + centres / slots / operator slots
--
-- Faithful to apps/web/src/lib/services/adapters/mock.ts (the reference impl):
-- getCentres, getSlots, getOperatorDashboard, getOperatorSlots, createSlot,
-- patchSlot. Times are TIME in the DB and serialized as "HH:MM".
-- ============================================================================

-- ------- shared role guards (used by 0008–0012) -------

-- Assert the caller is an authenticated FARMER; returns their user id.
create or replace function public.require_farmer_uid()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_role public.role_enum;
begin
  if v_uid is null then perform public.app_error('UNAUTHENTICATED'); end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then perform public.app_error('UNAUTHENTICATED'); end if;
  if v_role <> 'FARMER' then perform public.app_error('FARMER_ONLY'); end if;
  return v_uid;
end;
$$;

-- Assert the caller is an OPERATOR with a centre link; returns that centre id.
create or replace function public.require_operator_centre()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_role   public.role_enum;
  v_centre uuid;
begin
  if v_uid is null then perform public.app_error('UNAUTHENTICATED'); end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then perform public.app_error('UNAUTHENTICATED'); end if;
  if v_role <> 'OPERATOR' then perform public.app_error('OPERATOR_ONLY'); end if;
  v_centre := public.my_operator_centre();
  if v_centre is null then perform public.app_error('OPERATOR_CENTRE_FORBIDDEN'); end if;
  return v_centre;
end;
$$;

-- Build the OperatorSlot JSON shape for one slot row.
create or replace function public.operator_slot_json(s public.slots)
returns json
language sql
stable
as $$
  select json_build_object(
    'id',           s.id,
    'date',         s.date::text,
    'start',        to_char(s.start_time, 'HH24:MI'),
    'end',          to_char(s.end_time, 'HH24:MI'),
    'capacity',     s.capacity,
    'booked_count', s.booked_count,
    'active',       s.active
  );
$$;

-- ------- GET /api/v1/centres?commodity_code&date -------
create or replace function public.api_get_centres(p_commodity text, p_date date)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_centres json;
begin
  perform public.require_farmer_uid();

  -- No active rate for this commodity → no centres offer it (matches mock).
  if not exists (
    select 1 from public.procurement_rates
    where commodity_code = p_commodity and active
  ) then
    return json_build_object('centres', '[]'::json);
  end if;

  select coalesce(json_agg(item order by item->>'name'), '[]'::json)
  into v_centres
  from (
    select json_build_object(
      'id',         c.id,
      'name',       c.name,
      'state_code', c.state_code,
      'district',   c.district,
      'availability', case when exists (
          select 1 from public.slots s
          where s.centre_id = c.id and s.date = p_date
            and s.active and s.booked_count < s.capacity
        ) then 'AVAILABLE' else 'FULL' end
    ) as item
    from public.centres c
    where c.active
  ) rows;

  return json_build_object('centres', v_centres);
end;
$$;

-- ------- GET /api/v1/centres/{id}/slots?date -------
create or replace function public.api_get_slots(p_centre uuid, p_date date)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_slots json;
begin
  perform public.require_farmer_uid();
  if not exists (select 1 from public.centres where id = p_centre) then
    perform public.app_error('CENTRE_NOT_FOUND');
  end if;

  select coalesce(json_agg(
    json_build_object(
      'id',        s.id,
      'start',     to_char(s.start_time, 'HH24:MI'),
      'end',       to_char(s.end_time, 'HH24:MI'),
      'capacity',  s.capacity,
      'remaining', greatest(s.capacity - s.booked_count, 0)
    ) order by s.start_time
  ), '[]'::json)
  into v_slots
  from public.slots s
  where s.centre_id = p_centre and s.date = p_date and s.active;

  return json_build_object('slots', v_slots);
end;
$$;

-- ------- GET /api/v1/operator/dashboard -------
create or replace function public.api_operator_dashboard()
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_centre uuid := public.require_operator_centre();
  v_name   text;
  v_result json;
begin
  select name into v_name from public.centres where id = v_centre;

  with todays as (
    select b.id, b.status, q.state as qstate
    from public.bookings b
    join public.slots s on s.id = b.slot_id
    left join public.queue_entries q on q.booking_id = b.id
    where b.centre_id = v_centre
      and s.date = current_date
      and b.status <> 'CANCELLED'
  )
  select json_build_object(
    'centre', json_build_object('id', v_centre, 'name', v_name),
    'today', json_build_object(
      'bookings',   (select count(*) from todays),
      'checked_in', (select count(*) from todays where qstate is not null),
      'waiting',    (select count(*) from todays where qstate = 'WAITING'),
      'in_service', (select count(*) from todays where qstate = 'IN_SERVICE'),
      'completed',  (select count(*) from todays where status = 'COMPLETED')
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ------- GET /api/v1/operator/slots?date -------
create or replace function public.api_operator_slots(p_date date)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_centre uuid := public.require_operator_centre();
  v_slots  json;
begin
  select coalesce(json_agg(public.operator_slot_json(s) order by s.start_time), '[]'::json)
  into v_slots
  from public.slots s
  where s.centre_id = v_centre and s.date = p_date;

  return json_build_object('slots', v_slots);
end;
$$;

-- ------- POST /api/v1/operator/slots -------
create or replace function public.api_create_slot(
  p_date date, p_start text, p_end text, p_capacity integer
)
returns json
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_centre uuid := public.require_operator_centre();
  v_start  time := p_start::time;
  v_end    time := p_end::time;
  v_slot   public.slots;
begin
  if v_start >= v_end then perform public.app_error('INVALID_SLOT_RANGE'); end if;
  if p_capacity is null or p_capacity <= 0 then perform public.app_error('INVALID_CAPACITY'); end if;

  -- Serialize concurrent creates for the same centre+date so the overlap check
  -- below can't be raced by two simultaneous inserts.
  perform pg_advisory_xact_lock(hashtextextended(v_centre::text || '|' || p_date::text, 0));

  if exists (
    select 1 from public.slots s
    where s.centre_id = v_centre and s.date = p_date and s.active
      and v_start < s.end_time and s.start_time < v_end
  ) then
    perform public.app_error('SLOT_OVERLAP');
  end if;

  begin
    insert into public.slots (centre_id, date, start_time, end_time, capacity, booked_count, active)
    values (v_centre, p_date, v_start, v_end, p_capacity, 0, true)
    returning * into v_slot;
  exception when unique_violation then
    -- An identical (inactive) window already exists; treat as an overlap.
    perform public.app_error('SLOT_OVERLAP');
  end;

  return public.operator_slot_json(v_slot);
end;
$$;

-- ------- PATCH /api/v1/operator/slots/{id} -------
create or replace function public.api_patch_slot(
  p_slot uuid, p_capacity integer, p_active boolean
)
returns json
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_centre uuid := public.require_operator_centre();
  v_slot   public.slots;
begin
  select * into v_slot from public.slots where id = p_slot for update;
  if not found then perform public.app_error('SLOT_NOT_FOUND'); end if;
  if v_slot.centre_id <> v_centre then perform public.app_error('OPERATOR_CENTRE_FORBIDDEN'); end if;

  if p_capacity is not null then
    if p_capacity <= 0 then perform public.app_error('INVALID_CAPACITY'); end if;
    if p_capacity < v_slot.booked_count then perform public.app_error('CAPACITY_BELOW_BOOKED_COUNT'); end if;
    update public.slots set capacity = p_capacity where id = p_slot;
  end if;

  if p_active is not null then
    update public.slots set active = p_active where id = p_slot;
  end if;

  select * into v_slot from public.slots where id = p_slot;
  return public.operator_slot_json(v_slot);
end;
$$;


-- >>> 0009_rpc_booking.sql <<<
-- ============================================================================
-- 0009_rpc_booking.sql — booking create/read + queue status read
--
-- api_create_booking is the atomic book_slot (§4.3): it locks the slot row
-- FOR UPDATE so exactly one farmer can win the last seat under concurrency,
-- re-checks active/capacity + the duplicate-active-booking guard, then inserts
-- the booking and bumps booked_count in the same transaction.
-- ============================================================================

-- Booking entity JSON (identical for POST /bookings and GET /bookings/{id}).
create or replace function public.booking_json(b public.bookings)
returns json
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select json_build_object(
    'id',                    b.id,
    'reference',             b.reference,
    'status',                b.status,
    'centre_id',             b.centre_id,
    'centre_name',           (select name from public.centres where id = b.centre_id),
    'slot_date',             (select s.date::text from public.slots s where s.id = b.slot_id),
    'slot_start',            (select to_char(s.start_time, 'HH24:MI') from public.slots s where s.id = b.slot_id),
    'slot_end',              (select to_char(s.end_time, 'HH24:MI') from public.slots s where s.id = b.slot_id),
    'commodity_code',        b.commodity_code,
    'expected_quantity_qtl', b.expected_quantity_qtl::text
  );
$$;

-- POST /api/v1/bookings
create or replace function public.api_create_booking(
  p_slot uuid, p_commodity text, p_qty numeric
)
returns json
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_role     public.role_enum;
  v_complete boolean;
  v_farmer   uuid;
  s          public.slots;
  v_ref      text;
  b          public.bookings;
begin
  if v_uid is null then perform public.app_error('UNAUTHENTICATED'); end if;
  select role, profile_complete into v_role, v_complete from public.profiles where id = v_uid;
  if v_role is null then perform public.app_error('UNAUTHENTICATED'); end if;
  if v_role <> 'FARMER' then perform public.app_error('FARMER_ONLY'); end if;
  if not v_complete then perform public.app_error('VALIDATION_ERROR'); end if;  -- complete profile first
  v_farmer := public.my_farmer_id();
  if v_farmer is null then perform public.app_error('VALIDATION_ERROR'); end if;
  if p_qty is null or p_qty <= 0 then perform public.app_error('INVALID_QUANTITY'); end if;

  -- Lock the slot: one winner for the last seat (§4.3).
  select * into s from public.slots where id = p_slot for update;
  if not found then perform public.app_error('SLOT_NOT_FOUND'); end if;
  if not s.active then perform public.app_error('SLOT_FULL'); end if;
  if s.booked_count >= s.capacity then perform public.app_error('SLOT_FULL'); end if;

  -- One active booking per farmer at a time.
  if exists (
    select 1 from public.bookings
    where farmer_id = v_farmer
      and status in ('BOOKED', 'CHECKED_IN', 'IN_QUEUE', 'IN_SERVICE')
  ) then
    perform public.app_error('DUPLICATE_ACTIVE_BOOKING');
  end if;

  v_ref := public.next_booking_ref();
  insert into public.bookings (reference, farmer_id, centre_id, slot_id, commodity_code, expected_quantity_qtl, status)
  values (v_ref, v_farmer, s.centre_id, s.id, p_commodity, p_qty, 'BOOKED')
  returning * into b;

  update public.slots set booked_count = booked_count + 1 where id = s.id;

  return public.booking_json(b);
end;
$$;

-- GET /api/v1/bookings/{id}
create or replace function public.api_get_booking(p_booking uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_role public.role_enum;
  b      public.bookings;
begin
  if v_uid is null then perform public.app_error('UNAUTHENTICATED'); end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then perform public.app_error('UNAUTHENTICATED'); end if;

  select * into b from public.bookings where id = p_booking;
  if not found then perform public.app_error('BOOKING_NOT_FOUND'); end if;
  if v_role = 'FARMER' and b.farmer_id <> public.my_farmer_id() then
    perform public.app_error('BOOKING_FORBIDDEN');
  end if;

  return public.booking_json(b);
end;
$$;

-- Queue status JSON for a booking (null if there is no queue entry).
-- position/farmers_ahead/ETA are computed within the entry's (centre, date)
-- line, ordered by the deterministic seq. Completed entries report zeros.
create or replace function public.queue_status_json(p_booking uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  q       public.queue_entries;
  v_ahead integer;
  v_avg   integer;
begin
  select * into q from public.queue_entries where booking_id = p_booking;
  if not found then return null; end if;

  if q.state = 'COMPLETED' then
    return json_build_object(
      'booking_id', p_booking, 'state', q.state,
      'position', 0, 'farmers_ahead', 0, 'estimated_wait_min', 0,
      'updated_at', q.updated_at
    );
  end if;

  select count(*) into v_ahead
  from public.queue_entries e
  where e.centre_id = q.centre_id and e.date = q.date
    and e.state <> 'COMPLETED' and e.seq < q.seq;

  select avg_service_minutes into v_avg from public.centres where id = q.centre_id;

  return json_build_object(
    'booking_id',         p_booking,
    'state',              q.state,
    'position',           v_ahead + 1,
    'farmers_ahead',      v_ahead,
    'estimated_wait_min', v_ahead * coalesce(v_avg, 0),
    'updated_at',         q.updated_at
  );
end;
$$;

-- GET /api/v1/bookings/{id}/queue
create or replace function public.api_get_queue(p_booking uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  b public.bookings;
  v json;
begin
  perform public.require_farmer_uid();
  select * into b from public.bookings where id = p_booking;
  if not found then perform public.app_error('BOOKING_NOT_FOUND'); end if;
  if b.farmer_id <> public.my_farmer_id() then perform public.app_error('QUEUE_FORBIDDEN'); end if;

  v := public.queue_status_json(p_booking);
  if v is null then perform public.app_error('QUEUE_NOT_FOUND'); end if;
  return v;
end;
$$;


-- >>> 0010_rpc_queue.sql <<<
-- ============================================================================
-- 0010_rpc_queue.sql — operator queue actions (§4.4/4.5)
--   check_in → call_next → start_service → complete_service
--
-- The queue is a per-centre, per-day physical line: queue_entries.date is the
-- CHECK-IN date (current_date) and `seq` is a gap-free per-(centre,date) counter
-- assigned under an advisory lock, so call_next always takes the genuine oldest
-- waiting farmer (no arbitrary priority, §4.4). Booking rows are locked FOR
-- UPDATE so concurrent operator actions can't double-process one booking.
-- ============================================================================

-- POST /api/v1/operator/bookings/{id}/check-in
create or replace function public.api_check_in(p_booking uuid)
returns json
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_centre uuid := public.require_operator_centre();
  b        public.bookings;
  v_date   date := current_date;
  v_seq    bigint;
  v_entry  uuid;
  v_pos    integer;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then perform public.app_error('BOOKING_NOT_FOUND'); end if;
  if b.centre_id <> v_centre then perform public.app_error('OPERATOR_CENTRE_FORBIDDEN'); end if;
  if b.status <> 'BOOKED' then perform public.app_error('INVALID_BOOKING_STATE'); end if;

  -- Assign the next line number for this centre + day, serialized.
  perform pg_advisory_xact_lock(hashtextextended(v_centre::text || '|' || v_date::text, 0));
  select coalesce(max(seq), 0) + 1 into v_seq
  from public.queue_entries where centre_id = v_centre and date = v_date;

  insert into public.queue_entries (booking_id, centre_id, date, seq, state)
  values (p_booking, v_centre, v_date, v_seq, 'WAITING')
  returning id into v_entry;

  update public.bookings set status = 'IN_QUEUE' where id = p_booking;

  v_pos := (public.queue_status_json(p_booking) ->> 'position')::int;

  return json_build_object(
    'queue_entry_id', v_entry,
    'booking_id',     p_booking,
    'state',          'WAITING',
    'position',       v_pos
  );
end;
$$;

-- POST /api/v1/operator/queue/{centreId}/call-next
create or replace function public.api_call_next(p_centre uuid)
returns json
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_centre uuid := public.require_operator_centre();
  q        public.queue_entries;
begin
  if p_centre <> v_centre then perform public.app_error('OPERATOR_CENTRE_FORBIDDEN'); end if;

  -- Oldest waiting farmer in today's line; SKIP LOCKED so parallel operators
  -- never grab the same one.
  select * into q
  from public.queue_entries
  where centre_id = v_centre and date = current_date and state = 'WAITING'
  order by seq
  limit 1
  for update skip locked;

  if not found then perform public.app_error('NO_WAITING_FARMERS'); end if;

  update public.queue_entries set state = 'CALLED' where id = q.id;

  return json_build_object(
    'booking_id',     q.booking_id,
    'queue_entry_id', q.id,
    'state',          'CALLED'
  );
end;
$$;

-- POST /api/v1/operator/bookings/{id}/start-service
create or replace function public.api_start_service(p_booking uuid)
returns json
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_centre uuid := public.require_operator_centre();
  b        public.bookings;
  q        public.queue_entries;
  v_proc   uuid;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then perform public.app_error('BOOKING_NOT_FOUND'); end if;
  if b.centre_id <> v_centre then perform public.app_error('OPERATOR_CENTRE_FORBIDDEN'); end if;

  select * into q from public.queue_entries where booking_id = p_booking for update;
  if not found then perform public.app_error('QUEUE_NOT_FOUND'); end if;
  if q.state <> 'CALLED' then perform public.app_error('INVALID_QUEUE_STATE'); end if;

  update public.queue_entries set state = 'IN_SERVICE' where id = q.id;
  update public.bookings set status = 'IN_SERVICE' where id = p_booking;

  -- Create procurement + payment shells on first service (see plan decision).
  select id into v_proc from public.procurements where booking_id = p_booking;
  if v_proc is null then
    insert into public.procurements (booking_id, centre_id, commodity_code, status)
    values (p_booking, v_centre, b.commodity_code, 'NOT_STARTED')
    returning id into v_proc;
    insert into public.payments (procurement_id, status) values (v_proc, 'NOT_STARTED');
  end if;

  return json_build_object('booking_id', p_booking, 'state', 'IN_SERVICE');
end;
$$;

-- POST /api/v1/operator/bookings/{id}/complete-service
create or replace function public.api_complete_service(p_booking uuid)
returns json
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_centre uuid := public.require_operator_centre();
  b        public.bookings;
  q        public.queue_entries;
  v_status public.procurement_status;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then perform public.app_error('BOOKING_NOT_FOUND'); end if;
  if b.centre_id <> v_centre then perform public.app_error('OPERATOR_CENTRE_FORBIDDEN'); end if;

  select * into q from public.queue_entries where booking_id = p_booking for update;
  if not found then perform public.app_error('QUEUE_NOT_FOUND'); end if;
  if q.state <> 'IN_SERVICE' then perform public.app_error('INVALID_QUEUE_STATE'); end if;

  select status into v_status from public.procurements where booking_id = p_booking;
  if v_status is null or v_status not in ('RECEIPT_GENERATED', 'QUALITY_REJECTED') then
    perform public.app_error('PROCUREMENT_NOT_COMPLETE');
  end if;

  update public.queue_entries set state = 'COMPLETED' where id = q.id;
  update public.bookings set status = 'COMPLETED' where id = p_booking;

  return json_build_object('booking_id', p_booking, 'state', 'COMPLETED');
end;
$$;


-- >>> 0011_rpc_procurement.sql <<<
-- ============================================================================
-- 0011_rpc_procurement.sql — procurement read + append-event state machine (§4.6)
--
-- Mirrors mock.appendProcurementEvent exactly, including guards, the
-- QUALITY→WEIGHMENT→ACCEPTED→RECEIPT progression, the reason requirement on
-- rejection, and the NUMERIC amount. amount = round(quantity_qtl * rate_per_qtl, 2);
-- because both operands are numeric(_,2), Postgres half-away rounding equals the
-- mock's half-up BigInt result to the paisa. Every transition appends an
-- immutable audit event stamped with the acting operator.
--
-- Note on 403 code: cross-centre access returns PROCUREMENT_FORBIDDEN (both codes
-- are valid contract 403s; this keeps the live API byte-identical to the mock the
-- frontend was verified against).
-- ============================================================================

-- Full Procurement entity JSON (with event history).
create or replace function public.procurement_json(p_proc uuid)
returns json
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select json_build_object(
    'id',                pr.id,
    'booking_id',        pr.booking_id,
    'status',            pr.status,
    'quality_status',    pr.quality_status,
    'commodity_code',    pr.commodity_code,
    'quantity_qtl',      pr.quantity_qtl::text,
    'rate_per_qtl',      pr.rate_per_qtl::text,
    'amount',            pr.amount::text,
    'receipt_reference', pr.receipt_reference,
    'events', coalesce((
      select json_agg(json_build_object('type', e.type, 'created_at', e.created_at) order by e.created_at, e.id)
      from public.procurement_events e
      where e.procurement_id = pr.id
    ), '[]'::json)
  )
  from public.procurements pr
  where pr.id = p_proc;
$$;

-- GET /api/v1/procurements/{id}
create or replace function public.api_get_procurement(p_proc uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_role   public.role_enum;
  pr       public.procurements;
begin
  if v_uid is null then perform public.app_error('UNAUTHENTICATED'); end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then perform public.app_error('UNAUTHENTICATED'); end if;

  select * into pr from public.procurements where id = p_proc;
  if not found then perform public.app_error('PROCUREMENT_NOT_FOUND'); end if;

  if v_role = 'FARMER' then
    if not public.is_my_booking(pr.booking_id) then
      perform public.app_error('PROCUREMENT_FORBIDDEN');
    end if;
  else
    if not public.is_operator_for_centre(pr.centre_id) then
      perform public.app_error('PROCUREMENT_FORBIDDEN');
    end if;
  end if;

  return public.procurement_json(p_proc);
end;
$$;

-- POST /api/v1/operator/procurements/{id}/events
create or replace function public.api_append_procurement_event(
  p_proc uuid, p_type text, p_qty numeric, p_reason text
)
returns json
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_centre uuid := public.require_operator_centre();
  pr       public.procurements;
  v_rate   numeric(12, 2);
  v_amount numeric(14, 2);
begin
  select * into pr from public.procurements where id = p_proc for update;
  if not found then perform public.app_error('PROCUREMENT_NOT_FOUND'); end if;
  if pr.centre_id <> v_centre then perform public.app_error('PROCUREMENT_FORBIDDEN'); end if;

  if p_type = 'QUALITY_STARTED' then
    if pr.status <> 'NOT_STARTED' then perform public.app_error('INVALID_PROCUREMENT_TRANSITION'); end if;
    update public.procurements
       set status = 'QUALITY_IN_PROGRESS', quality_status = 'PENDING'
     where id = p_proc;

  elsif p_type = 'QUALITY_ACCEPTED' then
    if pr.status <> 'QUALITY_IN_PROGRESS' then perform public.app_error('INVALID_PROCUREMENT_TRANSITION'); end if;
    update public.procurements
       set status = 'QUALITY_ACCEPTED', quality_status = 'ACCEPTED'
     where id = p_proc;

  elsif p_type = 'QUALITY_REJECTED' then
    if pr.status <> 'QUALITY_IN_PROGRESS' then perform public.app_error('INVALID_PROCUREMENT_TRANSITION'); end if;
    if p_reason is null or length(btrim(p_reason)) = 0 then
      perform public.app_error('REJECTION_REASON_REQUIRED');
    end if;
    update public.procurements
       set status = 'QUALITY_REJECTED', quality_status = 'REJECTED', reject_reason = p_reason
     where id = p_proc;

  elsif p_type = 'WEIGHMENT_RECORDED' then
    if pr.status <> 'QUALITY_ACCEPTED' then perform public.app_error('INVALID_PROCUREMENT_TRANSITION'); end if;
    if p_qty is null or p_qty <= 0 then perform public.app_error('INVALID_QUANTITY'); end if;
    update public.procurements
       set status = 'WEIGHMENT_RECORDED', quantity_qtl = p_qty
     where id = p_proc;

  elsif p_type = 'PROCUREMENT_ACCEPTED' then
    if pr.status <> 'WEIGHMENT_RECORDED' then perform public.app_error('INVALID_PROCUREMENT_TRANSITION'); end if;
    -- Read the authoritative active rate for this commodity (prefer the centre's state).
    select rate_per_qtl into v_rate
    from public.procurement_rates
    where commodity_code = pr.commodity_code and active
    order by (state_code = (select state_code from public.centres where id = pr.centre_id)) desc, created_at desc
    limit 1;
    if v_rate is null then perform public.app_error('INTERNAL_ERROR'); end if;
    v_amount := round(pr.quantity_qtl * v_rate, 2);
    update public.procurements
       set status = 'PROCUREMENT_ACCEPTED', rate_per_qtl = v_rate, amount = v_amount
     where id = p_proc;
    update public.payments set amount = v_amount where procurement_id = p_proc;

  elsif p_type = 'RECEIPT_GENERATED' then
    if pr.status <> 'PROCUREMENT_ACCEPTED' then perform public.app_error('INVALID_PROCUREMENT_TRANSITION'); end if;
    update public.procurements
       set status = 'RECEIPT_GENERATED', receipt_reference = public.next_receipt_ref()
     where id = p_proc;

  else
    perform public.app_error('INVALID_PROCUREMENT_TRANSITION');
  end if;

  -- Append the immutable audit event.
  insert into public.procurement_events (procurement_id, type, actor_user_id, reason_code, metadata)
  values (
    p_proc,
    p_type::public.procurement_event_type,
    auth.uid(),
    p_reason,
    case when p_qty is not null then jsonb_build_object('quantity_qtl', p_qty::text) else '{}'::jsonb end
  );

  -- Fresh values for the response.
  select * into pr from public.procurements where id = p_proc;
  return json_build_object(
    'procurement_id',    pr.id,
    'status',            pr.status,
    'quality_status',    pr.quality_status,
    'quantity_qtl',      pr.quantity_qtl::text,
    'rate_per_qtl',      pr.rate_per_qtl::text,
    'amount',            pr.amount::text,
    'receipt_reference', pr.receipt_reference
  );
end;
$$;


-- >>> 0012_rpc_payment.sql <<<
-- ============================================================================
-- 0012_rpc_payment.sql — payment read + operator status state machine (§4.7)
--
-- CropSaathi records payment workflow status only; it never moves money (§4.7).
-- Allowed transitions:
--   NOT_STARTED -> INITIATED (only after procurement is ACCEPTED or RECEIPT generated)
--   INITIATED   -> PROCESSING, FAILED
--   PROCESSING  -> CREDITED, FAILED
--   CREDITED / FAILED are terminal states.
--
-- Farmer reads are scoped to their own bookings.
-- Operator reads & mutations are strictly scoped to their assigned centre.
-- ============================================================================

-- Build the Payment JSON entity matching the contract shape (§2.H).
create or replace function public.payment_json(p_proc uuid)
returns json
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select json_build_object(
    'procurement_id', pay.procurement_id,
    'amount',         pay.amount::text,
    'status',         pay.status,
    'reference',      pay.reference,
    'updated_at',     pay.updated_at
  )
  from public.payments pay
  where pay.procurement_id = p_proc;
$$;

-- GET /api/v1/payments/{procurement_id}
create or replace function public.api_get_payment(p_proc uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_role public.role_enum;
  pr     public.procurements;
  pay    public.payments;
begin
  if v_uid is null then perform public.app_error('UNAUTHENTICATED'); end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then perform public.app_error('UNAUTHENTICATED'); end if;

  select * into pr from public.procurements where id = p_proc;
  if not found then perform public.app_error('PROCUREMENT_NOT_FOUND'); end if;

  if v_role = 'FARMER' then
    if not public.is_my_booking(pr.booking_id) then
      perform public.app_error('PAYMENT_FORBIDDEN');
    end if;
  else
    if not public.is_operator_for_centre(pr.centre_id) then
      perform public.app_error('PAYMENT_FORBIDDEN');
    end if;
  end if;

  select * into pay from public.payments where procurement_id = p_proc;
  if not found then perform public.app_error('PAYMENT_NOT_FOUND'); end if;

  return public.payment_json(p_proc);
end;
$$;

-- POST /api/v1/operator/payments/{procurement_id}/status
create or replace function public.api_set_payment_status(
  p_proc   uuid,
  p_status text,
  p_ref    text default null
)
returns json
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_centre uuid := public.require_operator_centre();
  pr       public.procurements;
  pay      public.payments;
  v_target public.payment_status;
  v_ref    text;
begin
  -- Validate target status string against enum
  begin
    v_target := p_status::public.payment_status;
  exception when invalid_text_representation then
    perform public.app_error('INVALID_PAYMENT_TRANSITION');
  end;

  select * into pr from public.procurements where id = p_proc for update;
  if not found then perform public.app_error('PROCUREMENT_NOT_FOUND'); end if;
  if pr.centre_id <> v_centre then perform public.app_error('OPERATOR_CENTRE_FORBIDDEN'); end if;

  select * into pay from public.payments where procurement_id = p_proc for update;
  if not found then perform public.app_error('PAYMENT_NOT_FOUND'); end if;

  -- Guard: NOT_STARTED -> INITIATED requires procurement accepted or receipt generated
  if pay.status = 'NOT_STARTED' and v_target = 'INITIATED' then
    if pr.status not in ('PROCUREMENT_ACCEPTED', 'RECEIPT_GENERATED') then
      perform public.app_error('PROCUREMENT_NOT_COMPLETE');
    end if;
  end if;

  -- Validate state machine transitions
  if pay.status = 'NOT_STARTED' then
    if v_target <> 'INITIATED' then
      perform public.app_error('INVALID_PAYMENT_TRANSITION');
    end if;
  elsif pay.status = 'INITIATED' then
    if v_target not in ('PROCESSING', 'FAILED') then
      perform public.app_error('INVALID_PAYMENT_TRANSITION');
    end if;
  elsif pay.status = 'PROCESSING' then
    if v_target not in ('CREDITED', 'FAILED') then
      perform public.app_error('INVALID_PAYMENT_TRANSITION');
    end if;
  else
    -- CREDITED or FAILED are terminal
    perform public.app_error('INVALID_PAYMENT_TRANSITION');
  end if;

  -- Reference: use supplied ref if provided, otherwise preserve existing or generate
  v_ref := coalesce(nullif(btrim(p_ref), ''), pay.reference, public.next_payment_ref());

  update public.payments
     set status     = v_target,
         reference  = v_ref,
         updated_at = now()
   where procurement_id = p_proc;

  return public.payment_json(p_proc);
end;
$$;


-- >>> seed.sql <<<
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

