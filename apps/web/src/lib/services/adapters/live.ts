/**
 * Live adapter — talks to the Hono API on Supabase Edge Functions.
 *
 * Every path comes from `@cropsaathi/contracts` ROUTES (so a renamed route is a
 * compile error, not a 404) and every error is normalized to ApiClientError from
 * the universal `{ error, code, message }` envelope. The bearer token is attached
 * to authenticated calls.
 *
 * Full URL = PUBLIC_API_BASE_URL + apiPath(route)
 *          = https://<ref>.supabase.co/functions/v1 + /api/v1/<route>
 * The Edge Function ("api") normalizes the delivered path back to Hono's
 * `/api/v1` basePath (see supabase/functions/api/index.ts).
 */
import { apiPath, ROUTES } from '@cropsaathi/contracts';
import type {
  Booking,
  CallNextResponse,
  CentresQuery,
  CentresResponse,
  CheckInResponse,
  CompleteServiceResponse,
  CreateBookingBody,
  CreateProcurementEventBody,
  CreateSlotBody,
  FarmerDashboardResponse,
  FarmerRegisterBody,
  MeResponse,
  OperatorDashboardResponse,
  OperatorRegisterBody,
  OperatorSlot,
  OperatorSlotsQuery,
  OperatorSlotsResponse,
  OtpRequestBody,
  OtpRequestResponse,
  OtpVerifyBody,
  OtpVerifyResponse,
  PasswordLoginBody,
  PatchSlotBody,
  Payment,
  Procurement,
  ProcurementEventResponse,
  QueueStatusResponse,
  SetPaymentStatusBody,
  SlotsQuery,
  SlotsResponse,
  StartServiceResponse,
  UpdateFarmerBody,
  UpdateFarmerResponse
} from '@cropsaathi/contracts';
import type { ApiClient, CentreBookingsResponse } from '../api';
import { ApiClientError } from '../errors';

type Query = Record<string, string | number | undefined>;

export function createLiveClient(baseUrl: string): ApiClient {
  const base = baseUrl.replace(/\/+$/, '');
  let token: string | null = null;

  function buildUrl(route: string, query?: Query): string {
    const url = new URL(base + apiPath(route));
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  async function request<T>(
    method: string,
    route: string,
    opts: { body?: unknown; query?: Query; auth?: boolean } = {}
  ): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (opts.auth !== false && token) headers['authorization'] = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetch(buildUrl(route, opts.query), {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
      });
    } catch {
      throw new ApiClientError(
        0,
        'NETWORK_ERROR',
        `Could not reach API server at ${base}. Please make sure 'pnpm api:serve' is running.`
      );
    }

    if (res.status === 204) return undefined as T;

    let payload: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!res.ok) {
      const p = payload as { code?: string; message?: string } | null;
      throw new ApiClientError(
        res.status,
        p?.code ?? 'INTERNAL_ERROR',
        p?.message ?? `Request failed (${res.status}).`
      );
    }
    return payload as T;
  }

  return {
    setToken(t) {
      token = t;
    },
    getToken() {
      return token;
    },

    // A. Authentication
    requestOtp: (body: OtpRequestBody) =>
      request<OtpRequestResponse>('POST', ROUTES.authOtpRequest, { body, auth: false }),
    verifyOtp: (body: OtpVerifyBody) =>
      request<OtpVerifyResponse>('POST', ROUTES.authOtpVerify, { body, auth: false }),
    loginWithPassword: (body: PasswordLoginBody) =>
      request<OtpVerifyResponse>('POST', ROUTES.authPasswordLogin, { body, auth: false }),
    registerFarmer: (body: FarmerRegisterBody) =>
      request<OtpVerifyResponse>('POST', ROUTES.authRegisterFarmer, { body, auth: false }),
    registerOperator: (body: OperatorRegisterBody) =>
      request<OtpVerifyResponse>('POST', ROUTES.authRegisterOperator, { body, auth: false }),
    async logout() {
      try {
        await request<void>('POST', ROUTES.authLogout, { body: {} });
      } catch {
        /* logout is best-effort */
      }
      token = null;
    },

    // B. Profile
    getMe: () => request<MeResponse>('GET', ROUTES.me),
    updateFarmer: (body: UpdateFarmerBody) =>
      request<UpdateFarmerResponse>('PUT', ROUTES.farmersMe, { body }),

    // C. Farmer dashboard
    getFarmerDashboard: () => request<FarmerDashboardResponse>('GET', ROUTES.farmerDashboard),

    // D. Centres / slots
    getCentres: (query: CentresQuery) =>
      request<CentresResponse>('GET', ROUTES.centres, { query }),
    getSlots: (centreId: string, query: SlotsQuery) =>
      request<SlotsResponse>('GET', ROUTES.centreSlots(centreId), { query }),

    // E. Booking
    createBooking: (body: CreateBookingBody) =>
      request<Booking>('POST', ROUTES.bookings, { body }),
    getBooking: (bookingId: string) => request<Booking>('GET', ROUTES.booking(bookingId)),

    // F. Queue
    getQueue: (bookingId: string) => request<QueueStatusResponse>('GET', ROUTES.queue(bookingId)),
    checkIn: (bookingId: string) =>
      request<CheckInResponse>('POST', ROUTES.operatorCheckIn(bookingId), { body: {} }),
    callNext: (centreId: string) =>
      request<CallNextResponse>('POST', ROUTES.operatorCallNext(centreId), { body: {} }),
    startService: (bookingId: string) =>
      request<StartServiceResponse>('POST', ROUTES.operatorStartService(bookingId), { body: {} }),
    completeService: (bookingId: string) =>
      request<CompleteServiceResponse>('POST', ROUTES.operatorCompleteService(bookingId), {
        body: {}
      }),

    // G. Procurement
    getProcurement: (procurementId: string) =>
      request<Procurement>('GET', ROUTES.procurement(procurementId)),
    appendProcurementEvent: (procurementId: string, body: CreateProcurementEventBody) =>
      request<ProcurementEventResponse>('POST', ROUTES.operatorProcurementEvents(procurementId), {
        body
      }),

    // H. Payment
    getPayment: (procurementId: string) => request<Payment>('GET', ROUTES.payment(procurementId)),
    setPaymentStatus: (procurementId: string, body: SetPaymentStatusBody) =>
      request<Payment>('POST', ROUTES.operatorPaymentStatus(procurementId), { body }),

    // I. Operator dashboard / slots
    getOperatorDashboard: () =>
      request<OperatorDashboardResponse>('GET', ROUTES.operatorDashboard),
    getOperatorSlots: (query: OperatorSlotsQuery) =>
      request<OperatorSlotsResponse>('GET', ROUTES.operatorSlots, { query }),
    createSlot: (body: CreateSlotBody) =>
      request<OperatorSlot>('POST', ROUTES.operatorSlots, { body }),
    patchSlot: (slotId: string, body: PatchSlotBody) =>
      request<OperatorSlot>('PATCH', ROUTES.operatorSlot(slotId), { body }),

    // Operator queue listing
    async listCentreBookings(centreId: string, date: string): Promise<CentreBookingsResponse> {
      return request<CentreBookingsResponse>('GET', ROUTES.operatorCentreBookings(centreId), {
        query: { date }
      });
    }
  };
}
