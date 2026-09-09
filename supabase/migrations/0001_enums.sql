-- ============================================================================
-- 0001_enums.sql — extensions + enum types (§4.1)
--
-- Enum labels mirror @cropsaathi/contracts common.ts EXACTLY. A drift here is a
-- contract break, so keep these in lockstep with the Zod enums.
-- ============================================================================

-- gen_random_uuid(), digest(), etc. Supabase ships these in the `extensions` schema.
create extension if not exists pgcrypto with schema extensions;

-- Account role. No self-promotion: new users are always FARMER (§4.1).
create type public.role_enum as enum ('FARMER', 'OPERATOR');

-- Booking lifecycle (§4.1 bookings).
create type public.booking_status as enum (
  'BOOKED',
  'CHECKED_IN',
  'IN_QUEUE',
  'IN_SERVICE',
  'COMPLETED',
  'CANCELLED'
);

-- Queue entry lifecycle (§4.1 queue_entries).
create type public.queue_state as enum (
  'WAITING',
  'CALLED',
  'IN_SERVICE',
  'COMPLETED'
);

-- Coarse procurement workflow position. Advances one step per appended event.
-- QUALITY_IN_PROGRESS is produced by the QUALITY_STARTED event (§4.6).
create type public.procurement_status as enum (
  'NOT_STARTED',
  'QUALITY_IN_PROGRESS',
  'QUALITY_ACCEPTED',
  'QUALITY_REJECTED',
  'WEIGHMENT_RECORDED',
  'PROCUREMENT_ACCEPTED',
  'RECEIPT_GENERATED'
);

create type public.quality_status as enum ('PENDING', 'ACCEPTED', 'REJECTED');

create type public.payment_status as enum (
  'NOT_STARTED',
  'INITIATED',
  'PROCESSING',
  'CREDITED',
  'FAILED'
);

-- Event types accepted by POST /operator/procurements/{id}/events (§2.G).
create type public.procurement_event_type as enum (
  'QUALITY_STARTED',
  'QUALITY_ACCEPTED',
  'QUALITY_REJECTED',
  'WEIGHMENT_RECORDED',
  'PROCUREMENT_ACCEPTED',
  'RECEIPT_GENERATED'
);
