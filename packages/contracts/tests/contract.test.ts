/**
 * Contract conformance tests.
 *
 * Each `expect(...).parse()` uses the EXACT example JSON from the spec (§2 of
 * docs/backend_phase1.md). If a schema drifts from the frozen contract, these
 * fail — which is the whole point of freezing the contract before coding.
 */
import { describe, it, expect } from 'vitest';
import * as C from '../src/index';

describe('A. auth', () => {
  it('otp request/response', () => {
    expect(() => C.OtpRequestBody.parse({ mobile: '+919876543210' })).not.toThrow();
    expect(() =>
      C.OtpRequestResponse.parse({ mobile_masked: '+91******3210', expires_in_seconds: 300 })
    ).not.toThrow();
  });

  it('otp verify request/response', () => {
    expect(() => C.OtpVerifyBody.parse({ mobile: '+919876543210', otp: '482913' })).not.toThrow();
    expect(() =>
      C.OtpVerifyResponse.parse({
        access_token: 'supabase-access-token',
        refresh_token: 'supabase-refresh-token',
        expires_in_seconds: 3600,
        user: {
          id: '00000000-0000-0000-0000-000000000001',
          role: 'FARMER',
          profile_complete: false
        }
      })
    ).not.toThrow();
  });

  it('rejects a non-E.164 mobile', () => {
    expect(() => C.OtpRequestBody.parse({ mobile: '9876543210' })).toThrow();
  });
});

describe('B. profile', () => {
  it('GET /me', () => {
    expect(() =>
      C.MeResponse.parse({
        id: '00000000-0000-0000-0000-000000000001',
        role: 'FARMER',
        mobile_masked: '+91******3210',
        profile_complete: true,
        farmer: {
          id: '00000000-0000-0000-0000-000000000002',
          full_name: 'Ramesh Patel',
          state_code: 'GJ',
          district: 'Gandhinagar',
          village: 'Demo Village',
          external_farmer_ref: null,
          preferred_language: 'hi'
        }
      })
    ).not.toThrow();
  });

  it('PUT /farmers/me', () => {
    expect(() =>
      C.UpdateFarmerBody.parse({
        full_name: 'Ramesh Patel',
        state_code: 'GJ',
        district: 'Gandhinagar',
        village: 'Demo Village',
        external_farmer_ref: null,
        preferred_language: 'hi',
        privacy_acknowledged: true
      })
    ).not.toThrow();
    expect(() =>
      C.UpdateFarmerResponse.parse({
        farmer_id: '00000000-0000-0000-0000-000000000002',
        profile_complete: true
      })
    ).not.toThrow();
  });
});

describe('C. farmer dashboard', () => {
  it('parses the example with null sub-objects', () => {
    expect(() =>
      C.FarmerDashboardResponse.parse({
        upcoming_booking: {
          id: '00000000-0000-0000-0000-000000000010',
          reference: 'BK-DEMO-001',
          centre_name: 'SIH Demo Procurement Centre 01',
          commodity_code: 'PADDY_COMMON',
          expected_quantity_qtl: '18.40',
          slot_date: '2026-09-10',
          slot_start: '10:30',
          slot_end: '11:00',
          status: 'BOOKED'
        },
        active_queue: null,
        procurement: null,
        payment: null
      })
    ).not.toThrow();
  });
});

describe('D. centres / slots', () => {
  it('centres list', () => {
    expect(() =>
      C.CentresResponse.parse({
        centres: [
          {
            id: '00000000-0000-0000-0000-000000000020',
            name: 'SIH Demo Procurement Centre 01',
            state_code: 'GJ',
            district: 'Gandhinagar',
            availability: 'AVAILABLE'
          }
        ]
      })
    ).not.toThrow();
  });

  it('slots list', () => {
    expect(() =>
      C.SlotsResponse.parse({
        slots: [
          {
            id: '00000000-0000-0000-0000-000000000030',
            start: '10:30',
            end: '11:00',
            capacity: 12,
            remaining: 4
          }
        ]
      })
    ).not.toThrow();
  });
});

describe('E. booking', () => {
  it('create request + booking entity', () => {
    expect(() =>
      C.CreateBookingBody.parse({
        slot_id: '00000000-0000-0000-0000-000000000030',
        commodity_code: 'PADDY_COMMON',
        expected_quantity_qtl: '18.40'
      })
    ).not.toThrow();
    expect(() =>
      C.Booking.parse({
        id: '00000000-0000-0000-0000-000000000010',
        reference: 'BK-DEMO-001',
        status: 'BOOKED',
        centre_id: '00000000-0000-0000-0000-000000000020',
        centre_name: 'SIH Demo Procurement Centre 01',
        slot_date: '2026-09-10',
        slot_start: '10:30',
        slot_end: '11:00',
        commodity_code: 'PADDY_COMMON',
        expected_quantity_qtl: '18.40'
      })
    ).not.toThrow();
  });

  it('rejects a zero / negative quantity', () => {
    expect(() =>
      C.CreateBookingBody.parse({
        slot_id: '00000000-0000-0000-0000-000000000030',
        commodity_code: 'PADDY_COMMON',
        expected_quantity_qtl: '0'
      })
    ).toThrow();
  });
});

describe('F. queue', () => {
  it('queue status', () => {
    expect(() =>
      C.QueueStatusResponse.parse({
        booking_id: '00000000-0000-0000-0000-000000000010',
        state: 'WAITING',
        position: 4,
        farmers_ahead: 3,
        estimated_wait_min: 24,
        updated_at: '2026-09-10T10:14:00+05:30'
      })
    ).not.toThrow();
  });

  it('operator transitions', () => {
    expect(() =>
      C.CheckInResponse.parse({
        queue_entry_id: '00000000-0000-0000-0000-000000000040',
        booking_id: '00000000-0000-0000-0000-000000000010',
        state: 'WAITING',
        position: 4
      })
    ).not.toThrow();
    expect(() =>
      C.CallNextResponse.parse({
        booking_id: '00000000-0000-0000-0000-000000000010',
        queue_entry_id: '00000000-0000-0000-0000-000000000040',
        state: 'CALLED'
      })
    ).not.toThrow();
    expect(() =>
      C.StartServiceResponse.parse({
        booking_id: '00000000-0000-0000-0000-000000000010',
        state: 'IN_SERVICE'
      })
    ).not.toThrow();
    expect(() =>
      C.CompleteServiceResponse.parse({
        booking_id: '00000000-0000-0000-0000-000000000010',
        state: 'COMPLETED'
      })
    ).not.toThrow();
  });
});

describe('G. procurement', () => {
  it('procurement entity with events', () => {
    expect(() =>
      C.Procurement.parse({
        id: '00000000-0000-0000-0000-000000000050',
        booking_id: '00000000-0000-0000-0000-000000000010',
        status: 'PROCUREMENT_ACCEPTED',
        quality_status: 'ACCEPTED',
        commodity_code: 'PADDY_COMMON',
        quantity_qtl: '18.40',
        rate_per_qtl: '2441.00',
        amount: '44914.40',
        receipt_reference: 'PR-DEMO-001',
        events: [{ type: 'QUALITY_ACCEPTED', created_at: '2026-09-10T10:45:00+05:30' }]
      })
    ).not.toThrow();
  });

  it('event request + response', () => {
    expect(() =>
      C.CreateProcurementEventBody.parse({
        type: 'WEIGHMENT_RECORDED',
        quantity_qtl: '18.40',
        reason_code: null
      })
    ).not.toThrow();
    expect(() =>
      C.ProcurementEventResponse.parse({
        procurement_id: '00000000-0000-0000-0000-000000000050',
        status: 'WEIGHMENT_RECORDED',
        quality_status: 'ACCEPTED',
        quantity_qtl: '18.40',
        rate_per_qtl: null,
        amount: null,
        receipt_reference: null
      })
    ).not.toThrow();
  });
});

describe('H. payment', () => {
  it('payment entity + set-status body', () => {
    expect(() =>
      C.Payment.parse({
        procurement_id: '00000000-0000-0000-0000-000000000050',
        amount: '44914.40',
        status: 'PROCESSING',
        reference: 'PAY-DEMO-001',
        updated_at: '2026-09-10T11:30:00+05:30'
      })
    ).not.toThrow();
    expect(() =>
      C.SetPaymentStatusBody.parse({ status: 'PROCESSING', reference: 'PAY-DEMO-001' })
    ).not.toThrow();
  });
});

describe('I. operator dashboard / slots', () => {
  it('dashboard', () => {
    expect(() =>
      C.OperatorDashboardResponse.parse({
        centre: { id: '00000000-0000-0000-0000-000000000020', name: 'SIH Demo Procurement Centre 01' },
        today: { bookings: 28, checked_in: 12, waiting: 5, in_service: 1, completed: 6 }
      })
    ).not.toThrow();
  });

  it('slot list / create / patch', () => {
    const slot = {
      id: '00000000-0000-0000-0000-000000000030',
      date: '2026-09-10',
      start: '10:30',
      end: '11:00',
      capacity: 12,
      booked_count: 8,
      active: true
    };
    expect(() => C.OperatorSlotsResponse.parse({ slots: [slot] })).not.toThrow();
    expect(() =>
      C.CreateSlotBody.parse({ date: '2026-09-11', start: '10:30', end: '11:00', capacity: 12 })
    ).not.toThrow();
    expect(() => C.PatchSlotBody.parse({ capacity: 14, active: true })).not.toThrow();
    expect(() => C.PatchSlotBody.parse({})).toThrow();
  });
});

describe('universal error', () => {
  it('matches the frozen envelope', () => {
    expect(() =>
      C.ApiErrorSchema.parse({ error: true, code: 'SLOT_FULL', message: 'Human readable' })
    ).not.toThrow();
    expect(() => C.ApiErrorSchema.parse({ error: false, code: 'X', message: 'y' })).toThrow();
  });
});
