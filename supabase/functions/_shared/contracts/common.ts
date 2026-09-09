// ============================================================================
// GENERATED FILE — DO NOT EDIT.
// Synced from packages/contracts/src by `pnpm contracts:sync`.
// Edit the contract SOURCE and re-run the sync; hand edits here will be lost.
// ============================================================================

/**
 * @cropsaathi/contracts — common.ts
 *
 * Shared primitives, enums, and the universal error shape used across every
 * phase. This file is the vocabulary that phase1/phase2/phase3 schemas build on.
 *
 * Money and quantities are represented as decimal STRINGS end-to-end because the
 * database stores them as NUMERIC. Never turn them into JS floats.
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ *
 * Universal error envelope (§2 of the spec)
 * Every 4xx/5xx application error uses exactly this shape.
 * ------------------------------------------------------------------ */
export const ApiErrorSchema = z.object({
  error: z.literal(true),
  code: z.string(),
  message: z.string()
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Canonical error codes. Keeping them in one object lets the API and the
 * frontend refer to the same constants instead of stringly-typed literals.
 */
export const ERROR_CODES = {
  // auth
  INVALID_MOBILE: 'INVALID_MOBILE',
  OTP_RATE_LIMITED: 'OTP_RATE_LIMITED',
  OTP_PROVIDER_UNAVAILABLE: 'OTP_PROVIDER_UNAVAILABLE',
  INVALID_OTP: 'INVALID_OTP',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_ATTEMPTS_EXCEEDED: 'OTP_ATTEMPTS_EXCEEDED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  // profile
  PRIVACY_ACK_REQUIRED: 'PRIVACY_ACK_REQUIRED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  // roles / ownership
  FARMER_ONLY: 'FARMER_ONLY',
  OPERATOR_ONLY: 'OPERATOR_ONLY',
  OPERATOR_CENTRE_FORBIDDEN: 'OPERATOR_CENTRE_FORBIDDEN',
  BOOKING_FORBIDDEN: 'BOOKING_FORBIDDEN',
  QUEUE_FORBIDDEN: 'QUEUE_FORBIDDEN',
  PROCUREMENT_FORBIDDEN: 'PROCUREMENT_FORBIDDEN',
  PAYMENT_FORBIDDEN: 'PAYMENT_FORBIDDEN',
  // not found
  CENTRE_NOT_FOUND: 'CENTRE_NOT_FOUND',
  SLOT_NOT_FOUND: 'SLOT_NOT_FOUND',
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
  QUEUE_NOT_FOUND: 'QUEUE_NOT_FOUND',
  PROCUREMENT_NOT_FOUND: 'PROCUREMENT_NOT_FOUND',
  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  // validation / business
  INVALID_DATE: 'INVALID_DATE',
  INVALID_QUANTITY: 'INVALID_QUANTITY',
  INVALID_SLOT_RANGE: 'INVALID_SLOT_RANGE',
  INVALID_CAPACITY: 'INVALID_CAPACITY',
  CAPACITY_BELOW_BOOKED_COUNT: 'CAPACITY_BELOW_BOOKED_COUNT',
  REJECTION_REASON_REQUIRED: 'REJECTION_REASON_REQUIRED',
  // workflow / capacity conflicts (409)
  SLOT_FULL: 'SLOT_FULL',
  DUPLICATE_ACTIVE_BOOKING: 'DUPLICATE_ACTIVE_BOOKING',
  SLOT_OVERLAP: 'SLOT_OVERLAP',
  SLOT_UPDATE_CONFLICT: 'SLOT_UPDATE_CONFLICT',
  INVALID_BOOKING_STATE: 'INVALID_BOOKING_STATE',
  NO_WAITING_FARMERS: 'NO_WAITING_FARMERS',
  INVALID_QUEUE_STATE: 'INVALID_QUEUE_STATE',
  PROCUREMENT_NOT_COMPLETE: 'PROCUREMENT_NOT_COMPLETE',
  INVALID_PROCUREMENT_TRANSITION: 'INVALID_PROCUREMENT_TRANSITION',
  INVALID_PAYMENT_TRANSITION: 'INVALID_PAYMENT_TRANSITION',
  // generic
  INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */
export const RoleSchema = z.enum(['FARMER', 'OPERATOR']);
export type Role = z.infer<typeof RoleSchema>;

export const BookingStatusSchema = z.enum([
  'BOOKED',
  'CHECKED_IN',
  'IN_QUEUE',
  'IN_SERVICE',
  'COMPLETED',
  'CANCELLED'
]);
export type BookingStatus = z.infer<typeof BookingStatusSchema>;

export const QueueStateSchema = z.enum(['WAITING', 'CALLED', 'IN_SERVICE', 'COMPLETED']);
export type QueueState = z.infer<typeof QueueStateSchema>;

/**
 * Procurement status is the coarse workflow position; it advances one step per
 * appended event. `QUALITY_IN_PROGRESS` is the status produced by the
 * `QUALITY_STARTED` event (see ProcurementEventType).
 */
export const ProcurementStatusSchema = z.enum([
  'NOT_STARTED',
  'QUALITY_IN_PROGRESS',
  'QUALITY_ACCEPTED',
  'QUALITY_REJECTED',
  'WEIGHMENT_RECORDED',
  'PROCUREMENT_ACCEPTED',
  'RECEIPT_GENERATED'
]);
export type ProcurementStatus = z.infer<typeof ProcurementStatusSchema>;

export const QualityStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'REJECTED']);
export type QualityStatus = z.infer<typeof QualityStatusSchema>;

export const PaymentStatusSchema = z.enum([
  'NOT_STARTED',
  'INITIATED',
  'PROCESSING',
  'CREDITED',
  'FAILED'
]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

/** Event types accepted by POST /operator/procurements/{id}/events (§2.G). */
export const ProcurementEventTypeSchema = z.enum([
  'QUALITY_STARTED',
  'QUALITY_ACCEPTED',
  'QUALITY_REJECTED',
  'WEIGHMENT_RECORDED',
  'PROCUREMENT_ACCEPTED',
  'RECEIPT_GENERATED'
]);
export type ProcurementEventType = z.infer<typeof ProcurementEventTypeSchema>;

export const CentreAvailabilitySchema = z.enum(['AVAILABLE', 'FULL']);
export type CentreAvailability = z.infer<typeof CentreAvailabilitySchema>;

/* ------------------------------------------------------------------ *
 * Primitive value types
 * ------------------------------------------------------------------ */

/** E.164 phone number, e.g. +919876543210. */
export const MobileE164 = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, 'mobile must be E.164, e.g. +919876543210');

/** Numeric OTP code (4–8 digits). */
export const OtpCode = z.string().regex(/^\d{4,8}$/, 'otp must be 4–8 digits');

/** Calendar date, YYYY-MM-DD. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

/** Wall-clock time of day, HH:MM (24h). */
export const HhMm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:MM');

/**
 * A decimal number carried as a STRING to preserve DB NUMERIC precision.
 * e.g. "18.40", "2441.00", "44914.40".
 */
export const NumericString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'must be a decimal string, e.g. "18.40"');

/** A strictly-positive decimal string (quantities, rates, amounts). */
export const PositiveNumericString = NumericString.refine(
  (v) => Number(v) > 0,
  'must be greater than 0'
);

export const Uuid = z.string().uuid();

/** ISO-8601 timestamp with timezone offset, e.g. 2026-09-10T10:14:00+05:30. */
export const IsoDateTime = z.string().min(1);

/** Commodity code, e.g. PADDY_COMMON. Free-form now; catalogued in a later phase. */
export const CommodityCode = z.string().min(1).max(64);

/** BCP-47-ish short language tag, e.g. "hi", "en", "gu". */
export const LanguageTag = z.string().min(2).max(8);

/** Indian state code, e.g. "GJ". */
export const StateCode = z.string().min(1).max(8);
