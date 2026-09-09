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
