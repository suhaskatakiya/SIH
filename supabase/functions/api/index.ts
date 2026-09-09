// ============================================================================
// supabase/functions/api/index.ts — CropSaathi Hono API Façade (§1, §2, §4.8)
//
// A small TypeScript + Hono boundary mounted on Supabase Edge Functions.
// It validates every request against @cropsaathi/contracts Zod schemas, extracts
// authenticated user context from the Bearer JWT, delegates domain mutations
// to the PostgreSQL SECURITY DEFINER RPCs, and maps any PostgreSQL CROPSAATHI:<CODE>
// exception into the frozen universal error envelope:
//   { "error": true, "code": "STRING_CODE", "message": "Human readable" }
// ============================================================================

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createClient } from '@supabase/supabase-js';
import {
  API_PREFIX,
  ERROR_CODES,
  OtpRequestBody,
  OtpVerifyBody,
  UpdateFarmerBody,
  CentresQuery,
  SlotsQuery,
  CreateBookingBody,
  CreateProcurementEventBody,
  SetPaymentStatusBody,
  OperatorSlotsQuery,
  CreateSlotBody,
  PatchSlotBody
} from '../_shared/contracts/index.ts';

// ----------------------------------------------------------------------------
// Environment & Clients
// ----------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? SUPABASE_ANON_KEY;

/** Supabase client acting with the user's Bearer token. */
function getScopedClient(authHeader: string | null | undefined) {
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

/** Admin Supabase client using the service-role key (for auth verification & user profile reads). */
function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

// ----------------------------------------------------------------------------
// Status code mapping for universal errors (§2 Universal Error Format)
// ----------------------------------------------------------------------------
const STATUS_BY_CODE: Record<string, number> = {
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

const ERROR_MESSAGES: Record<string, string> = {
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

/** Mask an E.164 mobile number: keeps +91 + last 4, stars the middle. */
function maskMobile(phone: string): string {
  if (!phone || phone.length < 8) return phone ?? '';
  return phone.slice(0, 3) + '*'.repeat(Math.max(phone.length - 7, 1)) + phone.slice(-4);
}

/** Extract CROPSAATHI:<CODE> error from PostgreSQL RPC response. */
function extractDomainCode(err: any): string | null {
  if (!err) return null;
  const raw = err.message || err.details || (typeof err === 'string' ? err : '');
  const match = raw.match(/CROPSAATHI:([A-Z0-9_]+)/);
  if (match) return match[1];
  if (typeof raw === 'string' && raw in STATUS_BY_CODE) return raw;
  return null;
}

/** Format a universal application error response. */
function fail(c: any, code: string, customMessage?: string) {
  const status = STATUS_BY_CODE[code] ?? 400;
  const message = customMessage ?? ERROR_MESSAGES[code] ?? code;
  return c.json({ error: true, code, message }, status);
}

// ----------------------------------------------------------------------------
// Hono App Definition
// ----------------------------------------------------------------------------
const app = new Hono().basePath(API_PREFIX);

// CORS headers
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type', 'Accept'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400
}));

// Helper to run an RPC and handle domain errors consistently
async function callRpc(c: any, rpcName: string, params: Record<string, any> = {}) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return fail(c, ERROR_CODES.UNAUTHENTICATED);
  }

  const supabase = getScopedClient(authHeader);
  const { data, error } = await supabase.rpc(rpcName, params);

  if (error) {
    const domainCode = extractDomainCode(error);
    if (domainCode) {
      return fail(c, domainCode);
    }
    // Auth expired / invalid JWT
    if (error.code === 'PGRST301' || error.message?.includes('JWT')) {
      return fail(c, ERROR_CODES.UNAUTHENTICATED);
    }
    console.error(`[RPC Error: ${rpcName}]`, error);
    return fail(c, ERROR_CODES.INTERNAL_ERROR);
  }

  return c.json(data);
}

// ----------------------------------------------------------------------------
// A. Authentication (§2.A)
// ----------------------------------------------------------------------------

// POST /api/v1/auth/otp/request
app.post('/auth/otp/request', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON body.');
  }

  const parsed = OtpRequestBody.safeParse(body);
  if (!parsed.success) {
    return fail(c, ERROR_CODES.INVALID_MOBILE);
  }

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
      return fail(c, ERROR_CODES.OTP_RATE_LIMITED);
    }

    await admin.from('otp_requests').insert({ mobile_e164: mobile });
  } catch {
    // Non-fatal if table write fails in test environments
  }

  const { error } = await admin.auth.signInWithOtp({ phone: mobile });
  if (error) {
    if (error.status === 429 || error.message?.includes('rate')) {
      return fail(c, ERROR_CODES.OTP_RATE_LIMITED);
    }
    console.error('[OTP Request Error]', error);
    return fail(c, ERROR_CODES.OTP_PROVIDER_UNAVAILABLE);
  }

  return c.json({
    mobile_masked: maskMobile(mobile),
    expires_in_seconds: 300
  });
});

// POST /api/v1/auth/otp/verify
app.post('/auth/otp/verify', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON body.');
  }

  const parsed = OtpVerifyBody.safeParse(body);
  if (!parsed.success) {
    return fail(c, ERROR_CODES.INVALID_OTP);
  }

  const { mobile, otp } = parsed.data;
  const admin = getAdminClient();

  const { data, error } = await admin.auth.verifyOtp({
    phone: mobile,
    token: otp,
    type: 'sms'
  });

  if (error || !data.session || !data.user) {
    if (error?.message?.includes('expired')) {
      return fail(c, ERROR_CODES.OTP_EXPIRED);
    }
    return fail(c, ERROR_CODES.INVALID_OTP);
  }

  // Fetch or ensure profile
  const { data: profile } = await admin
    .from('profiles')
    .select('role, profile_complete')
    .eq('id', data.user.id)
    .single();

  const role = profile?.role ?? 'FARMER';
  const profileComplete = profile?.profile_complete ?? false;

  return c.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in_seconds: data.session.expires_in,
    user: {
      id: data.user.id,
      role,
      profile_complete: profileComplete
    }
  });
});

// POST /api/v1/auth/logout
app.post('/auth/logout', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return fail(c, ERROR_CODES.UNAUTHENTICATED);
  }
  const supabase = getScopedClient(authHeader);
  await supabase.auth.signOut();
  return c.body(null, 204);
});

// ----------------------------------------------------------------------------
// B. Profile / Registration (§2.B)
// ----------------------------------------------------------------------------

// GET /api/v1/me
app.get('/me', async (c) => {
  return callRpc(c, 'api_get_me');
});

// PUT /api/v1/farmers/me
app.put('/farmers/me', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON body.');
  }

  const parsed = UpdateFarmerBody.safeParse(body);
  if (!parsed.success) {
    return fail(c, ERROR_CODES.VALIDATION_ERROR, parsed.error.issues[0]?.message);
  }
  if (!parsed.data.privacy_acknowledged) {
    return fail(c, ERROR_CODES.PRIVACY_ACK_REQUIRED);
  }

  return callRpc(c, 'api_update_farmer', { p: parsed.data });
});

// ----------------------------------------------------------------------------
// C. Farmer Dashboard (§2.C)
// ----------------------------------------------------------------------------

// GET /api/v1/farmer/dashboard
app.get('/farmer/dashboard', async (c) => {
  return callRpc(c, 'api_farmer_dashboard');
});

// ----------------------------------------------------------------------------
// D. Centres & Slots (§2.D)
// ----------------------------------------------------------------------------

// GET /api/v1/centres
app.get('/centres', async (c) => {
  const query = {
    commodity_code: c.req.query('commodity_code'),
    date: c.req.query('date')
  };
  const parsed = CentresQuery.safeParse(query);
  if (!parsed.success) {
    return fail(c, ERROR_CODES.INVALID_DATE);
  }

  return callRpc(c, 'api_get_centres', {
    p_commodity: parsed.data.commodity_code,
    p_date: parsed.data.date
  });
});

// GET /api/v1/centres/:centre_id/slots
app.get('/centres/:centre_id/slots', async (c) => {
  const centreId = c.req.param('centre_id');
  const date = c.req.query('date');
  const parsed = SlotsQuery.safeParse({ date });
  if (!parsed.success) {
    return fail(c, ERROR_CODES.INVALID_DATE);
  }

  return callRpc(c, 'api_get_slots', {
    p_centre: centreId,
    p_date: parsed.data.date
  });
});

// ----------------------------------------------------------------------------
// E. Booking (§2.E)
// ----------------------------------------------------------------------------

// POST /api/v1/bookings
app.post('/bookings', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON body.');
  }

  const parsed = CreateBookingBody.safeParse(body);
  if (!parsed.success) {
    return fail(c, ERROR_CODES.INVALID_QUANTITY);
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader) return fail(c, ERROR_CODES.UNAUTHENTICATED);

  const supabase = getScopedClient(authHeader);
  const { data, error } = await supabase.rpc('api_create_booking', {
    p_slot: parsed.data.slot_id,
    p_commodity: parsed.data.commodity_code,
    p_qty: parsed.data.expected_quantity_qtl
  });

  if (error) {
    const code = extractDomainCode(error);
    if (code) return fail(c, code);
    return fail(c, ERROR_CODES.INTERNAL_ERROR);
  }

  return c.json(data, 201);
});

// GET /api/v1/bookings/:booking_id
app.get('/bookings/:booking_id', async (c) => {
  const bookingId = c.req.param('booking_id');
  return callRpc(c, 'api_get_booking', { p_booking: bookingId });
});

// ----------------------------------------------------------------------------
// F. Queue (§2.F)
// ----------------------------------------------------------------------------

// GET /api/v1/queue/:booking_id
app.get('/queue/:booking_id', async (c) => {
  const bookingId = c.req.param('booking_id');
  return callRpc(c, 'api_get_queue', { p_booking: bookingId });
});

// POST /api/v1/operator/bookings/:booking_id/check-in
app.post('/operator/bookings/:booking_id/check-in', async (c) => {
  const bookingId = c.req.param('booking_id');
  return callRpc(c, 'api_check_in', { p_booking: bookingId });
});

// POST /api/v1/operator/queue/:centre_id/call-next
app.post('/operator/queue/:centre_id/call-next', async (c) => {
  const centreId = c.req.param('centre_id');
  return callRpc(c, 'api_call_next', { p_centre: centreId });
});

// POST /api/v1/operator/queue/:booking_id/start-service
app.post('/operator/queue/:booking_id/start-service', async (c) => {
  const bookingId = c.req.param('booking_id');
  return callRpc(c, 'api_start_service', { p_booking: bookingId });
});

// POST /api/v1/operator/queue/:booking_id/complete-service
app.post('/operator/queue/:booking_id/complete-service', async (c) => {
  const bookingId = c.req.param('booking_id');
  return callRpc(c, 'api_complete_service', { p_booking: bookingId });
});

// ----------------------------------------------------------------------------
// G. Procurement (§2.G)
// ----------------------------------------------------------------------------

// GET /api/v1/procurements/:procurement_id
app.get('/procurements/:procurement_id', async (c) => {
  const procId = c.req.param('procurement_id');
  return callRpc(c, 'api_get_procurement', { p_proc: procId });
});

// POST /api/v1/operator/procurements/:procurement_id/events
app.post('/operator/procurements/:procurement_id/events', async (c) => {
  const procId = c.req.param('procurement_id');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON body.');
  }

  const parsed = CreateProcurementEventBody.safeParse(body);
  if (!parsed.success) {
    return fail(c, ERROR_CODES.VALIDATION_ERROR, parsed.error.issues[0]?.message);
  }

  return callRpc(c, 'api_append_procurement_event', {
    p_proc: procId,
    p_type: parsed.data.type,
    p_qty: parsed.data.quantity_qtl ?? null,
    p_reason: parsed.data.reason_code ?? null
  });
});

// ----------------------------------------------------------------------------
// H. Payment (§2.H)
// ----------------------------------------------------------------------------

// GET /api/v1/payments/:procurement_id
app.get('/payments/:procurement_id', async (c) => {
  const procId = c.req.param('procurement_id');
  return callRpc(c, 'api_get_payment', { p_proc: procId });
});

// POST /api/v1/operator/payments/:procurement_id/status
app.post('/operator/payments/:procurement_id/status', async (c) => {
  const procId = c.req.param('procurement_id');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON body.');
  }

  const parsed = SetPaymentStatusBody.safeParse(body);
  if (!parsed.success) {
    return fail(c, ERROR_CODES.VALIDATION_ERROR, parsed.error.issues[0]?.message);
  }

  return callRpc(c, 'api_set_payment_status', {
    p_proc: procId,
    p_status: parsed.data.status,
    p_ref: parsed.data.reference ?? null
  });
});

// ----------------------------------------------------------------------------
// I. Operator Dashboard & Slot Management (§2.I)
// ----------------------------------------------------------------------------

// GET /api/v1/operator/dashboard
app.get('/operator/dashboard', async (c) => {
  return callRpc(c, 'api_operator_dashboard');
});

// GET /api/v1/operator/slots
app.get('/operator/slots', async (c) => {
  const date = c.req.query('date');
  const parsed = OperatorSlotsQuery.safeParse({ date });
  if (!parsed.success) {
    return fail(c, ERROR_CODES.INVALID_DATE);
  }

  return callRpc(c, 'api_operator_slots', { p_date: parsed.data.date });
});

// POST /api/v1/operator/slots
app.post('/operator/slots', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON body.');
  }

  const parsed = CreateSlotBody.safeParse(body);
  if (!parsed.success) {
    return fail(c, ERROR_CODES.VALIDATION_ERROR, parsed.error.issues[0]?.message);
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader) return fail(c, ERROR_CODES.UNAUTHENTICATED);

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
    return fail(c, ERROR_CODES.INTERNAL_ERROR);
  }

  return c.json(data, 201);
});

// PATCH /api/v1/operator/slots/:slot_id
app.patch('/operator/slots/:slot_id', async (c) => {
  const slotId = c.req.param('slot_id');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON body.');
  }

  const parsed = PatchSlotBody.safeParse(body);
  if (!parsed.success) {
    return fail(c, ERROR_CODES.VALIDATION_ERROR, parsed.error.issues[0]?.message);
  }

  return callRpc(c, 'api_patch_slot', {
    p_slot: slotId,
    p_capacity: parsed.data.capacity ?? null,
    p_active: parsed.data.active ?? null
  });
});

// ----------------------------------------------------------------------------
// Export & Serve (Deno / Supabase Edge Function Handler)
// ----------------------------------------------------------------------------
export default {
  fetch(req: Request) {
    const url = new URL(req.url);
    // Path normalization:
    // If running under /functions/v1/api or /api/api/v1, normalize to /api/v1/...
    if (url.pathname.startsWith('/api/api/v1')) {
      url.pathname = url.pathname.replace(/^\/api/, '');
      return app.fetch(new Request(url.toString(), req));
    }
    return app.fetch(req);
  }
};

// Deno.serve entrypoint for Edge Functions
if (typeof Deno !== 'undefined' && 'serve' in Deno) {
  Deno.serve((req) => {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/api/v1')) {
      url.pathname = url.pathname.replace(/^\/api/, '');
      return app.fetch(new Request(url.toString(), req));
    }
    return app.fetch(req);
  });
}
