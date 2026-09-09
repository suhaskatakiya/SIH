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

  -- Prevent duplicate booking for the exact same slot by the same farmer.
  if exists (
    select 1 from public.bookings
    where farmer_id = v_farmer
      and slot_id = s.id
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
