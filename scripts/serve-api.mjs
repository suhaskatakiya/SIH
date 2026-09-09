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
    return fail(c, C.ERROR_CODES.INTERNAL_ERROR, error.message);
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

  const { error } = await admin.auth.signInWithOtp({ phone: mobile });
  if (error) {
    console.error('[OTP Request Error]', error);
    if (error.status === 429 || error.message?.includes('rate')) {
      return fail(c, C.ERROR_CODES.OTP_RATE_LIMITED);
    }
    return fail(c, C.ERROR_CODES.OTP_PROVIDER_UNAVAILABLE);
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

  const { mobile, otp } = parsed.data;
  const admin = getAdminClient();

  const { data, error } = await admin.auth.verifyOtp({
    phone: mobile,
    token: otp,
    type: 'sms'
  });

  if (error || !data.session || !data.user) {
    if (error?.message?.includes('expired')) return fail(c, C.ERROR_CODES.OTP_EXPIRED);
    return fail(c, C.ERROR_CODES.INVALID_OTP);
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('role, profile_complete')
    .eq('id', data.user.id)
    .single();

  return c.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in_seconds: data.session.expires_in,
    user: {
      id: data.user.id,
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

app.get('/farmer/dashboard', (c) => callRpc(c, 'api_farmer_dashboard'));

app.get('/centres', (c) => {
  const query = { commodity_code: c.req.query('commodity_code'), date: c.req.query('date') };
  const parsed = C.CentresQuery.safeParse(query);
  if (!parsed.success) return fail(c, C.ERROR_CODES.INVALID_DATE);
  return callRpc(c, 'api_get_centres', { p_commodity: parsed.data.commodity_code, p_date: parsed.data.date });
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
  const { data, error } = await supabase.rpc('api_create_booking', {
    p_slot: parsed.data.slot_id,
    p_commodity: parsed.data.commodity_code,
    p_qty: parsed.data.expected_quantity_qtl
  });

  if (error) {
    const code = extractDomainCode(error);
    if (code) return fail(c, code);
    return fail(c, C.ERROR_CODES.INTERNAL_ERROR, error.message);
  }

  return c.json(data, 201);
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
