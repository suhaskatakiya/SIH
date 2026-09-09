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
  v_uid          uuid := auth.uid();
  v_role         public.role_enum;
  v_farmer       uuid;
  b              public.bookings;
  s              public.slots;
  c              public.centres;
  pr             public.procurements;
  pay            public.payments;
  v_queue        json := null;
  v_proc         json := null;
  v_pay          json := null;
  v_all_bookings json := '[]'::json;
begin
  if v_uid is null then perform public.app_error('UNAUTHENTICATED'); end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then perform public.app_error('UNAUTHENTICATED'); end if;
  if v_role <> 'FARMER' then perform public.app_error('FARMER_ONLY'); end if;

  v_farmer := public.my_farmer_id();
  if v_farmer is null then
    return json_build_object('upcoming_booking', null, 'upcoming_bookings', '[]'::json,
                             'active_queue', null, 'procurement', null, 'payment', null);
  end if;

  -- Query all non-cancelled bookings for this farmer, ordered by slot date & time
  select coalesce(json_agg(
    json_build_object(
      'id',                    bk.id,
      'reference',             bk.reference,
      'centre_name',           ct.name,
      'commodity_code',        bk.commodity_code,
      'expected_quantity_qtl', bk.expected_quantity_qtl::text,
      'slot_date',             sl.date::text,
      'slot_start',            to_char(sl.start_time, 'HH24:MI'),
      'slot_end',              to_char(sl.end_time, 'HH24:MI'),
      'status',                bk.status
    ) order by sl.date asc, sl.start_time asc, bk.created_at asc
  ), '[]'::json) into v_all_bookings
  from public.bookings bk
  join public.slots sl on sl.id = bk.slot_id
  join public.centres ct on ct.id = bk.centre_id
  where bk.farmer_id = v_farmer and bk.status <> 'CANCELLED';

  -- Prefer the most recent still-active booking; else the most recent overall.
  select * into b
  from public.bookings
  where farmer_id = v_farmer and status <> 'CANCELLED'
  order by (status <> 'COMPLETED') desc, created_at desc
  limit 1;

  if not found then
    return json_build_object('upcoming_booking', null, 'upcoming_bookings', '[]'::json,
                             'active_queue', null, 'procurement', null, 'payment', null);
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
    'upcoming_bookings', v_all_bookings,
    'active_queue', v_queue,
    'procurement',  v_proc,
    'payment',      v_pay
  );
end;
$$;
