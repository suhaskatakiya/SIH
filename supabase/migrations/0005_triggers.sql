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
