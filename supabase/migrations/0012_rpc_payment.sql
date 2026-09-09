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
