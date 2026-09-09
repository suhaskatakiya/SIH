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
