/**
 * @cropsaathi/contracts — routes.ts
 *
 * Every HTTP path for the v1 API, as constants and builders. Both the Hono
 * backend and the frontend adapters import from here so a renamed route breaks
 * the build instead of silently 404-ing.
 *
 * Values are RELATIVE to API_PREFIX. Compose a full path with `apiPath(...)`.
 */

/** Mounted prefix for every route in this contract (`/api/v1`). */
export const API_PREFIX = '/api/v1';

/** Contract identifier for this phase. */
export const CONTRACT_VERSION = 'v1.phase1';

export const ROUTES = {
  // A. Authentication
  authOtpRequest: '/auth/otp/request',
  authOtpVerify: '/auth/otp/verify',
  authLogout: '/auth/logout',

  // B. Profile / registration
  me: '/me',
  farmersMe: '/farmers/me',

  // C. Farmer dashboard
  farmerDashboard: '/farmer/dashboard',

  // D. Centres / slots
  centres: '/centres',
  centreSlots: (centreId: string) => `/centres/${centreId}/slots`,

  // E. Booking
  bookings: '/bookings',
  booking: (bookingId: string) => `/bookings/${bookingId}`,

  // F. Queue
  queue: (bookingId: string) => `/queue/${bookingId}`,
  operatorCheckIn: (bookingId: string) => `/operator/bookings/${bookingId}/check-in`,
  operatorCallNext: (centreId: string) => `/operator/queue/${centreId}/call-next`,
  operatorStartService: (bookingId: string) => `/operator/queue/${bookingId}/start-service`,
  operatorCompleteService: (bookingId: string) =>
    `/operator/queue/${bookingId}/complete-service`,

  // G. Procurement
  procurement: (procurementId: string) => `/procurements/${procurementId}`,
  operatorProcurementEvents: (procurementId: string) =>
    `/operator/procurements/${procurementId}/events`,

  // H. Payment
  payment: (procurementId: string) => `/payments/${procurementId}`,
  operatorPaymentStatus: (procurementId: string) =>
    `/operator/payments/${procurementId}/status`,

  // I. Operator dashboard / slot management
  operatorDashboard: '/operator/dashboard',
  operatorSlots: '/operator/slots',
  operatorSlot: (slotId: string) => `/operator/slots/${slotId}`
} as const;

/** Join the API prefix with a relative route path. */
export function apiPath(route: string): string {
  return `${API_PREFIX}${route}`;
}
