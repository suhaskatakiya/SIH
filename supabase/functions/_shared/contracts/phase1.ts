// ============================================================================
// GENERATED FILE — DO NOT EDIT.
// Synced from packages/contracts/src by `pnpm contracts:sync`.
// Edit the contract SOURCE and re-run the sync; hand edits here will be lost.
// ============================================================================

/**
 * @cropsaathi/contracts — phase1.ts
 *
 * Zod request/response schemas for contract `v1.phase1`. These mirror §2 of the
 * spec exactly. The backend validates every request against the *Body/*Query
 * schemas and every response against the *Response/entity schemas; the frontend
 * derives its types from the same objects, so a shape can never drift.
 */
import { z } from 'zod';
import {
  BookingStatusSchema,
  CentreAvailabilitySchema,
  CommodityCode,
  HhMm,
  IsoDate,
  IsoDateTime,
  LanguageTag,
  MobileE164,
  NumericString,
  OtpCode,
  Password,
  PaymentStatusSchema,
  PositiveNumericString,
  ProcurementEventTypeSchema,
  ProcurementStatusSchema,
  QualityStatusSchema,
  QueueStateSchema,
  RoleSchema,
  StateCode,
  Uuid
} from './common.ts';

/* ================================================================== *
 * A. Authentication
 * ================================================================== */

export const OtpRequestBody = z.object({
  mobile: MobileE164
});
export type OtpRequestBody = z.infer<typeof OtpRequestBody>;

export const OtpRequestResponse = z.object({
  mobile_masked: z.string(),
  expires_in_seconds: z.number().int().positive()
});
export type OtpRequestResponse = z.infer<typeof OtpRequestResponse>;

export const OtpVerifyBody = z.object({
  mobile: MobileE164,
  otp: OtpCode
});
export type OtpVerifyBody = z.infer<typeof OtpVerifyBody>;

export const PasswordLoginBody = z.object({
  mobile: MobileE164,
  password: Password
});
export type PasswordLoginBody = z.infer<typeof PasswordLoginBody>;

export const FarmerRegisterBody = z.object({
  mobile: MobileE164,
  password: Password,
  full_name: z.string().min(1).max(120),
  state_code: StateCode,
  district: z.string().min(1).max(120),
  village: z.string().min(1).max(120),
  external_farmer_ref: z.string().max(120).nullable().optional().default(null),
  preferred_language: LanguageTag.optional().default('hi'),
  privacy_acknowledged: z.boolean()
});
export type FarmerRegisterBody = z.infer<typeof FarmerRegisterBody>;

export const OperatorRegisterBody = z.object({
  mobile: MobileE164,
  password: Password,
  fullName: z.string().min(1).max(120),
  centreId: z.string().optional(),
  badgeId: z.string().optional(),
  department: z.string().optional()
});
export type OperatorRegisterBody = z.infer<typeof OperatorRegisterBody>;

export const SessionUser = z.object({
  id: Uuid,
  role: RoleSchema,
  profile_complete: z.boolean()
});
export type SessionUser = z.infer<typeof SessionUser>;

export const OtpVerifyResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in_seconds: z.number().int().positive(),
  user: SessionUser
});
export type OtpVerifyResponse = z.infer<typeof OtpVerifyResponse>;
export type AuthResponse = OtpVerifyResponse;


/* ================================================================== *
 * B. Profile / registration
 * ================================================================== */

export const FarmerProfile = z.object({
  id: Uuid,
  full_name: z.string(),
  state_code: StateCode,
  district: z.string(),
  village: z.string(),
  external_farmer_ref: z.string().nullable(),
  preferred_language: LanguageTag
});
export type FarmerProfile = z.infer<typeof FarmerProfile>;

export const MeResponse = z.object({
  id: Uuid,
  role: RoleSchema,
  mobile_masked: z.string(),
  profile_complete: z.boolean(),
  farmer: FarmerProfile.nullable()
});
export type MeResponse = z.infer<typeof MeResponse>;

export const UpdateFarmerBody = z.object({
  full_name: z.string().min(1).max(120),
  state_code: StateCode,
  district: z.string().min(1).max(120),
  village: z.string().min(1).max(120),
  external_farmer_ref: z.string().max(120).nullable().optional().default(null),
  preferred_language: LanguageTag,
  privacy_acknowledged: z.boolean()
});
export type UpdateFarmerBody = z.infer<typeof UpdateFarmerBody>;

export const UpdateFarmerResponse = z.object({
  farmer_id: Uuid,
  profile_complete: z.boolean()
});
export type UpdateFarmerResponse = z.infer<typeof UpdateFarmerResponse>;

/* ================================================================== *
 * C. Farmer dashboard
 * ================================================================== */

export const DashboardBooking = z.object({
  id: Uuid,
  reference: z.string(),
  centre_name: z.string(),
  commodity_code: CommodityCode,
  expected_quantity_qtl: NumericString,
  slot_date: IsoDate,
  slot_start: HhMm,
  slot_end: HhMm,
  status: BookingStatusSchema
});
export type DashboardBooking = z.infer<typeof DashboardBooking>;

export const DashboardQueue = z.object({
  booking_id: Uuid,
  state: QueueStateSchema,
  position: z.number().int().nonnegative(),
  farmers_ahead: z.number().int().nonnegative(),
  estimated_wait_min: z.number().int().nonnegative(),
  updated_at: IsoDateTime
});
export type DashboardQueue = z.infer<typeof DashboardQueue>;

export const DashboardProcurement = z.object({
  id: Uuid,
  booking_id: Uuid,
  status: ProcurementStatusSchema,
  quality_status: QualityStatusSchema.nullable(),
  amount: NumericString.nullable(),
  receipt_reference: z.string().nullable()
});
export type DashboardProcurement = z.infer<typeof DashboardProcurement>;

export const DashboardPayment = z.object({
  procurement_id: Uuid,
  amount: NumericString.nullable(),
  status: PaymentStatusSchema,
  reference: z.string().nullable(),
  updated_at: IsoDateTime
});
export type DashboardPayment = z.infer<typeof DashboardPayment>;

export const FarmerDashboardResponse = z.object({
  upcoming_booking: DashboardBooking.nullable(),
  upcoming_bookings: z.array(DashboardBooking).optional(),
  active_queue: DashboardQueue.nullable(),
  procurement: DashboardProcurement.nullable(),
  payment: DashboardPayment.nullable()
});
export type FarmerDashboardResponse = z.infer<typeof FarmerDashboardResponse>;

/* ================================================================== *
 * D. Centres / slots
 * ================================================================== */

export const CentresQuery = z.object({
  commodity_code: CommodityCode,
  date: IsoDate
});
export type CentresQuery = z.infer<typeof CentresQuery>;

export const CentreListItem = z.object({
  id: Uuid,
  name: z.string(),
  state_code: StateCode,
  district: z.string(),
  availability: CentreAvailabilitySchema
});
export type CentreListItem = z.infer<typeof CentreListItem>;

export const CentresResponse = z.object({
  centres: z.array(CentreListItem)
});
export type CentresResponse = z.infer<typeof CentresResponse>;

export const SlotsQuery = z.object({
  date: IsoDate
});
export type SlotsQuery = z.infer<typeof SlotsQuery>;

export const SlotListItem = z.object({
  id: Uuid,
  start: HhMm,
  end: HhMm,
  capacity: z.number().int().positive(),
  remaining: z.number().int().nonnegative()
});
export type SlotListItem = z.infer<typeof SlotListItem>;

export const SlotsResponse = z.object({
  slots: z.array(SlotListItem)
});
export type SlotsResponse = z.infer<typeof SlotsResponse>;

/* ================================================================== *
 * E. Booking
 * ================================================================== */

export const CreateBookingBody = z.object({
  slot_id: Uuid,
  commodity_code: CommodityCode,
  expected_quantity_qtl: PositiveNumericString
});
export type CreateBookingBody = z.infer<typeof CreateBookingBody>;

/** Shared booking entity — identical for POST /bookings (201) and GET /bookings/{id}. */
export const Booking = z.object({
  id: Uuid,
  reference: z.string(),
  status: BookingStatusSchema,
  centre_id: Uuid,
  centre_name: z.string(),
  slot_date: IsoDate,
  slot_start: HhMm,
  slot_end: HhMm,
  commodity_code: CommodityCode,
  expected_quantity_qtl: NumericString
});
export type Booking = z.infer<typeof Booking>;

/* ================================================================== *
 * F. Queue
 * ================================================================== */

export const QueueStatusResponse = z.object({
  booking_id: Uuid,
  state: QueueStateSchema,
  position: z.number().int().nonnegative(),
  farmers_ahead: z.number().int().nonnegative(),
  estimated_wait_min: z.number().int().nonnegative(),
  updated_at: IsoDateTime
});
export type QueueStatusResponse = z.infer<typeof QueueStatusResponse>;

export const CheckInResponse = z.object({
  queue_entry_id: Uuid,
  booking_id: Uuid,
  state: QueueStateSchema,
  position: z.number().int().nonnegative()
});
export type CheckInResponse = z.infer<typeof CheckInResponse>;

export const CallNextResponse = z.object({
  booking_id: Uuid,
  queue_entry_id: Uuid,
  state: QueueStateSchema
});
export type CallNextResponse = z.infer<typeof CallNextResponse>;

export const StartServiceResponse = z.object({
  booking_id: Uuid,
  state: QueueStateSchema
});
export type StartServiceResponse = z.infer<typeof StartServiceResponse>;

export const CompleteServiceResponse = z.object({
  booking_id: Uuid,
  state: QueueStateSchema
});
export type CompleteServiceResponse = z.infer<typeof CompleteServiceResponse>;

/* ================================================================== *
 * G. Procurement
 * ================================================================== */

export const ProcurementEvent = z.object({
  type: ProcurementEventTypeSchema,
  created_at: IsoDateTime
});
export type ProcurementEvent = z.infer<typeof ProcurementEvent>;

export const Procurement = z.object({
  id: Uuid,
  booking_id: Uuid,
  status: ProcurementStatusSchema,
  quality_status: QualityStatusSchema.nullable(),
  commodity_code: CommodityCode,
  quantity_qtl: NumericString.nullable(),
  rate_per_qtl: NumericString.nullable(),
  amount: NumericString.nullable(),
  receipt_reference: z.string().nullable(),
  events: z.array(ProcurementEvent)
});
export type Procurement = z.infer<typeof Procurement>;

export const CreateProcurementEventBody = z.object({
  type: ProcurementEventTypeSchema,
  quantity_qtl: PositiveNumericString.nullable().optional().default(null),
  reason_code: z.string().max(120).nullable().optional().default(null)
});
export type CreateProcurementEventBody = z.infer<typeof CreateProcurementEventBody>;

export const ProcurementEventResponse = z.object({
  procurement_id: Uuid,
  status: ProcurementStatusSchema,
  quality_status: QualityStatusSchema.nullable(),
  quantity_qtl: NumericString.nullable(),
  rate_per_qtl: NumericString.nullable(),
  amount: NumericString.nullable(),
  receipt_reference: z.string().nullable()
});
export type ProcurementEventResponse = z.infer<typeof ProcurementEventResponse>;

/* ================================================================== *
 * H. Payment
 * ================================================================== */

export const Payment = z.object({
  procurement_id: Uuid,
  amount: NumericString.nullable(),
  status: PaymentStatusSchema,
  reference: z.string().nullable(),
  updated_at: IsoDateTime
});
export type Payment = z.infer<typeof Payment>;

export const SetPaymentStatusBody = z.object({
  status: PaymentStatusSchema,
  reference: z.string().max(120).nullable().optional().default(null)
});
export type SetPaymentStatusBody = z.infer<typeof SetPaymentStatusBody>;

/* ================================================================== *
 * I. Operator dashboard / slot management
 * ================================================================== */

export const OperatorDashboardResponse = z.object({
  centre: z.object({
    id: Uuid,
    name: z.string()
  }),
  today: z.object({
    bookings: z.number().int().nonnegative(),
    checked_in: z.number().int().nonnegative(),
    waiting: z.number().int().nonnegative(),
    in_service: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative()
  })
});
export type OperatorDashboardResponse = z.infer<typeof OperatorDashboardResponse>;

export const OperatorSlot = z.object({
  id: Uuid,
  date: IsoDate,
  start: HhMm,
  end: HhMm,
  capacity: z.number().int().positive(),
  booked_count: z.number().int().nonnegative(),
  active: z.boolean()
});
export type OperatorSlot = z.infer<typeof OperatorSlot>;

export const OperatorSlotsQuery = z.object({
  date: IsoDate
});
export type OperatorSlotsQuery = z.infer<typeof OperatorSlotsQuery>;

export const OperatorSlotsResponse = z.object({
  slots: z.array(OperatorSlot)
});
export type OperatorSlotsResponse = z.infer<typeof OperatorSlotsResponse>;

export const CreateSlotBody = z.object({
  date: IsoDate,
  start: HhMm,
  end: HhMm,
  capacity: z.number().int().positive()
});
export type CreateSlotBody = z.infer<typeof CreateSlotBody>;

export const PatchSlotBody = z
  .object({
    capacity: z.number().int().positive().optional(),
    active: z.boolean().optional()
  })
  .refine((v) => v.capacity !== undefined || v.active !== undefined, {
    message: 'at least one of capacity or active is required'
  });
export type PatchSlotBody = z.infer<typeof PatchSlotBody>;

/* ================================================================== *
 * J. Operator centre queue / bookings listing
 * ================================================================== */

export const CentreBookingRow = z.object({
  booking_id: Uuid,
  reference: z.string(),
  farmer_name: z.string(),
  commodity_code: CommodityCode,
  expected_quantity_qtl: NumericString,
  slot_start: HhMm,
  slot_end: HhMm,
  booking_status: BookingStatusSchema,
  queue_state: QueueStateSchema.nullable(),
  position: z.number().int().nonnegative().nullable(),
  procurement_id: Uuid.nullable(),
  procurement_status: ProcurementStatusSchema.nullable()
});
export type CentreBookingRow = z.infer<typeof CentreBookingRow>;

export const CentreBookingsQuery = z.object({
  date: IsoDate.optional()
});
export type CentreBookingsQuery = z.infer<typeof CentreBookingsQuery>;

export const CentreBookingsResponse = z.object({
  centre_id: Uuid,
  centre_name: z.string(),
  date: IsoDate,
  bookings: z.array(CentreBookingRow)
});
export type CentreBookingsResponse = z.infer<typeof CentreBookingsResponse>;

/* ================================================================== *
 * Empty-body helper for POST endpoints that take no request body.
 * ================================================================== */
export const EmptyBody = z.object({}).strict().optional();
