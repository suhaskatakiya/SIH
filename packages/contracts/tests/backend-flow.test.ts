/**
 * Backend Phase 1 — Flow & State Machine Tests
 *
 * Verifies that the workflow state machines, universal error formats,
 * and endpoint route contracts specified in backend_phase1.md are strictly honored.
 */
import { describe, it, expect } from 'vitest';
import * as C from '../src/index';

describe('Workflow State Machines', () => {
  describe('Queue state transitions (§4.5)', () => {
    it('validates queue states WAITING, CALLED, IN_SERVICE, COMPLETED', () => {
      expect(C.QueueStateSchema.parse('WAITING')).toBe('WAITING');
      expect(C.QueueStateSchema.parse('CALLED')).toBe('CALLED');
      expect(C.QueueStateSchema.parse('IN_SERVICE')).toBe('IN_SERVICE');
      expect(C.QueueStateSchema.parse('COMPLETED')).toBe('COMPLETED');
      expect(() => C.QueueStateSchema.parse('CANCELLED')).toThrow();
    });

    it('simulates queue progression across multiple farmers in the same slot window', () => {
      // 3 farmers in same slot: Suresh (Called), Ramesh (Waiting #1 ahead), Vikram (Waiting #2 ahead)
      const queue = [
        { id: 'q1', booking_id: 'b1', name: 'Suresh Kumar', state: 'CALLED' as C.QueueState },
        { id: 'q2', booking_id: 'b2', name: 'Ramesh Patel', state: 'WAITING' as C.QueueState },
        { id: 'q3', booking_id: 'b3', name: 'Vikram Singh', state: 'WAITING' as C.QueueState }
      ];

      const getPositions = () => {
        const active = queue.filter((q) => q.state !== 'COMPLETED');
        return active.map((entry, idx) => ({
          name: entry.name,
          state: entry.state,
          position: idx + 1,
          farmers_ahead: idx,
          wait_min: idx * 10
        }));
      };

      // Step 1: Initial state
      let pos = getPositions();
      expect(pos[0]).toEqual({ name: 'Suresh Kumar', state: 'CALLED', position: 1, farmers_ahead: 0, wait_min: 0 });
      expect(pos[1]).toEqual({ name: 'Ramesh Patel', state: 'WAITING', position: 2, farmers_ahead: 1, wait_min: 10 });
      expect(pos[2]).toEqual({ name: 'Vikram Singh', state: 'WAITING', position: 3, farmers_ahead: 2, wait_min: 20 });

      // Step 2: Operator calls Next Farmer -> completes Suresh, calls Ramesh
      const currentActive = queue.find((q) => q.state === 'CALLED');
      if (currentActive) currentActive.state = 'COMPLETED';
      const nextWaiting = queue.find((q) => q.state === 'WAITING');
      if (nextWaiting) nextWaiting.state = 'CALLED';

      pos = getPositions();
      expect(pos).toHaveLength(2);
      expect(pos[0]).toEqual({ name: 'Ramesh Patel', state: 'CALLED', position: 1, farmers_ahead: 0, wait_min: 0 });
      expect(pos[1]).toEqual({ name: 'Vikram Singh', state: 'WAITING', position: 2, farmers_ahead: 1, wait_min: 10 });

      // Step 3: Operator calls Next Farmer again -> completes Ramesh, calls Vikram
      const currentActive2 = queue.find((q) => q.state === 'CALLED');
      if (currentActive2) currentActive2.state = 'COMPLETED';
      const nextWaiting2 = queue.find((q) => q.state === 'WAITING');
      if (nextWaiting2) nextWaiting2.state = 'CALLED';

      pos = getPositions();
      expect(pos).toHaveLength(1);
      expect(pos[0]).toEqual({ name: 'Vikram Singh', state: 'CALLED', position: 1, farmers_ahead: 0, wait_min: 0 });
    });
  });

  describe('Procurement state transitions (§4.6)', () => {
    const validEvents = [
      'QUALITY_STARTED',
      'QUALITY_ACCEPTED',
      'QUALITY_REJECTED',
      'WEIGHMENT_RECORDED',
      'PROCUREMENT_ACCEPTED',
      'RECEIPT_GENERATED'
    ];

    it('accepts all 6 locked procurement event types', () => {
      for (const ev of validEvents) {
        expect(() => C.ProcurementEventTypeSchema.parse(ev)).not.toThrow();
      }
    });

    it('rejects invented procurement events', () => {
      expect(() => C.ProcurementEventTypeSchema.parse('WEIGHMENT_STARTED')).toThrow();
      expect(() => C.ProcurementEventTypeSchema.parse('PAYMENT_INITIATED')).toThrow();
    });

    it('validates procurement event body payload requirements', () => {
      // Weighment payload with quantity
      const weighment = C.CreateProcurementEventBody.parse({
        type: 'WEIGHMENT_RECORDED',
        quantity_qtl: '18.40'
      });
      expect(weighment.quantity_qtl).toBe('18.40');

      // Quality rejection payload with reason
      const rejection = C.CreateProcurementEventBody.parse({
        type: 'QUALITY_REJECTED',
        reason_code: 'MOISTURE_EXCEEDS_MAX'
      });
      expect(rejection.reason_code).toBe('MOISTURE_EXCEEDS_MAX');
    });
  });

  describe('Payment state transitions (§4.7)', () => {
    const validPaymentStates = [
      'NOT_STARTED',
      'INITIATED',
      'PROCESSING',
      'CREDITED',
      'FAILED'
    ];

    it('accepts all 5 locked payment status values', () => {
      for (const st of validPaymentStates) {
        expect(() => C.PaymentStatusSchema.parse(st)).not.toThrow();
      }
    });

    it('rejects invented payment states', () => {
      expect(() => C.PaymentStatusSchema.parse('PENDING')).toThrow();
      expect(() => C.PaymentStatusSchema.parse('SUCCESS')).toThrow();
    });

    it('parses payment update body', () => {
      const parsed = C.SetPaymentStatusBody.parse({
        status: 'PROCESSING',
        reference: 'PAY-DEMO-001'
      });
      expect(parsed.status).toBe('PROCESSING');
      expect(parsed.reference).toBe('PAY-DEMO-001');
    });
  });
});

describe('Universal Error Shape & Codes (§2)', () => {
  it('validates universal error format { error: true, code, message }', () => {
    const err = C.ApiErrorSchema.parse({
      error: true,
      code: C.ERROR_CODES.SLOT_FULL,
      message: 'This slot is full or no longer available.'
    });
    expect(err.error).toBe(true);
    expect(err.code).toBe('SLOT_FULL');
  });

  it('verifies critical locked error codes exist in ERROR_CODES', () => {
    const requiredCodes = [
      'UNAUTHENTICATED',
      'FARMER_ONLY',
      'OPERATOR_ONLY',
      'OPERATOR_CENTRE_FORBIDDEN',
      'BOOKING_FORBIDDEN',
      'QUEUE_FORBIDDEN',
      'PROCUREMENT_FORBIDDEN',
      'PAYMENT_FORBIDDEN',
      'CENTRE_NOT_FOUND',
      'SLOT_NOT_FOUND',
      'BOOKING_NOT_FOUND',
      'QUEUE_NOT_FOUND',
      'PROCUREMENT_NOT_FOUND',
      'PAYMENT_NOT_FOUND',
      'SLOT_FULL',
      'DUPLICATE_ACTIVE_BOOKING',
      'SLOT_OVERLAP',
      'INVALID_BOOKING_STATE',
      'NO_WAITING_FARMERS',
      'INVALID_QUEUE_STATE',
      'PROCUREMENT_NOT_COMPLETE',
      'INVALID_PROCUREMENT_TRANSITION',
      'INVALID_PAYMENT_TRANSITION',
      'CAPACITY_BELOW_BOOKED_COUNT',
      'VALIDATION_ERROR',
      'OTP_RATE_LIMITED'
    ];

    for (const code of requiredCodes) {
      expect(C.ERROR_CODES).toHaveProperty(code);
    }
  });
});

describe('Route Constants (§2)', () => {
  it('mounts under /api/v1', () => {
    expect(C.API_PREFIX).toBe('/api/v1');
    expect(C.CONTRACT_VERSION).toBe('v1.phase1');
  });

  it('builds relative route paths correctly', () => {
    expect(C.apiPath(C.ROUTES.me)).toBe('/api/v1/me');
    expect(C.apiPath(C.ROUTES.bookings)).toBe('/api/v1/bookings');
    expect(C.apiPath(C.ROUTES.booking('123'))).toBe('/api/v1/bookings/123');
    expect(C.apiPath(C.ROUTES.queue('123'))).toBe('/api/v1/queue/123');
    expect(C.apiPath(C.ROUTES.procurement('456'))).toBe('/api/v1/procurements/456');
    expect(C.apiPath(C.ROUTES.payment('789'))).toBe('/api/v1/payments/789');
    expect(C.apiPath(C.ROUTES.operatorDashboard)).toBe('/api/v1/operator/dashboard');
  });
});
