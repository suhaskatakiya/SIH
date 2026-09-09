/**
 * Mock adapter — a self-contained, in-memory SIH backend.
 *
 * It mirrors the real backend's *behaviour*, not just its shapes: the same
 * guards the Postgres RPCs enforce (SLOT_FULL, DUPLICATE_ACTIVE_BOOKING, the
 * procurement/payment state machines, operator-centre ownership) are reproduced
 * here so the entire farmer → queue → procurement → payment flow and the operator
 * actions can be demonstrated in one browser with no credentials.
 *
 * State lives in a module singleton and is persisted to localStorage so a reload
 * keeps your place. Clear it from the browser console with:
 *     localStorage.removeItem('cropsaathi.mock.db.v1')
 *
 * Demo logins (any 4–8 digit OTP is accepted in mock mode):
 *   +919876543210  → Ramesh Patel — FARMER (fresh; do the full journey)
 *   +919999900001  → Centre 01 — OPERATOR
 *   +919812345678  → Suresh Kumar — FARMER (pre-seeded, already in today's queue)
 */
import type {
  Booking,
  BookingStatus,
  CallNextResponse,
  CentresQuery,
  CentresResponse,
  CheckInResponse,
  CompleteServiceResponse,
  CreateBookingBody,
  CreateProcurementEventBody,
  CreateSlotBody,
  FarmerDashboardResponse,
  MeResponse,
  OperatorDashboardResponse,
  OperatorSlot,
  OperatorSlotsQuery,
  OperatorSlotsResponse,
  OtpRequestBody,
  OtpRequestResponse,
  OtpVerifyBody,
  OtpVerifyResponse,
  PatchSlotBody,
  Payment,
  PaymentStatus,
  Procurement,
  ProcurementEventResponse,
  ProcurementStatus,
  QualityStatus,
  QueueState,
  QueueStatusResponse,
  Role,
  SetPaymentStatusBody,
  SlotsQuery,
  SlotsResponse,
  StartServiceResponse,
  UpdateFarmerBody,
  UpdateFarmerResponse
} from '@cropsaathi/contracts';
import { ERROR_CODES } from '@cropsaathi/contracts';
import { addDaysIso, todayIso } from '../../format';
import type { ApiClient, CentreBookingRow, CentreBookingsResponse } from '../api';
import { ApiClientError } from '../errors';

/* ------------------------------------------------------------------ *
 * Error helper — maps a code to a sensible HTTP status.
 * ------------------------------------------------------------------ */
const STATUS_BY_CODE: Record<string, number> = {
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
  CAPACITY_BELOW_BOOKED_COUNT: 409
};

function fail(code: string, message: string): never {
  throw new ApiClientError(STATUS_BY_CODE[code] ?? 400, code, message);
}

/* ------------------------------------------------------------------ *
 * NUMERIC helpers — money/quantity are decimal strings, multiplied with
 * BigInt so we never touch floating point (matches the Postgres NUMERIC path).
 * ------------------------------------------------------------------ */
function scaled(value: string, scale: number): bigint {
  const neg = value.startsWith('-');
  const clean = neg ? value.slice(1) : value;
  const [int = '0', frac = ''] = clean.split('.');
  const padded = (frac + '0'.repeat(scale)).slice(0, scale);
  const n = BigInt(int + padded);
  return neg ? -n : n;
}

/** Multiply two 2-decimal money/quantity strings, returning a 2-decimal string. */
function mulMoney(a: string, b: string): string {
  const A = scaled(a, 2); // ×100
  const B = scaled(b, 2); // ×100
  const product = A * B; // ×10000
  // round half-up to 2 decimals (÷100 from ×10000 → ×100)
  const rounded = (product + 50n) / 100n; // ×100
  const whole = rounded / 100n;
  const frac = (rounded % 100n).toString().padStart(2, '0');
  return `${whole.toString()}.${frac}`;
}

/* ------------------------------------------------------------------ *
 * In-memory schema
 * ------------------------------------------------------------------ */
interface UserRow {
  id: string;
  mobile: string;
  role: Role;
  profile_complete: boolean;
}
interface FarmerRow {
  id: string;
  full_name: string;
  state_code: string;
  district: string;
  village: string;
  external_farmer_ref: string | null;
  preferred_language: string;
}
interface CentreRow {
  id: string;
  name: string;
  state_code: string;
  district: string;
  avg_service_minutes: number;
}
interface RateRow {
  commodity_code: string;
  rate_per_qtl: string;
  active: boolean;
}
interface SlotRow {
  id: string;
  centre_id: string;
  date: string;
  start: string;
  end: string;
  capacity: number;
  booked_count: number;
  active: boolean;
}
interface BookingRow {
  id: string;
  reference: string;
  farmer_id: string;
  centre_id: string;
  centre_name: string;
  slot_id: string;
  slot_date: string;
  slot_start: string;
  slot_end: string;
  commodity_code: string;
  expected_quantity_qtl: string;
  status: BookingStatus;
  created_at: string;
}
interface QueueRow {
  id: string;
  booking_id: string;
  centre_id: string;
  state: QueueState;
  created_at: string;
}
interface ProcEvent {
  type: string;
  created_at: string;
}
interface ProcurementRow {
  id: string;
  booking_id: string;
  centre_id: string;
  commodity_code: string;
  status: ProcurementStatus;
  quality_status: QualityStatus | null;
  quantity_qtl: string | null;
  rate_per_qtl: string | null;
  amount: string | null;
  receipt_reference: string | null;
  events: ProcEvent[];
}
interface PaymentRow {
  procurement_id: string;
  amount: string | null;
  status: PaymentStatus;
  reference: string | null;
  updated_at: string;
}
interface OperatorLink {
  user_id: string;
  centre_id: string;
}
interface MockDb {
  version: number;
  seq: { booking: number; receipt: number };
  users: UserRow[];
  farmers: FarmerRow[];
  centres: CentreRow[];
  operatorCentres: OperatorLink[];
  rates: RateRow[];
  slots: SlotRow[];
  bookings: BookingRow[];
  queue: QueueRow[];
  procurements: ProcurementRow[];
  payments: PaymentRow[];
}

const DB_KEY = 'cropsaathi.mock.db.v1';
const DB_VERSION = 1;

/* Fixed IDs for seeded rows (valid UUIDs). */
const CENTRE_1 = '11111111-1111-4111-8111-111111111111';
const USER_RAMESH = '22222222-2222-4222-8222-222222222222';
const USER_OPERATOR = '33333333-3333-4333-8333-333333333333';
const USER_SURESH = '44444444-4444-4444-8444-444444444444';

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback (older runtimes): RFC-4122-ish.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function seedSlots(centreId: string, date: string, db: MockDb): void {
  const times: Array<[string, string]> = [
    ['09:00', '09:30'],
    ['09:30', '10:00'],
    ['10:00', '10:30'],
    ['10:30', '11:00'],
    ['11:00', '11:30']
  ];
  for (const [start, end] of times) {
    db.slots.push({
      id: uuid(),
      centre_id: centreId,
      date,
      start,
      end,
      capacity: 5,
      booked_count: 0,
      active: true
    });
  }
}

function seed(): MockDb {
  const today = todayIso();
  const db: MockDb = {
    version: DB_VERSION,
    seq: { booking: 0, receipt: 0 },
    users: [
      { id: USER_RAMESH, mobile: '+919876543210', role: 'FARMER', profile_complete: true },
      { id: USER_OPERATOR, mobile: '+919999900001', role: 'OPERATOR', profile_complete: true },
      { id: USER_SURESH, mobile: '+919812345678', role: 'FARMER', profile_complete: true }
    ],
    farmers: [
      {
        id: USER_RAMESH,
        full_name: 'Ramesh Patel',
        state_code: 'GJ',
        district: 'Rajkot',
        village: 'Kotharia',
        external_farmer_ref: 'GJ-RJT-004821',
        preferred_language: 'en'
      },
      {
        id: USER_SURESH,
        full_name: 'Suresh Kumar',
        state_code: 'GJ',
        district: 'Rajkot',
        village: 'Vavdi',
        external_farmer_ref: null,
        preferred_language: 'hi'
      }
    ],
    centres: [
      {
        id: CENTRE_1,
        name: 'APMC Procurement Centre 01',
        state_code: 'GJ',
        district: 'Rajkot',
        avg_service_minutes: 12
      }
    ],
    operatorCentres: [{ user_id: USER_OPERATOR, centre_id: CENTRE_1 }],
    rates: [
      { commodity_code: 'PADDY_COMMON', rate_per_qtl: '2441.00', active: true },
      { commodity_code: 'PADDY_GRADE_A', rate_per_qtl: '2489.00', active: true },
      { commodity_code: 'WHEAT', rate_per_qtl: '2425.00', active: true },
      { commodity_code: 'MAIZE', rate_per_qtl: '2225.00', active: true },
      { commodity_code: 'BARLEY', rate_per_qtl: '1850.00', active: true },
      { commodity_code: 'BAJRA', rate_per_qtl: '2625.00', active: true },
      { commodity_code: 'JOWAR_HYBRID', rate_per_qtl: '3371.00', active: true },
      { commodity_code: 'CHANA', rate_per_qtl: '5650.00', active: true },
      { commodity_code: 'TUR_ARHAR', rate_per_qtl: '7550.00', active: true },
      { commodity_code: 'MOONG', rate_per_qtl: '8682.00', active: true },
      { commodity_code: 'URAD', rate_per_qtl: '7400.00', active: true },
      { commodity_code: 'SOYBEAN_YELLOW', rate_per_qtl: '4892.00', active: true },
      { commodity_code: 'MUSTARD', rate_per_qtl: '5950.00', active: true },
      { commodity_code: 'GROUNDNUT', rate_per_qtl: '6783.00', active: true },
      { commodity_code: 'COTTON_MEDIUM', rate_per_qtl: '7121.00', active: true }
    ],
    slots: [],
    bookings: [],
    queue: [],
    procurements: [],
    payments: []
  };

  // Slots for today and the next two days so booking works across dates.
  seedSlots(CENTRE_1, today, db);
  seedSlots(CENTRE_1, addDaysIso(today, 1), db);
  seedSlots(CENTRE_1, addDaysIso(today, 2), db);

  // Pre-seed Suresh into today's first slot, already checked in and waiting,
  // so the operator dashboard/queue is non-empty on first login.
  const firstSlot = db.slots.find((s) => s.date === today)!;
  firstSlot.booked_count = 1;
  db.seq.booking += 1;
  const bookingId = uuid();
  db.bookings.push({
    id: bookingId,
    reference: makeBookingRef(db),
    farmer_id: USER_SURESH,
    centre_id: CENTRE_1,
    centre_name: 'APMC Procurement Centre 01',
    slot_id: firstSlot.id,
    slot_date: firstSlot.date,
    slot_start: firstSlot.start,
    slot_end: firstSlot.end,
    commodity_code: 'PADDY_COMMON',
    expected_quantity_qtl: '22.00',
    status: 'IN_QUEUE',
    created_at: nowIso()
  });
  db.queue.push({
    id: uuid(),
    booking_id: bookingId,
    centre_id: CENTRE_1,
    state: 'WAITING',
    created_at: nowIso()
  });

  return db;
}

function makeBookingRef(db: MockDb): string {
  const year = new Date().getFullYear();
  return `BK-${year}-${String(db.seq.booking).padStart(4, '0')}`;
}
function makeReceiptRef(db: MockDb): string {
  db.seq.receipt += 1;
  const year = new Date().getFullYear();
  return `PR-${year}-${String(db.seq.receipt).padStart(4, '0')}`;
}

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */
function load(): MockDb {
  if (typeof localStorage === 'undefined') return seed();
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockDb;
      if (parsed && parsed.version === DB_VERSION) return parsed;
    }
  } catch {
    /* fall through to fresh seed */
  }
  const fresh = seed();
  save(fresh);
  return fresh;
}

function save(db: MockDb): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* storage full / disabled — mock still works for this session */
  }
}

/* ------------------------------------------------------------------ *
 * Adapter
 * ------------------------------------------------------------------ */
export function createMockClient(): ApiClient {
  const db = load();
  let token: string | null = null;

  const persist = () => save(db);

  const maskMobile = (mobile: string): string => {
    if (mobile.length <= 5) return mobile;
    return `${mobile.slice(0, 3)}••••••${mobile.slice(-2)}`;
  };

  const currentUser = (): UserRow => {
    if (!token || !token.startsWith('mock.')) fail(ERROR_CODES.UNAUTHENTICATED, 'Not logged in.');
    const id = token.slice('mock.'.length);
    const user = db.users.find((u) => u.id === id);
    if (!user) fail(ERROR_CODES.UNAUTHENTICATED, 'Session expired.');
    return user;
  };
  const requireFarmer = (): UserRow => {
    const u = currentUser();
    if (u.role !== 'FARMER') fail(ERROR_CODES.FARMER_ONLY, 'Farmer account required.');
    return u;
  };
  const requireOperator = (): { user: UserRow; centreId: string } => {
    const u = currentUser();
    if (u.role !== 'OPERATOR') fail(ERROR_CODES.OPERATOR_ONLY, 'Operator account required.');
    const link = db.operatorCentres.find((l) => l.user_id === u.id);
    if (!link) fail(ERROR_CODES.OPERATOR_CENTRE_FORBIDDEN, 'No centre assigned to this operator.');
    return { user: u, centreId: link.centre_id };
  };

  const centreById = (id: string): CentreRow => {
    const c = db.centres.find((x) => x.id === id);
    if (!c) fail(ERROR_CODES.CENTRE_NOT_FOUND, 'Centre not found.');
    return c;
  };

  /** Active queue at a centre, oldest first (drives position + ETA). */
  const activeQueue = (centreId: string): QueueRow[] =>
    db.queue
      .filter((q) => q.centre_id === centreId && q.state !== 'COMPLETED')
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const queuePosition = (entry: QueueRow): { position: number; farmersAhead: number } => {
    const active = activeQueue(entry.centre_id);
    const idx = active.findIndex((q) => q.id === entry.id);
    const position = idx < 0 ? 0 : idx + 1;
    return { position, farmersAhead: Math.max(0, position - 1) };
  };

  const procurementForBooking = (bookingId: string): ProcurementRow | undefined =>
    db.procurements.find((p) => p.booking_id === bookingId);

  const toBookingEntity = (b: BookingRow): Booking => ({
    id: b.id,
    reference: b.reference,
    status: b.status,
    centre_id: b.centre_id,
    centre_name: b.centre_name,
    slot_date: b.slot_date,
    slot_start: b.slot_start,
    slot_end: b.slot_end,
    commodity_code: b.commodity_code,
    expected_quantity_qtl: b.expected_quantity_qtl
  });

  const toProcurementEntity = (p: ProcurementRow): Procurement => ({
    id: p.id,
    booking_id: p.booking_id,
    status: p.status,
    quality_status: p.quality_status,
    commodity_code: p.commodity_code,
    quantity_qtl: p.quantity_qtl,
    rate_per_qtl: p.rate_per_qtl,
    amount: p.amount,
    receipt_reference: p.receipt_reference,
    events: p.events.map((e) => ({ type: e.type as Procurement['events'][number]['type'], created_at: e.created_at }))
  });

  const toPaymentEntity = (p: PaymentRow): Payment => ({
    procurement_id: p.procurement_id,
    amount: p.amount,
    status: p.status,
    reference: p.reference,
    updated_at: p.updated_at
  });

  return {
    setToken(t) {
      token = t;
    },
    getToken() {
      return token;
    },

    /* ---- auth ---- */
    async requestOtp(body: OtpRequestBody): Promise<OtpRequestResponse> {
      return { mobile_masked: maskMobile(body.mobile), expires_in_seconds: 300 };
    },

    async verifyOtp(body: OtpVerifyBody): Promise<OtpVerifyResponse> {
      let user = db.users.find((u) => u.mobile === body.mobile);
      if (!user) {
        // New number → create a FARMER account with an incomplete profile.
        user = { id: uuid(), mobile: body.mobile, role: 'FARMER', profile_complete: false };
        db.users.push(user);
        persist();
      }
      token = `mock.${user.id}`;
      return {
        access_token: token,
        refresh_token: `mockrefresh.${user.id}`,
        expires_in_seconds: 3600,
        user: { id: user.id, role: user.role, profile_complete: user.profile_complete }
      };
    },

    async registerOperator(body: {
      mobile: string;
      fullName: string;
      centreId?: string;
      badgeId?: string;
      department?: string;
    }): Promise<OtpVerifyResponse> {
      let user = db.users.find((u) => u.mobile === body.mobile);
      if (!user) {
        user = { id: uuid(), mobile: body.mobile, role: 'OPERATOR', profile_complete: true };
        db.users.push(user);
      } else {
        user.role = 'OPERATOR';
        user.profile_complete = true;
      }
      const targetCentre = body.centreId || CENTRE_1;
      const existingLink = db.operatorCentres.find((l) => l.user_id === user.id);
      if (!existingLink) {
        db.operatorCentres.push({ user_id: user.id, centre_id: targetCentre });
      } else {
        existingLink.centre_id = targetCentre;
      }
      persist();
      token = `mock.${user.id}`;
      return {
        access_token: token,
        refresh_token: `mockrefresh.${user.id}`,
        expires_in_seconds: 3600,
        user: { id: user.id, role: 'OPERATOR', profile_complete: true }
      };
    },

    async logout(): Promise<void> {
      token = null;
    },

    /* ---- profile ---- */
    async getMe(): Promise<MeResponse> {
      const u = currentUser();
      const farmer = db.farmers.find((f) => f.id === u.id) ?? null;
      return {
        id: u.id,
        role: u.role,
        mobile_masked: maskMobile(u.mobile),
        profile_complete: u.profile_complete,
        farmer: farmer
          ? {
              id: farmer.id,
              full_name: farmer.full_name,
              state_code: farmer.state_code,
              district: farmer.district,
              village: farmer.village,
              external_farmer_ref: farmer.external_farmer_ref,
              preferred_language: farmer.preferred_language
            }
          : null
      };
    },

    async updateFarmer(body: UpdateFarmerBody): Promise<UpdateFarmerResponse> {
      const u = requireFarmer();
      if (!body.privacy_acknowledged) {
        fail(ERROR_CODES.PRIVACY_ACK_REQUIRED, 'Privacy acknowledgement is required.');
      }
      const existing = db.farmers.find((f) => f.id === u.id);
      const ref = body.external_farmer_ref ?? null;
      if (existing) {
        existing.full_name = body.full_name;
        existing.state_code = body.state_code;
        existing.district = body.district;
        existing.village = body.village;
        existing.external_farmer_ref = ref;
        existing.preferred_language = body.preferred_language;
      } else {
        db.farmers.push({
          id: u.id,
          full_name: body.full_name,
          state_code: body.state_code,
          district: body.district,
          village: body.village,
          external_farmer_ref: ref,
          preferred_language: body.preferred_language
        });
      }
      u.profile_complete = true;
      persist();
      return { farmer_id: u.id, profile_complete: true };
    },

    /* ---- farmer dashboard ---- */
    async getFarmerDashboard(): Promise<FarmerDashboardResponse> {
      const u = requireFarmer();
      const mine = db.bookings
        .filter((b) => b.farmer_id === u.id && b.status !== 'CANCELLED')
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      // Prefer an active booking; otherwise show the most recent.
      const active = mine.find((b) => b.status !== 'COMPLETED');
      const booking = active ?? mine[0] ?? null;
      if (!booking) {
        return { upcoming_booking: null, active_queue: null, procurement: null, payment: null };
      }

      const q = db.queue.find((x) => x.booking_id === booking.id);
      let active_queue: FarmerDashboardResponse['active_queue'] = null;
      if (q && q.state !== 'COMPLETED') {
        const centre = centreById(booking.centre_id);
        const { position, farmersAhead } = queuePosition(q);
        active_queue = {
          booking_id: booking.id,
          state: q.state,
          position,
          farmers_ahead: farmersAhead,
          estimated_wait_min: farmersAhead * centre.avg_service_minutes,
          updated_at: q.created_at
        };
      }

      const proc = procurementForBooking(booking.id) ?? null;
      const pay = proc ? db.payments.find((p) => p.procurement_id === proc.id) ?? null : null;

      const allUpcoming = mine.map((b) => ({
        id: b.id,
        reference: b.reference,
        centre_name: b.centre_name,
        commodity_code: b.commodity_code,
        expected_quantity_qtl: b.expected_quantity_qtl,
        slot_date: b.slot_date,
        slot_start: b.slot_start,
        slot_end: b.slot_end,
        status: b.status
      }));

      return {
        upcoming_booking: {
          id: booking.id,
          reference: booking.reference,
          centre_name: booking.centre_name,
          commodity_code: booking.commodity_code,
          expected_quantity_qtl: booking.expected_quantity_qtl,
          slot_date: booking.slot_date,
          slot_start: booking.slot_start,
          slot_end: booking.slot_end,
          status: booking.status
        },
        upcoming_bookings: allUpcoming,
        active_queue,
        procurement: proc
          ? {
              id: proc.id,
              booking_id: proc.booking_id,
              status: proc.status,
              quality_status: proc.quality_status,
              amount: proc.amount,
              receipt_reference: proc.receipt_reference
            }
          : null,
        payment: pay
          ? {
              procurement_id: pay.procurement_id,
              amount: pay.amount,
              status: pay.status,
              reference: pay.reference,
              updated_at: pay.updated_at
            }
          : null
      };
    },

    /* ---- centres / slots ---- */
    async getCentres(query: CentresQuery): Promise<CentresResponse> {
      currentUser();
      const rate = db.rates.find((r) => r.commodity_code === query.commodity_code && r.active);
      if (!rate) return { centres: [] };
      const centres = db.centres.map((c) => {
        const slots = db.slots.filter((s) => s.centre_id === c.id && s.date === query.date && s.active);
        const hasRoom = slots.some((s) => s.booked_count < s.capacity);
        return {
          id: c.id,
          name: c.name,
          state_code: c.state_code,
          district: c.district,
          availability: (slots.length > 0 && hasRoom ? 'AVAILABLE' : 'FULL') as 'AVAILABLE' | 'FULL'
        };
      });
      return { centres };
    },

    async getSlots(centreId: string, query: SlotsQuery): Promise<SlotsResponse> {
      currentUser();
      centreById(centreId);
      const slots = db.slots
        .filter((s) => s.centre_id === centreId && s.date === query.date && s.active)
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((s) => ({
          id: s.id,
          start: s.start,
          end: s.end,
          capacity: s.capacity,
          remaining: Math.max(0, s.capacity - s.booked_count)
        }));
      return { slots };
    },

    /* ---- booking ---- */
    async createBooking(body: CreateBookingBody): Promise<Booking> {
      const u = requireFarmer();
      if (!u.profile_complete) {
        fail(ERROR_CODES.VALIDATION_ERROR, 'Complete your profile before booking.');
      }
      const slot = db.slots.find((s) => s.id === body.slot_id);
      if (!slot) fail(ERROR_CODES.SLOT_NOT_FOUND, 'Slot not found.');
      if (!slot.active) fail(ERROR_CODES.SLOT_FULL, 'This slot is not open.');
      if (slot.booked_count >= slot.capacity) fail(ERROR_CODES.SLOT_FULL, 'This slot is full.');

      const activeStatuses: BookingStatus[] = ['BOOKED', 'CHECKED_IN', 'IN_QUEUE', 'IN_SERVICE'];
      const alreadyBookedSlot = db.bookings.some(
        (b) => b.farmer_id === u.id && b.slot_id === slot.id && activeStatuses.includes(b.status)
      );
      if (alreadyBookedSlot) {
        fail(ERROR_CODES.DUPLICATE_ACTIVE_BOOKING, 'You have already booked this specific time slot.');
      }

      const centre = centreById(slot.centre_id);
      db.seq.booking += 1;
      const booking: BookingRow = {
        id: uuid(),
        reference: makeBookingRef(db),
        farmer_id: u.id,
        centre_id: centre.id,
        centre_name: centre.name,
        slot_id: slot.id,
        slot_date: slot.date,
        slot_start: slot.start,
        slot_end: slot.end,
        commodity_code: body.commodity_code,
        expected_quantity_qtl: body.expected_quantity_qtl,
        status: 'BOOKED',
        created_at: nowIso()
      };
      slot.booked_count += 1;
      db.bookings.push(booking);
      persist();
      return toBookingEntity(booking);
    },

    async getBooking(bookingId: string): Promise<Booking> {
      const u = currentUser();
      const b = db.bookings.find((x) => x.id === bookingId);
      if (!b) fail(ERROR_CODES.BOOKING_NOT_FOUND, 'Booking not found.');
      if (u.role === 'FARMER' && b.farmer_id !== u.id) {
        fail(ERROR_CODES.BOOKING_FORBIDDEN, 'This booking belongs to another farmer.');
      }
      return toBookingEntity(b);
    },

    /* ---- queue ---- */
    async getQueue(bookingId: string): Promise<QueueStatusResponse> {
      const u = requireFarmer();
      const booking = db.bookings.find((x) => x.id === bookingId);
      if (!booking) fail(ERROR_CODES.BOOKING_NOT_FOUND, 'Booking not found.');
      if (booking.farmer_id !== u.id) fail(ERROR_CODES.QUEUE_FORBIDDEN, 'Not your booking.');
      const q = db.queue.find((x) => x.booking_id === bookingId);
      if (!q) fail(ERROR_CODES.QUEUE_NOT_FOUND, 'You are not in a queue.');
      const centre = centreById(booking.centre_id);
      const { position, farmersAhead } = queuePosition(q);
      return {
        booking_id: bookingId,
        state: q.state,
        position: q.state === 'COMPLETED' ? 0 : position,
        farmers_ahead: q.state === 'COMPLETED' ? 0 : farmersAhead,
        estimated_wait_min: q.state === 'COMPLETED' ? 0 : farmersAhead * centre.avg_service_minutes,
        updated_at: q.created_at
      };
    },

    async checkIn(bookingId: string): Promise<CheckInResponse> {
      const { centreId } = requireOperator();
      const booking = db.bookings.find((x) => x.id === bookingId);
      if (!booking) fail(ERROR_CODES.BOOKING_NOT_FOUND, 'Booking not found.');
      if (booking.centre_id !== centreId) {
        fail(ERROR_CODES.OPERATOR_CENTRE_FORBIDDEN, 'Booking is at another centre.');
      }
      if (booking.status !== 'BOOKED') {
        fail(ERROR_CODES.INVALID_BOOKING_STATE, 'Booking is not awaiting check-in.');
      }
      const entry: QueueRow = {
        id: uuid(),
        booking_id: bookingId,
        centre_id: centreId,
        state: 'WAITING',
        created_at: nowIso()
      };
      booking.status = 'IN_QUEUE';
      db.queue.push(entry);
      persist();
      const { position } = queuePosition(entry);
      return { queue_entry_id: entry.id, booking_id: bookingId, state: 'WAITING', position };
    },

    async callNext(centreId: string): Promise<CallNextResponse> {
      const op = requireOperator();
      if (op.centreId !== centreId) {
        fail(ERROR_CODES.OPERATOR_CENTRE_FORBIDDEN, 'Not your centre.');
      }
      const waiting = db.queue
        .filter((q) => q.centre_id === centreId && q.state === 'WAITING')
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      const next = waiting[0];
      if (!next) fail(ERROR_CODES.NO_WAITING_FARMERS, 'No farmers are waiting.');
      next.state = 'CALLED';
      persist();
      return { booking_id: next.booking_id, queue_entry_id: next.id, state: 'CALLED' };
    },

    async startService(bookingId: string): Promise<StartServiceResponse> {
      const { centreId } = requireOperator();
      const booking = db.bookings.find((x) => x.id === bookingId);
      if (!booking) fail(ERROR_CODES.BOOKING_NOT_FOUND, 'Booking not found.');
      if (booking.centre_id !== centreId) fail(ERROR_CODES.OPERATOR_CENTRE_FORBIDDEN, 'Not your centre.');
      const q = db.queue.find((x) => x.booking_id === bookingId);
      if (!q) fail(ERROR_CODES.QUEUE_NOT_FOUND, 'Farmer is not in the queue.');
      if (q.state !== 'CALLED') fail(ERROR_CODES.INVALID_QUEUE_STATE, 'Farmer has not been called yet.');

      q.state = 'IN_SERVICE';
      booking.status = 'IN_SERVICE';

      // Create procurement + payment shell rows on first service (see plan).
      if (!procurementForBooking(bookingId)) {
        const proc: ProcurementRow = {
          id: uuid(),
          booking_id: bookingId,
          centre_id: centreId,
          commodity_code: booking.commodity_code,
          status: 'NOT_STARTED',
          quality_status: null,
          quantity_qtl: null,
          rate_per_qtl: null,
          amount: null,
          receipt_reference: null,
          events: []
        };
        db.procurements.push(proc);
        db.payments.push({
          procurement_id: proc.id,
          amount: null,
          status: 'NOT_STARTED',
          reference: null,
          updated_at: nowIso()
        });
      }
      persist();
      return { booking_id: bookingId, state: 'IN_SERVICE' };
    },

    async completeService(bookingId: string): Promise<CompleteServiceResponse> {
      const { centreId } = requireOperator();
      const booking = db.bookings.find((x) => x.id === bookingId);
      if (!booking) fail(ERROR_CODES.BOOKING_NOT_FOUND, 'Booking not found.');
      if (booking.centre_id !== centreId) fail(ERROR_CODES.OPERATOR_CENTRE_FORBIDDEN, 'Not your centre.');
      const q = db.queue.find((x) => x.booking_id === bookingId);
      if (!q) fail(ERROR_CODES.QUEUE_NOT_FOUND, 'Farmer is not in the queue.');
      if (q.state !== 'IN_SERVICE') fail(ERROR_CODES.INVALID_QUEUE_STATE, 'Service has not started.');

      const proc = procurementForBooking(bookingId);
      const done = proc && (proc.status === 'RECEIPT_GENERATED' || proc.status === 'QUALITY_REJECTED');
      if (!done) {
        fail(ERROR_CODES.PROCUREMENT_NOT_COMPLETE, 'Finish procurement before completing service.');
      }
      q.state = 'COMPLETED';
      booking.status = 'COMPLETED';
      persist();
      return { booking_id: bookingId, state: 'COMPLETED' };
    },

    /* ---- procurement ---- */
    async getProcurement(procurementId: string): Promise<Procurement> {
      const u = currentUser();
      const proc = db.procurements.find((p) => p.id === procurementId);
      if (!proc) fail(ERROR_CODES.PROCUREMENT_NOT_FOUND, 'Procurement not found.');
      if (u.role === 'FARMER') {
        const booking = db.bookings.find((b) => b.id === proc.booking_id);
        if (!booking || booking.farmer_id !== u.id) {
          fail(ERROR_CODES.PROCUREMENT_FORBIDDEN, 'Not your procurement.');
        }
      } else {
        const link = db.operatorCentres.find((l) => l.user_id === u.id);
        if (!link || link.centre_id !== proc.centre_id) {
          fail(ERROR_CODES.PROCUREMENT_FORBIDDEN, 'Procurement is at another centre.');
        }
      }
      return toProcurementEntity(proc);
    },

    async appendProcurementEvent(
      procurementId: string,
      body: CreateProcurementEventBody
    ): Promise<ProcurementEventResponse> {
      const { centreId } = requireOperator();
      const proc = db.procurements.find((p) => p.id === procurementId);
      if (!proc) fail(ERROR_CODES.PROCUREMENT_NOT_FOUND, 'Procurement not found.');
      if (proc.centre_id !== centreId) {
        fail(ERROR_CODES.PROCUREMENT_FORBIDDEN, 'Procurement is at another centre.');
      }

      const type = body.type;
      const invalid = () =>
        fail(ERROR_CODES.INVALID_PROCUREMENT_TRANSITION, `Cannot apply ${type} from ${proc.status}.`);

      switch (type) {
        case 'QUALITY_STARTED':
          if (proc.status !== 'NOT_STARTED') invalid();
          proc.status = 'QUALITY_IN_PROGRESS';
          proc.quality_status = 'PENDING';
          break;
        case 'QUALITY_ACCEPTED':
          if (proc.status !== 'QUALITY_IN_PROGRESS') invalid();
          proc.status = 'QUALITY_ACCEPTED';
          proc.quality_status = 'ACCEPTED';
          break;
        case 'QUALITY_REJECTED':
          if (proc.status !== 'QUALITY_IN_PROGRESS') invalid();
          if (!body.reason_code) {
            fail(ERROR_CODES.REJECTION_REASON_REQUIRED, 'A reason is required to reject quality.');
          }
          proc.status = 'QUALITY_REJECTED';
          proc.quality_status = 'REJECTED';
          break;
        case 'WEIGHMENT_RECORDED': {
          if (proc.status !== 'QUALITY_ACCEPTED') invalid();
          if (!body.quantity_qtl || Number(body.quantity_qtl) <= 0) {
            fail(ERROR_CODES.INVALID_QUANTITY, 'Enter a weighed quantity greater than zero.');
          }
          proc.status = 'WEIGHMENT_RECORDED';
          proc.quantity_qtl = body.quantity_qtl;
          break;
        }
        case 'PROCUREMENT_ACCEPTED': {
          if (proc.status !== 'WEIGHMENT_RECORDED') invalid();
          const rate = db.rates.find((r) => r.commodity_code === proc.commodity_code && r.active);
          if (!rate) fail(ERROR_CODES.INTERNAL_ERROR, 'No active rate configured for this commodity.');
          proc.status = 'PROCUREMENT_ACCEPTED';
          proc.rate_per_qtl = rate.rate_per_qtl;
          proc.amount = mulMoney(proc.quantity_qtl!, rate.rate_per_qtl);
          const pay = db.payments.find((p) => p.procurement_id === proc.id);
          if (pay) {
            pay.amount = proc.amount;
            pay.updated_at = nowIso();
          }
          break;
        }
        case 'RECEIPT_GENERATED':
          if (proc.status !== 'PROCUREMENT_ACCEPTED') invalid();
          proc.status = 'RECEIPT_GENERATED';
          proc.receipt_reference = makeReceiptRef(db);
          break;
        default:
          invalid();
      }

      proc.events.push({ type, created_at: nowIso() });
      persist();
      return {
        procurement_id: proc.id,
        status: proc.status,
        quality_status: proc.quality_status,
        quantity_qtl: proc.quantity_qtl,
        rate_per_qtl: proc.rate_per_qtl,
        amount: proc.amount,
        receipt_reference: proc.receipt_reference
      };
    },

    /* ---- payment ---- */
    async getPayment(procurementId: string): Promise<Payment> {
      const u = currentUser();
      const proc = db.procurements.find((p) => p.id === procurementId);
      if (!proc) fail(ERROR_CODES.PROCUREMENT_NOT_FOUND, 'Procurement not found.');
      if (u.role === 'FARMER') {
        const booking = db.bookings.find((b) => b.id === proc.booking_id);
        if (!booking || booking.farmer_id !== u.id) {
          fail(ERROR_CODES.PAYMENT_FORBIDDEN, 'Not your payment.');
        }
      }
      const pay = db.payments.find((p) => p.procurement_id === procurementId);
      if (!pay) fail(ERROR_CODES.PAYMENT_NOT_FOUND, 'No payment yet.');
      return toPaymentEntity(pay);
    },

    async setPaymentStatus(procurementId: string, body: SetPaymentStatusBody): Promise<Payment> {
      const { centreId } = requireOperator();
      const proc = db.procurements.find((p) => p.id === procurementId);
      if (!proc) fail(ERROR_CODES.PROCUREMENT_NOT_FOUND, 'Procurement not found.');
      if (proc.centre_id !== centreId) fail(ERROR_CODES.PAYMENT_FORBIDDEN, 'Payment is at another centre.');
      const pay = db.payments.find((p) => p.procurement_id === procurementId);
      if (!pay) fail(ERROR_CODES.PAYMENT_NOT_FOUND, 'No payment for this procurement.');

      const allowed: Record<PaymentStatus, PaymentStatus[]> = {
        NOT_STARTED: ['INITIATED'],
        INITIATED: ['PROCESSING', 'FAILED'],
        PROCESSING: ['CREDITED', 'FAILED'],
        CREDITED: [],
        FAILED: []
      };
      const target = body.status;
      if (pay.status === 'NOT_STARTED' && target === 'INITIATED') {
        if (proc.status !== 'PROCUREMENT_ACCEPTED' && proc.status !== 'RECEIPT_GENERATED') {
          fail(ERROR_CODES.PROCUREMENT_NOT_COMPLETE, 'Accept procurement before starting payment.');
        }
      }
      if (!allowed[pay.status].includes(target)) {
        fail(ERROR_CODES.INVALID_PAYMENT_TRANSITION, `Cannot move payment ${pay.status} → ${target}.`);
      }
      pay.status = target;
      if (body.reference != null) pay.reference = body.reference;
      pay.updated_at = nowIso();
      persist();
      return toPaymentEntity(pay);
    },

    /* ---- operator dashboard / slots ---- */
    async getOperatorDashboard(): Promise<OperatorDashboardResponse> {
      const { centreId } = requireOperator();
      const centre = centreById(centreId);
      const today = todayIso();
      const todays = db.bookings.filter(
        (b) => b.centre_id === centreId && b.slot_date === today && b.status !== 'CANCELLED'
      );
      const queueFor = (b: BookingRow) => db.queue.find((q) => q.booking_id === b.id);
      const checkedIn = todays.filter((b) => queueFor(b)).length;
      const waiting = todays.filter((b) => queueFor(b)?.state === 'WAITING').length;
      const inService = todays.filter((b) => queueFor(b)?.state === 'IN_SERVICE').length;
      const completed = todays.filter((b) => b.status === 'COMPLETED').length;
      return {
        centre: { id: centre.id, name: centre.name },
        today: {
          bookings: todays.length,
          checked_in: checkedIn,
          waiting,
          in_service: inService,
          completed
        }
      };
    },

    async getOperatorSlots(query: OperatorSlotsQuery): Promise<OperatorSlotsResponse> {
      const { centreId } = requireOperator();
      const slots = db.slots
        .filter((s) => s.centre_id === centreId && s.date === query.date)
        .sort((a, b) => a.start.localeCompare(b.start))
        .map(
          (s): OperatorSlot => ({
            id: s.id,
            date: s.date,
            start: s.start,
            end: s.end,
            capacity: s.capacity,
            booked_count: s.booked_count,
            active: s.active
          })
        );
      return { slots };
    },

    async createSlot(body: CreateSlotBody): Promise<OperatorSlot> {
      const { centreId } = requireOperator();
      if (body.start >= body.end) fail(ERROR_CODES.INVALID_SLOT_RANGE, 'Start must be before end.');
      if (body.capacity <= 0) fail(ERROR_CODES.INVALID_CAPACITY, 'Capacity must be positive.');
      const overlaps = db.slots.some(
        (s) =>
          s.centre_id === centreId &&
          s.date === body.date &&
          s.active &&
          body.start < s.end &&
          s.start < body.end
      );
      if (overlaps) fail(ERROR_CODES.SLOT_OVERLAP, 'This overlaps an existing slot.');
      const slot: SlotRow = {
        id: uuid(),
        centre_id: centreId,
        date: body.date,
        start: body.start,
        end: body.end,
        capacity: body.capacity,
        booked_count: 0,
        active: true
      };
      db.slots.push(slot);
      persist();
      return {
        id: slot.id,
        date: slot.date,
        start: slot.start,
        end: slot.end,
        capacity: slot.capacity,
        booked_count: slot.booked_count,
        active: slot.active
      };
    },

    async patchSlot(slotId: string, body: PatchSlotBody): Promise<OperatorSlot> {
      const { centreId } = requireOperator();
      const slot = db.slots.find((s) => s.id === slotId);
      if (!slot) fail(ERROR_CODES.SLOT_NOT_FOUND, 'Slot not found.');
      if (slot.centre_id !== centreId) fail(ERROR_CODES.OPERATOR_CENTRE_FORBIDDEN, 'Not your centre.');
      if (body.capacity !== undefined) {
        if (body.capacity <= 0) fail(ERROR_CODES.INVALID_CAPACITY, 'Capacity must be positive.');
        if (body.capacity < slot.booked_count) {
          fail(ERROR_CODES.CAPACITY_BELOW_BOOKED_COUNT, 'Capacity is below the booked count.');
        }
        slot.capacity = body.capacity;
      }
      if (body.active !== undefined) slot.active = body.active;
      persist();
      return {
        id: slot.id,
        date: slot.date,
        start: slot.start,
        end: slot.end,
        capacity: slot.capacity,
        booked_count: slot.booked_count,
        active: slot.active
      };
    },

    /* ---- operator queue listing (mock-only) ---- */
    async listCentreBookings(centreId: string, date: string): Promise<CentreBookingsResponse> {
      const op = requireOperator();
      if (op.centreId !== centreId) fail(ERROR_CODES.OPERATOR_CENTRE_FORBIDDEN, 'Not your centre.');
      const centre = centreById(centreId);
      const rows: CentreBookingRow[] = db.bookings
        .filter((b) => b.centre_id === centreId && b.slot_date === date && b.status !== 'CANCELLED')
        .sort((a, b) => a.slot_start.localeCompare(b.slot_start) || a.created_at.localeCompare(b.created_at))
        .map((b) => {
          const farmer = db.farmers.find((f) => f.id === b.farmer_id);
          const q = db.queue.find((x) => x.booking_id === b.id);
          const proc = procurementForBooking(b.id);
          const position = q && q.state !== 'COMPLETED' ? queuePosition(q).position : null;
          return {
            booking_id: b.id,
            reference: b.reference,
            farmer_name: farmer?.full_name ?? 'Farmer',
            commodity_code: b.commodity_code,
            expected_quantity_qtl: b.expected_quantity_qtl,
            slot_start: b.slot_start,
            slot_end: b.slot_end,
            booking_status: b.status,
            queue_state: q?.state ?? null,
            position,
            procurement_id: proc?.id ?? null,
            procurement_status: proc?.status ?? null
          };
        });
      return { centre_id: centreId, centre_name: centre.name, date, bookings: rows };
    }
  };
}
