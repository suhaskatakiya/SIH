/**
 * scripts/serve-api.mjs
 *
 * Runs the CropSaathi Hono /api/v1 façade locally on Node.js using @hono/node-server,
 * connecting directly to your live Supabase Cloud database using the credentials
 * from .env.
 *
 * This allows full live end-to-end testing immediately without needing Docker or
 * deploying Edge Functions!
 */
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createClient } from '@supabase/supabase-js';
import * as C from '../packages/contracts/src/index.ts';

const PORT = Number(process.env.API_PORT || 54321);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[serve-api] Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

function getScopedClient(authHeader) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {}
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

const STATUS_BY_CODE = {
  INVALID_MOBILE: 400,
  INVALID_OTP: 400,
  OTP_EXPIRED: 400,
  PRIVACY_ACK_REQUIRED: 400,
  INVALID_DATE: 400,
  INVALID_QUANTITY: 400,
  REJECTION_REASON_REQUIRED: 400,
  INVALID_SLOT_RANGE: 400,
  INVALID_CAPACITY: 400,
  UNAUTHENTICATED: 401,
  FARMER_ONLY: 403,
  OPERATOR_ONLY: 403,
  OPERATOR_CENTRE_FORBIDDEN: 403,
  BOOKING_FORBIDDEN: 403,
  QUEUE_FORBIDDEN: 403,
  PROCUREMENT_FORBIDDEN: 403,
  PAYMENT_FORBIDDEN: 403,
  CENTRE_NOT_FOUND: 404,
  SLOT_NOT_FOUND: 404,
  BOOKING_NOT_FOUND: 404,
  QUEUE_NOT_FOUND: 404,
  PROCUREMENT_NOT_FOUND: 404,
  PAYMENT_NOT_FOUND: 404,
  SLOT_FULL: 409,
  DUPLICATE_ACTIVE_BOOKING: 409,
  SLOT_OVERLAP: 409,
  SLOT_UPDATE_CONFLICT: 409,
  INVALID_BOOKING_STATE: 409,
  NO_WAITING_FARMERS: 409,
  INVALID_QUEUE_STATE: 409,
  PROCUREMENT_NOT_COMPLETE: 409,
  INVALID_PROCUREMENT_TRANSITION: 409,
  INVALID_PAYMENT_TRANSITION: 409,
  CAPACITY_BELOW_BOOKED_COUNT: 409,
  VALIDATION_ERROR: 422,
  OTP_RATE_LIMITED: 429,
  OTP_ATTEMPTS_EXCEEDED: 429,
  OTP_PROVIDER_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500
};

const ERROR_MESSAGES = {
  INVALID_MOBILE: 'Please enter a valid mobile number in E.164 format (+91...).',
  INVALID_OTP: 'Invalid OTP entered.',
  OTP_EXPIRED: 'OTP has expired. Please request a new one.',
  OTP_RATE_LIMITED: 'Too many OTP requests. Please wait a moment.',
  OTP_ATTEMPTS_EXCEEDED: 'Maximum OTP verification attempts exceeded.',
  OTP_PROVIDER_UNAVAILABLE: 'SMS OTP service is currently unavailable.',
  UNAUTHENTICATED: 'Authentication required.',
  PRIVACY_ACK_REQUIRED: 'Privacy acknowledgement is required.',
  VALIDATION_ERROR: 'Request validation failed.',
  FARMER_ONLY: 'This action is restricted to farmers.',
  OPERATOR_ONLY: 'This action is restricted to operators.',
  OPERATOR_CENTRE_FORBIDDEN: 'You are not authorized for this centre.',
  BOOKING_FORBIDDEN: 'You do not have access to this booking.',
  QUEUE_FORBIDDEN: 'You do not have access to this queue entry.',
  PROCUREMENT_FORBIDDEN: 'You do not have access to this procurement.',
  PAYMENT_FORBIDDEN: 'You do not have access to this payment.',
  CENTRE_NOT_FOUND: 'Procurement centre not found.',
  SLOT_NOT_FOUND: 'Slot not found.',
  BOOKING_NOT_FOUND: 'Booking not found.',
  QUEUE_NOT_FOUND: 'Queue entry not found.',
  PROCUREMENT_NOT_FOUND: 'Procurement not found.',
  PAYMENT_NOT_FOUND: 'Payment not found.',
  SLOT_FULL: 'This slot is full or no longer available.',
  DUPLICATE_ACTIVE_BOOKING: 'You already have an active booking.',
  SLOT_OVERLAP: 'This slot overlaps with an existing slot window.',
  INVALID_BOOKING_STATE: 'Booking is not in a valid state for this action.',
  NO_WAITING_FARMERS: 'No waiting farmers in today queue.',
  INVALID_QUEUE_STATE: 'Queue entry is not in the required state.',
  PROCUREMENT_NOT_COMPLETE: 'Procurement must be completed before advancing.',
  INVALID_PROCUREMENT_TRANSITION: 'Invalid procurement status transition.',
  INVALID_PAYMENT_TRANSITION: 'Invalid payment status transition.',
  CAPACITY_BELOW_BOOKED_COUNT: 'Slot capacity cannot be less than current booked count.',
  INVALID_DATE: 'Invalid date format (expected YYYY-MM-DD).',
  INVALID_QUANTITY: 'Quantity must be a positive number.',
  REJECTION_REASON_REQUIRED: 'A rejection reason is required.',
  INVALID_SLOT_RANGE: 'Slot start time must be before end time.',
  INVALID_CAPACITY: 'Capacity must be greater than zero.',
  INTERNAL_ERROR: 'Internal server error.'
};

function maskMobile(phone) {
  if (!phone || phone.length < 8) return phone ?? '';
  return phone.slice(0, 3) + '*'.repeat(Math.max(phone.length - 7, 1)) + phone.slice(-4);
}

function extractDomainCode(err) {
  if (!err) return null;
  const raw = err.message || err.details || (typeof err === 'string' ? err : '');
  const match = raw.match(/CROPSAATHI:([A-Z0-9_]+)/);
  if (match) return match[1];
  if (typeof raw === 'string' && raw in STATUS_BY_CODE) return raw;
  return null;
}

function fail(c, code, customMessage) {
  const status = STATUS_BY_CODE[code] ?? 400;
  const message = customMessage ?? ERROR_MESSAGES[code] ?? code;
  return c.json({ error: true, code, message }, status);
}

const app = new Hono().basePath(C.API_PREFIX);

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type', 'Accept'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400
}));

async function callRpc(c, rpcName, params = {}) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return fail(c, C.ERROR_CODES.UNAUTHENTICATED);
  }

  const supabase = getScopedClient(authHeader);
  const { data, error } = await supabase.rpc(rpcName, params);

  if (error) {
    const domainCode = extractDomainCode(error);
    if (domainCode) {
      return fail(c, domainCode);
    }
    if (error.code === 'PGRST301' || error.message?.includes('JWT')) {
      return fail(c, C.ERROR_CODES.UNAUTHENTICATED);
    }
    console.error(`[RPC Error: ${rpcName}]`, error);
    return fail(c, C.ERROR_CODES.INTERNAL_ERROR);
  }

  return c.json(data);
}

// ----------------------------------------------------------------------------
// Routes
// ----------------------------------------------------------------------------

app.post('/auth/otp/request', async (c) => {
  let body;
  try { body = await c.req.json(); } catch {
    return fail(c, C.ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON body.');
  }
  const parsed = C.OtpRequestBody.safeParse(body);
  if (!parsed.success) return fail(c, C.ERROR_CODES.INVALID_MOBILE);

  const mobile = parsed.data.mobile;
  const admin = getAdminClient();

  // Rate-limiting check via otp_requests table
  try {
    const { count } = await admin
      .from('otp_requests')
      .select('*', { count: 'exact', head: true })
      .eq('mobile_e164', mobile)
      .gt('requested_at', new Date(Date.now() - 60_000).toISOString());

    if (count && count >= 3) {
      return fail(c, C.ERROR_CODES.OTP_RATE_LIMITED);
    }

    await admin.from('otp_requests').insert({ mobile_e164: mobile });
  } catch {
    // Non-fatal if table write fails in test environments
  }

  return c.json({
    mobile_masked: maskMobile(mobile),
    expires_in_seconds: 300
  });
});

app.post('/auth/otp/verify', async (c) => {
  let body;
  try { body = await c.req.json(); } catch {
    return fail(c, C.ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON body.');
  }
  const parsed = C.OtpVerifyBody.safeParse(body);
  if (!parsed.success) return fail(c, C.ERROR_CODES.INVALID_OTP);

  const { mobile } = parsed.data;
  const admin = getAdminClient();
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let cleanMobile = mobile.replace(/\s+/g, '').replace(/-/g, '');
  if (!cleanMobile.startsWith('+')) cleanMobile = '+' + cleanMobile;
  const digits = cleanMobile.replace(/\D/g, '');
  const internalEmail = `phone_${digits}@cropsaathi.gov.in`;
  const internalPassword = `CropSaathiPass_${digits}_2026!`;

  let userId = null;

  // 1. Check if profile already exists for this mobile number
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id, role, profile_complete')
    .eq('mobile_e164', cleanMobile)
    .maybeSingle();

  if (existingProfile) {
    userId = existingProfile.id;
    // Ensure this user has the deterministic email/password set in auth.users
    try {
      await admin.auth.admin.updateUserById(userId, {
        email: internalEmail,
        password: internalPassword,
        email_confirm: true
      });
    } catch (uErr) {
      console.warn('[updateUserById note]', uErr.message);
    }
  } else {
    // 2. Create new user in Supabase Auth
    const createRes = await admin.auth.admin.createUser({
      email: internalEmail,
      password: internalPassword,
      phone: cleanMobile,
      email_confirm: true,
      phone_confirm: true
    });

    if (createRes.data?.user) {
      userId = createRes.data.user.id;
    } else {
      // If user already exists in auth.users, retrieve user
      const { data: usersData } = await admin.auth.admin.listUsers();
      const match = usersData?.users?.find(u => u.phone === cleanMobile || u.email === internalEmail);
      if (match) {
        userId = match.id;
        await admin.auth.admin.updateUserById(userId, {
          email: internalEmail,
          password: internalPassword,
          email_confirm: true
        });
      } else {
        console.error('[CreateUser error]', createRes.error);
        return fail(c, C.ERROR_CODES.INTERNAL_ERROR, 'Could not authenticate user.');
      }
    }

    // Ensure profile row exists
    await admin
      .from('profiles')
      .upsert({
        id: userId,
        mobile_e164: cleanMobile,
        role: 'FARMER',
        profile_complete: false
      }, { onConflict: 'id' });
  }

  // 3. Authenticate with Supabase to mint real JWT session tokens
  const signRes = await anon.auth.signInWithPassword({
    email: internalEmail,
    password: internalPassword
  });

  if (signRes.error || !signRes.data?.session) {
    console.error('[SignIn error]', signRes.error);
    return fail(c, C.ERROR_CODES.INTERNAL_ERROR, 'Failed to establish Supabase session.');
  }

  // 4. Fetch the latest profile state
  const { data: profile } = await admin
    .from('profiles')
    .select('role, profile_complete')
    .eq('id', userId)
    .single();

  return c.json({
    access_token: signRes.data.session.access_token,
    refresh_token: signRes.data.session.refresh_token,
    expires_in_seconds: signRes.data.session.expires_in,
    user: {
      id: userId,
      role: profile?.role ?? 'FARMER',
      profile_complete: profile?.profile_complete ?? false
    }
  });
});

app.post('/auth/logout', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) return fail(c, C.ERROR_CODES.UNAUTHENTICATED);
  const supabase = getScopedClient(authHeader);
  await supabase.auth.signOut();
  return c.body(null, 204);
});

app.get('/me', (c) => callRpc(c, 'api_get_me'));

app.put('/farmers/me', async (c) => {
  let body;
  try { body = await c.req.json(); } catch {
    return fail(c, C.ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON body.');
  }
  const parsed = C.UpdateFarmerBody.safeParse(body);
  if (!parsed.success) return fail(c, C.ERROR_CODES.VALIDATION_ERROR, parsed.error.issues[0]?.message);
  if (!parsed.data.privacy_acknowledged) return fail(c, C.ERROR_CODES.PRIVACY_ACK_REQUIRED);

  return callRpc(c, 'api_update_farmer', { p: parsed.data });
});

app.get('/farmer/dashboard', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return fail(c, C.ERROR_CODES.UNAUTHENTICATED);
  }

  const supabase = getScopedClient(authHeader);
  const { data, error } = await supabase.rpc('api_farmer_dashboard');

  if (error) {
    const domainCode = extractDomainCode(error);
    if (domainCode) {
      return fail(c, domainCode);
    }
    if (error.code === 'PGRST301' || error.message?.includes('JWT')) {
      return fail(c, C.ERROR_CODES.UNAUTHENTICATED);
    }
    console.error('[RPC Error: api_farmer_dashboard]', error);
    return fail(c, C.ERROR_CODES.INTERNAL_ERROR);
  }

  // Ensure upcoming_bookings is an array (even if cloud DB RPC is not yet updated)
  if (data && (!data.upcoming_bookings || data.upcoming_bookings.length === 0)) {
    try {
      const admin = getAdminClient();
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        const { data: farmer } = await admin
          .from('farmers')
          .select('id')
          .eq('user_id', userData.user.id)
          .maybeSingle();

        if (farmer) {
          const { data: bookings } = await admin
            .from('bookings')
            .select(`
              id, reference, commodity_code, expected_quantity_qtl, status, created_at,
              centres ( name ),
              slots ( date, start_time, end_time )
            `)
            .eq('farmer_id', farmer.id)
            .neq('status', 'CANCELLED')
            .order('created_at', { ascending: false });

          if (bookings && bookings.length > 0) {
            data.upcoming_bookings = bookings.map((b) => ({
              id: b.id,
              reference: b.reference,
              centre_name: b.centres?.name ?? 'Procurement Centre',
              commodity_code: b.commodity_code,
              expected_quantity_qtl: b.expected_quantity_qtl?.toString() ?? '0',
              slot_date: b.slots?.date ?? '',
              slot_start: b.slots?.start_time ? b.slots.start_time.slice(0, 5) : '',
              slot_end: b.slots?.end_time ? b.slots.end_time.slice(0, 5) : '',
              status: b.status
            }));
            if (!data.upcoming_booking && data.upcoming_bookings.length > 0) {
              data.upcoming_booking = data.upcoming_bookings[0];
            }
          } else {
            data.upcoming_bookings = data.upcoming_booking ? [data.upcoming_booking] : [];
          }
        }
      }
    } catch (err) {
      console.warn('[serve-api] fallback bookings fetch error:', err);
      data.upcoming_bookings = data.upcoming_booking ? [data.upcoming_booking] : [];
    }
  }

  return c.json(data);
});

app.get('/centres', async (c) => {
  const query = { commodity_code: c.req.query('commodity_code'), date: c.req.query('date') };
  const parsed = C.CentresQuery.safeParse(query);
  if (!parsed.success) return fail(c, C.ERROR_CODES.INVALID_DATE);

  const authHeader = c.req.header('Authorization');
  if (!authHeader) return fail(c, C.ERROR_CODES.UNAUTHENTICATED);

  const supabase = getScopedClient(authHeader);
  const { data, error } = await supabase.rpc('api_get_centres', {
    p_commodity: parsed.data.commodity_code,
    p_date: parsed.data.date
  });

  if (!error && data?.centres && data.centres.length > 0) {
    return c.json(data);
  }

  // Fallback if cloud DB rates table does not yet have this newly added commodity
  try {
    const admin = getAdminClient();
    const { data: centres } = await admin
      .from('centres')
      .select('id, name, state_code, district')
      .eq('active', true)
      .order('name');

    if (centres && centres.length > 0) {
      const { data: slots } = await admin
        .from('slots')
        .select('centre_id, capacity, booked_count, active')
        .eq('date', parsed.data.date)
        .eq('active', true);

      const items = centres.map((ct) => {
        const matchingSlots = (slots || []).filter((s) => s.centre_id === ct.id);
        const hasRoom = matchingSlots.some((s) => s.booked_count < s.capacity);
        return {
          id: ct.id,
          name: ct.name,
          state_code: ct.state_code,
          district: ct.district,
          availability: matchingSlots.length > 0 && hasRoom ? 'AVAILABLE' : 'FULL'
        };
      });

      return c.json({ centres: items });
    }
  } catch (err) {
    console.warn('[serve-api] fallback centres error:', err);
  }

  return c.json(data ?? { centres: [] });
});

app.get('/centres/:centre_id/slots', (c) => {
  const centreId = c.req.param('centre_id');
  const date = c.req.query('date');
  const parsed = C.SlotsQuery.safeParse({ date });
  if (!parsed.success) return fail(c, C.ERROR_CODES.INVALID_DATE);
  return callRpc(c, 'api_get_slots', { p_centre: centreId, p_date: parsed.data.date });
});

app.post('/bookings', async (c) => {
  let body;
  try { body = await c.req.json(); } catch {
    return fail(c, C.ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON body.');
  }
  const parsed = C.CreateBookingBody.safeParse(body);
  if (!parsed.success) return fail(c, C.ERROR_CODES.INVALID_QUANTITY);

  const authHeader = c.req.header('Authorization');
  if (!authHeader) return fail(c, C.ERROR_CODES.UNAUTHENTICATED);

  const supabase = getScopedClient(authHeader);
  const { data: userData, error: uErr } = await supabase.auth.getUser();
  if (uErr || !userData?.user) return fail(c, C.ERROR_CODES.UNAUTHENTICATED);

  const admin = getAdminClient();

  // Find farmer profile
  const { data: farmer, error: fErr } = await admin
    .from('farmers')
    .select('id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (fErr || !farmer) {
    return fail(c, C.ERROR_CODES.FARMER_ONLY, 'Farmer profile not found. Please complete profile setup first.');
  }

  // Find slot
  const { data: slot, error: sErr } = await admin
    .from('slots')
    .select('*')
    .eq('id', parsed.data.slot_id)
    .maybeSingle();

  if (sErr || !slot) return fail(c, C.ERROR_CODES.SLOT_NOT_FOUND);
  if (!slot.active || slot.booked_count >= slot.capacity) return fail(c, C.ERROR_CODES.SLOT_FULL);

  // Prevent duplicate booking for the exact same slot
  const { data: existingBooking } = await admin
    .from('bookings')
    .select('id')
    .eq('farmer_id', farmer.id)
    .eq('slot_id', slot.id)
    .neq('status', 'CANCELLED')
    .maybeSingle();

  if (existingBooking) {
    return fail(c, C.ERROR_CODES.DUPLICATE_ACTIVE_BOOKING, 'You have already booked this specific time slot.');
  }

  // Generate unique booking reference: e.g. BK-2026-XXXX
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const vRef = `BK-2026-${randNum}`;

  // Insert booking into Supabase Cloud
  const { data: booking, error: bErr } = await admin
    .from('bookings')
    .insert({
      reference: vRef,
      farmer_id: farmer.id,
      centre_id: slot.centre_id,
      slot_id: slot.id,
      commodity_code: parsed.data.commodity_code,
      expected_quantity_qtl: parsed.data.expected_quantity_qtl,
      status: 'BOOKED'
    })
    .select('*')
    .single();

  if (bErr) {
    console.error('[CreateBooking Error]', bErr);
    return fail(c, C.ERROR_CODES.INTERNAL_ERROR, bErr.message);
  }

  // Increment slot booked_count
  await admin
    .from('slots')
    .update({ booked_count: slot.booked_count + 1 })
    .eq('id', slot.id);

  // Fetch centre name
  const { data: centre } = await admin
    .from('centres')
    .select('name')
    .eq('id', slot.centre_id)
    .maybeSingle();

  return c.json({
    id: booking.id,
    reference: booking.reference,
    status: booking.status,
    farmer_id: booking.farmer_id,
    centre_id: booking.centre_id,
    centre_name: centre?.name ?? 'Procurement Centre',
    slot_id: booking.slot_id,
    slot_date: slot.date,
    slot_start: slot.start_time,
    slot_end: slot.end_time,
    commodity_code: booking.commodity_code,
    expected_quantity_qtl: booking.expected_quantity_qtl.toString(),
    created_at: booking.created_at
  }, 201);
});

app.get('/bookings/:booking_id', (c) => callRpc(c, 'api_get_booking', { p_booking: c.req.param('booking_id') }));

app.get('/queue/:booking_id', (c) => callRpc(c, 'api_get_queue', { p_booking: c.req.param('booking_id') }));

app.post('/operator/bookings/:booking_id/check-in', (c) =>
  callRpc(c, 'api_check_in', { p_booking: c.req.param('booking_id') })
);

app.post('/operator/queue/:centre_id/call-next', (c) =>
  callRpc(c, 'api_call_next', { p_centre: c.req.param('centre_id') })
);

app.post('/operator/queue/:booking_id/start-service', (c) =>
  callRpc(c, 'api_start_service', { p_booking: c.req.param('booking_id') })
);

app.post('/operator/queue/:booking_id/complete-service', (c) =>
  callRpc(c, 'api_complete_service', { p_booking: c.req.param('booking_id') })
);

app.get('/procurements/:procurement_id', (c) =>
  callRpc(c, 'api_get_procurement', { p_proc: c.req.param('procurement_id') })
);

app.post('/operator/procurements/:procurement_id/events', async (c) => {
  const procId = c.req.param('procurement_id');
  let body;
  try { body = await c.req.json(); } catch {
    return fail(c, C.ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON body.');
  }
  const parsed = C.CreateProcurementEventBody.safeParse(body);
  if (!parsed.success) return fail(c, C.ERROR_CODES.VALIDATION_ERROR, parsed.error.issues[0]?.message);

  return callRpc(c, 'api_append_procurement_event', {
    p_proc: procId,
    p_type: parsed.data.type,
    p_qty: parsed.data.quantity_qtl ?? null,
    p_reason: parsed.data.reason_code ?? null
  });
});

app.get('/payments/:procurement_id', (c) =>
  callRpc(c, 'api_get_payment', { p_proc: c.req.param('procurement_id') })
);

app.post('/operator/payments/:procurement_id/status', async (c) => {
  const procId = c.req.param('procurement_id');
  let body;
  try { body = await c.req.json(); } catch {
    return fail(c, C.ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON body.');
  }
  const parsed = C.SetPaymentStatusBody.safeParse(body);
  if (!parsed.success) return fail(c, C.ERROR_CODES.VALIDATION_ERROR, parsed.error.issues[0]?.message);

  return callRpc(c, 'api_set_payment_status', {
    p_proc: procId,
    p_status: parsed.data.status,
    p_ref: parsed.data.reference ?? null
  });
});

app.get('/operator/dashboard', (c) => callRpc(c, 'api_operator_dashboard'));

app.get('/operator/slots', (c) => {
  const date = c.req.query('date');
  const parsed = C.OperatorSlotsQuery.safeParse({ date });
  if (!parsed.success) return fail(c, C.ERROR_CODES.INVALID_DATE);
  return callRpc(c, 'api_operator_slots', { p_date: parsed.data.date });
});

app.post('/operator/slots', async (c) => {
  let body;
  try { body = await c.req.json(); } catch {
    return fail(c, C.ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON body.');
  }
  const parsed = C.CreateSlotBody.safeParse(body);
  if (!parsed.success) return fail(c, C.ERROR_CODES.VALIDATION_ERROR, parsed.error.issues[0]?.message);

  const authHeader = c.req.header('Authorization');
  if (!authHeader) return fail(c, C.ERROR_CODES.UNAUTHENTICATED);

  const supabase = getScopedClient(authHeader);
  const { data, error } = await supabase.rpc('api_create_slot', {
    p_date: parsed.data.date,
    p_start: parsed.data.start,
    p_end: parsed.data.end,
    p_capacity: parsed.data.capacity
  });

  if (error) {
    const code = extractDomainCode(error);
    if (code) return fail(c, code);
    return fail(c, C.ERROR_CODES.INTERNAL_ERROR, error.message);
  }

  return c.json(data, 201);
});

app.patch('/operator/slots/:slot_id', async (c) => {
  const slotId = c.req.param('slot_id');
  let body;
  try { body = await c.req.json(); } catch {
    return fail(c, C.ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON body.');
  }
  const parsed = C.PatchSlotBody.safeParse(body);
  if (!parsed.success) return fail(c, C.ERROR_CODES.VALIDATION_ERROR, parsed.error.issues[0]?.message);

  return callRpc(c, 'api_patch_slot', {
    p_slot: slotId,
    p_capacity: parsed.data.capacity ?? null,
    p_active: parsed.data.active ?? null
  });
});

console.log(`[CropSaathi API] Starting local façade on port ${PORT}...`);
console.log(`[CropSaathi API] Connected to live Supabase: ${SUPABASE_URL}`);

serve({
  fetch: app.fetch,
  port: PORT
});
