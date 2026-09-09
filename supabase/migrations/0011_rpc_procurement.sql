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
