/**
 * The single typed gateway between the UI and "the backend". Every screen talks
 * to this interface and nothing else. Two implementations exist:
 *
 *   - mock:  an in-memory SIH backend (adapters/mock.ts) — the default, so the
 *            app runs with zero credentials.
 *   - live:  fetch → the Hono API on Supabase Edge Functions (adapters/live.ts).
 *
 * Both are typed from `@cropsaathi/contracts`, so a mock response and a live
 * response can never disagree on shape.
 *
 * ── Operator queue listing ──────────────────────────────────────────────
 * `listCentreBookings` is the one method NOT backed by a frozen Phase-1 route.
 * The contract (§2) gives operators counts + call-next + per-id actions but no
 * "list this centre's bookings" endpoint, which an operator queue screen needs.
 * The mock implements it fully; the live adapter throws NOT_AVAILABLE_LIVE with a
 * clear message (see SETUP.md → "Operator queue endpoint"). The farmer flow and
 * all core operator actions work identically in both modes.
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
  Procurement,
  ProcurementEventResponse,
  ProcurementStatus,
  QueueState,
  QueueStatusResponse,
  SetPaymentStatusBody,
  SlotsQuery,
  SlotsResponse,
  StartServiceResponse,
  UpdateFarmerBody,
  UpdateFarmerResponse
} from '@cropsaathi/contracts';

export { ApiClientError, isApiClientError } from './errors';

/** One row in the operator's centre queue view (see note above). */
export interface CentreBookingRow {
  booking_id: string;
  reference: string;
  farmer_name: string;
  commodity_code: string;
  expected_quantity_qtl: string;
  slot_start: string;
  slot_end: string;
  booking_status: BookingStatus;
  queue_state: QueueState | null;
  position: number | null;
  procurement_id: string | null;
  procurement_status: ProcurementStatus | null;
}

export interface CentreBookingsResponse {
  centre_id: string;
  centre_name: string;
  date: string;
  bookings: CentreBookingRow[];
}

export interface ApiClient {
  /** Attach/clear the bearer token used for authenticated calls. */
  setToken(token: string | null): void;
  getToken(): string | null;

  // A. Authentication
  requestOtp(body: OtpRequestBody): Promise<OtpRequestResponse>;
  verifyOtp(body: OtpVerifyBody): Promise<OtpVerifyResponse>;
  registerOperator?(body: {
    mobile: string;
    fullName: string;
    centreId?: string;
    badgeId?: string;
    department?: string;
  }): Promise<OtpVerifyResponse>;
  logout(): Promise<void>;

  // B. Profile / registration
  getMe(): Promise<MeResponse>;
  updateFarmer(body: UpdateFarmerBody): Promise<UpdateFarmerResponse>;

  // C. Farmer dashboard
  getFarmerDashboard(): Promise<FarmerDashboardResponse>;

  // D. Centres / slots
  getCentres(query: CentresQuery): Promise<CentresResponse>;
  getSlots(centreId: string, query: SlotsQuery): Promise<SlotsResponse>;

  // E. Booking
  createBooking(body: CreateBookingBody): Promise<Booking>;
  getBooking(bookingId: string): Promise<Booking>;

  // F. Queue
  getQueue(bookingId: string): Promise<QueueStatusResponse>;
  checkIn(bookingId: string): Promise<CheckInResponse>;
  callNext(centreId: string): Promise<CallNextResponse>;
  startService(bookingId: string): Promise<StartServiceResponse>;
  completeService(bookingId: string): Promise<CompleteServiceResponse>;

  // G. Procurement
  getProcurement(procurementId: string): Promise<Procurement>;
  appendProcurementEvent(
    procurementId: string,
    body: CreateProcurementEventBody
  ): Promise<ProcurementEventResponse>;

  // H. Payment
  getPayment(procurementId: string): Promise<Payment>;
  setPaymentStatus(procurementId: string, body: SetPaymentStatusBody): Promise<Payment>;

  // I. Operator dashboard / slot management
  getOperatorDashboard(): Promise<OperatorDashboardResponse>;
  getOperatorSlots(query: OperatorSlotsQuery): Promise<OperatorSlotsResponse>;
  createSlot(body: CreateSlotBody): Promise<OperatorSlot>;
  patchSlot(slotId: string, body: PatchSlotBody): Promise<OperatorSlot>;

  // Operator queue listing (mock-only; see note above)
  listCentreBookings(centreId: string, date: string): Promise<CentreBookingsResponse>;
}
