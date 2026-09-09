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
