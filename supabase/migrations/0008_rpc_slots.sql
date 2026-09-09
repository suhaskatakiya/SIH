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
  if auth.uid() is null then perform public.app_error('UNAUTHENTICATED'); end if;

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
  if auth.uid() is null then perform public.app_error('UNAUTHENTICATED'); end if;
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
