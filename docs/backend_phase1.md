# CropSaathi — Backend Phase 1 Development Guide

## 0. Context Recap

CropSaathi addresses the SIH procurement-centre problem by keeping farmer booking, queue, procurement, and payment workflow visible and auditable. The backend must enforce ownership, centre scope, transactional capacity rules, and immutable workflow events while keeping the prototype honest about government integrations and policy.

The locked backend is a small Hono `/api/v1` façade on Supabase Edge Functions, Supabase PostgreSQL/Auth/RLS/Realtime, and PostgreSQL functions/RPC for atomic transitions. `packages/contracts` is the single contract source used by both developers.

No earlier phase exists. Phase 1 creates the stable core schema/API that Phase 2 and Phase 3 extend additively without renaming routes, columns, or successful response shapes.

**This file covers:** Phone OTP façade, core relational schema, RLS, operator slot management, atomic booking, queue state machine, procurement state machine, payment status, and operator APIs.

## 1. Tech Stack Reference

This stack is locked across all three phases. Do not substitute frameworks or add a second backend.

| Layer | Locked choice | Why |
|---|---|---|
| Frontend | **Svelte 5 + SvelteKit 2 + TypeScript** | Small compiled UI, concise components, route splitting, strong mobile performance. |
| CSS | **Plain mobile-first CSS + CSS custom properties** | Minimal bundle and exact design-token control without Tailwind/Bootstrap drift. |
| Frontend state | **Svelte runes + local feature state** | Most state is server-owned; Redux/Zustand would add unnecessary complexity. |
| API façade | **TypeScript + Hono on Supabase Edge Functions** | Tiny `/api/v1` boundary keeps F1/B1 contract-first while staying inside Supabase. |
| Shared validation/types | **Zod + TypeScript** | One source defines request/response shapes, mocks, validation, route constants, and OpenAPI later. |
| Core business logic | **PostgreSQL functions/RPC + constraints** | Atomic slot, queue, procurement, readiness, and payment transitions belong in the DB. |
| ORM | **None** | SQL migrations + RPC are shorter and safer for this transactional domain. |
| Database | **Supabase PostgreSQL** | Relational constraints, `NUMERIC`, RLS, transactions, and immutable event history fit procurement. |
| Auth | **Supabase Phone OTP** | Real mobile OTP without requiring Aadhaar collection in the SIH prototype. |
| Authorization | **Supabase RLS + explicit API role/centre checks** | Farmer ownership and operator-centre scope are enforced at two layers. |
| Realtime | **Supabase Realtime private Broadcast channels** | Managed WebSocket transport; no custom WebSocket server to maintain. |
| Notifications | **In-app + server-side SMS adapter** | SMS provider credentials remain server-side and SMS failure cannot roll back domain state. |
| SMS provider | **MSG91 or another configured India-compliant provider** | Practical for a hackathon while leaving DLT sender/template setup as deployment configuration. |
| Mandi prices | **Phase 2 cache of official OGD/AGMARKNET market-price observations** | Enables attributed, dated mandi data without fabricating prices or confusing them with MSP. |
| Deploy | **Vercel web + Supabase Cloud** | Minimal DevOps and fast hackathon deployment. |
| Repository | **pnpm monorepo** | Separate frontend/backend ownership with one shared contracts package. |
| Mobile future | **PWA-ready now, Capacitor-ready later** | Same Svelte UI can later become APK without a second frontend codebase. |

### Locked repository structure

```text
cropsaathi/
├─ apps/
│  └─ web/                              # F1 owns
│     ├─ src/
│     │  ├─ lib/
│     │  │  ├─ components/
│     │  │  ├─ services/
│     │  │  └─ types/
│     │  └─ routes/
│     └─ static/
├─ packages/
│  └─ contracts/                        # jointly frozen before each phase
│     └─ src/
│        ├─ common.ts
│        ├─ routes.ts
│        ├─ phase1.ts
│        ├─ phase2.ts
│        └─ phase3.ts
├─ supabase/
│  ├─ functions/
│  │  ├─ _shared/                       # generated/synced contracts
│  │  └─ api/                           # Hono API façade
│  ├─ migrations/
│  └─ seed.sql
├─ scripts/
│  └─ sync-contracts.mjs
├─ pnpm-workspace.yaml
└─ package.json
```

### Contract ownership rules

- `packages/contracts` is the single human-edited source of truth.
- Before Phase N coding, F1+B1 freeze `phaseN.ts` and `routes.ts`.
- `pnpm contracts:sync` copies the frozen Zod schemas into `supabase/functions/_shared`.
- F1 imports request/response types and route constants from `@cropsaathi/contracts`.
- B1 validates every request and response against the same synced schemas.
- Authenticated API requests send `Authorization: Bearer <Supabase access token>`.
- Browser code never sees the Supabase service-role key, SMS secret, or external-source secret.
- Critical mutations always end in PostgreSQL RPC/functions; the Hono layer is orchestration/validation, not a second business-logic engine.

## 2. API Contract for This Phase

**Contract:** `v1.phase1`  
**Prefix:** `/api/v1`  
**Auth:** authenticated routes require `Authorization: Bearer <Supabase access token>`.

### Universal error format

Every 4xx/5xx application error:

```json
{
  "error": true,
  "code": "STRING_CODE",
  "message": "Human readable"
}
```

Status semantics:
- `400` validation/business rule
- `401` unauthenticated
- `403` role/ownership/centre forbidden
- `404` resource not found
- `409` workflow/capacity conflict
- `422` request-schema error
- `429` rate limited
- `503` provider unavailable

### A. Authentication

#### `POST /api/v1/auth/otp/request`

Request:
```json
{ "mobile": "+919876543210" }
```

Response `200`:
```json
{ "mobile_masked": "+91******3210", "expires_in_seconds": 300 }
```

Errors: `400 INVALID_MOBILE`, `429 OTP_RATE_LIMITED`, `503 OTP_PROVIDER_UNAVAILABLE`.

#### `POST /api/v1/auth/otp/verify`

Request:
```json
{ "mobile": "+919876543210", "otp": "482913" }
```

Response `200`:
```json
{
  "access_token": "supabase-access-token",
  "refresh_token": "supabase-refresh-token",
  "expires_in_seconds": 3600,
  "user": { "id": "uuid", "role": "FARMER", "profile_complete": false }
}
```

Errors: `400 INVALID_OTP`, `400 OTP_EXPIRED`, `429 OTP_ATTEMPTS_EXCEEDED`, `503 OTP_PROVIDER_UNAVAILABLE`.

#### `POST /api/v1/auth/logout`

Request body: none.  
Response `204`: no body.  
Errors: `401 UNAUTHENTICATED`.

### B. Profile / registration

#### `GET /api/v1/me`

Response `200`:
```json
{
  "id": "uuid",
  "role": "FARMER",
  "mobile_masked": "+91******3210",
  "profile_complete": true,
  "farmer": {
    "id": "uuid",
    "full_name": "Ramesh Patel",
    "state_code": "GJ",
    "district": "Gandhinagar",
    "village": "Demo Village",
    "external_farmer_ref": null,
    "preferred_language": "hi"
  }
}
```

Errors: `401 UNAUTHENTICATED`.

#### `PUT /api/v1/farmers/me`

Request:
```json
{
  "full_name": "Ramesh Patel",
  "state_code": "GJ",
  "district": "Gandhinagar",
  "village": "Demo Village",
  "external_farmer_ref": null,
  "preferred_language": "hi",
  "privacy_acknowledged": true
}
```

Response `200`:
```json
{ "farmer_id": "uuid", "profile_complete": true }
```

Errors: `400 PRIVACY_ACK_REQUIRED`, `401 UNAUTHENTICATED`, `422 VALIDATION_ERROR`.

### C. Farmer dashboard

#### `GET /api/v1/farmer/dashboard`

Response `200`:
```json
{
  "upcoming_booking": {
    "id": "uuid",
    "reference": "BK-DEMO-001",
    "centre_name": "SIH Demo Procurement Centre 01",
    "commodity_code": "PADDY_COMMON",
    "expected_quantity_qtl": "18.40",
    "slot_date": "2026-09-10",
    "slot_start": "10:30",
    "slot_end": "11:00",
    "status": "BOOKED"
  },
  "active_queue": null,
  "procurement": null,
  "payment": null
}
```

Nullable objects are explicitly `null`.  
Errors: `401 UNAUTHENTICATED`, `403 FARMER_ONLY`.

### D. Centres / slots

#### `GET /api/v1/centres?commodity_code=PADDY_COMMON&date=2026-09-10`

Response `200`:
```json
{
  "centres": [{
    "id": "uuid",
    "name": "SIH Demo Procurement Centre 01",
    "state_code": "GJ",
    "district": "Gandhinagar",
    "availability": "AVAILABLE"
  }]
}
```

Phase 1 `availability`: `AVAILABLE | FULL`.  
Errors: `400 INVALID_DATE`, `401 UNAUTHENTICATED`.

#### `GET /api/v1/centres/{centre_id}/slots?date=2026-09-10`

Response `200`:
```json
{
  "slots": [{
    "id": "uuid",
    "start": "10:30",
    "end": "11:00",
    "capacity": 12,
    "remaining": 4
  }]
}
```

Errors: `400 INVALID_DATE`, `401 UNAUTHENTICATED`, `404 CENTRE_NOT_FOUND`.

### E. Booking

#### `POST /api/v1/bookings`

Request:
```json
{
  "slot_id": "uuid",
  "commodity_code": "PADDY_COMMON",
  "expected_quantity_qtl": "18.40"
}
```

Response `201`:
```json
{
  "id": "uuid",
  "reference": "BK-DEMO-001",
  "status": "BOOKED",
  "centre_id": "uuid",
  "centre_name": "SIH Demo Procurement Centre 01",
  "slot_date": "2026-09-10",
  "slot_start": "10:30",
  "slot_end": "11:00",
  "commodity_code": "PADDY_COMMON",
  "expected_quantity_qtl": "18.40"
}
```

Errors: `400 INVALID_QUANTITY`, `401 UNAUTHENTICATED`, `403 FARMER_ONLY`, `404 SLOT_NOT_FOUND`, `409 SLOT_FULL`, `409 DUPLICATE_ACTIVE_BOOKING`.

#### `GET /api/v1/bookings/{booking_id}`

Response `200`: exactly the same booking object shape as `POST /bookings`.  
Errors: `401 UNAUTHENTICATED`, `403 BOOKING_FORBIDDEN`, `404 BOOKING_NOT_FOUND`.

### F. Queue

#### `GET /api/v1/queue/{booking_id}`

Response `200`:
```json
{
  "booking_id": "uuid",
  "state": "WAITING",
  "position": 4,
  "farmers_ahead": 3,
  "estimated_wait_min": 24,
  "updated_at": "2026-09-10T10:14:00+05:30"
}
```

Errors: `401 UNAUTHENTICATED`, `403 QUEUE_FORBIDDEN`, `404 QUEUE_NOT_FOUND`.

#### `POST /api/v1/operator/bookings/{booking_id}/check-in`

Request body: none.

Response `200`:
```json
{ "queue_entry_id": "uuid", "booking_id": "uuid", "state": "WAITING", "position": 4 }
```

Errors: `401 UNAUTHENTICATED`, `403 OPERATOR_CENTRE_FORBIDDEN`, `404 BOOKING_NOT_FOUND`, `409 INVALID_BOOKING_STATE`.

#### `POST /api/v1/operator/queue/{centre_id}/call-next`

Request body: none.

Response `200`:
```json
{ "booking_id": "uuid", "queue_entry_id": "uuid", "state": "CALLED" }
```

Errors: `401 UNAUTHENTICATED`, `403 OPERATOR_CENTRE_FORBIDDEN`, `409 NO_WAITING_FARMERS`.

#### `POST /api/v1/operator/queue/{booking_id}/start-service`

Request body: none.

Response `200`:
```json
{ "booking_id": "uuid", "state": "IN_SERVICE" }
```

Errors: `401 UNAUTHENTICATED`, `403 OPERATOR_CENTRE_FORBIDDEN`, `404 QUEUE_NOT_FOUND`, `409 INVALID_QUEUE_STATE`.

#### `POST /api/v1/operator/queue/{booking_id}/complete-service`

Request body: none.

Response `200`:
```json
{ "booking_id": "uuid", "state": "COMPLETED" }
```

Errors: `401 UNAUTHENTICATED`, `403 OPERATOR_CENTRE_FORBIDDEN`, `404 QUEUE_NOT_FOUND`, `409 PROCUREMENT_NOT_COMPLETE`, `409 INVALID_QUEUE_STATE`.

### G. Procurement

#### `GET /api/v1/procurements/{procurement_id}`

Response `200`:
```json
{
  "id": "uuid",
  "booking_id": "uuid",
  "status": "PROCUREMENT_ACCEPTED",
  "quality_status": "ACCEPTED",
  "commodity_code": "PADDY_COMMON",
  "quantity_qtl": "18.40",
  "rate_per_qtl": "2441.00",
  "amount": "44914.40",
  "receipt_reference": "PR-DEMO-001",
  "events": [{ "type": "QUALITY_ACCEPTED", "created_at": "2026-09-10T10:45:00+05:30" }]
}
```

Errors: `401 UNAUTHENTICATED`, `403 PROCUREMENT_FORBIDDEN`, `404 PROCUREMENT_NOT_FOUND`.

#### `POST /api/v1/operator/procurements/{procurement_id}/events`

Request:
```json
{ "type": "WEIGHMENT_RECORDED", "quantity_qtl": "18.40", "reason_code": null }
```

Allowed types: `QUALITY_STARTED`, `QUALITY_ACCEPTED`, `QUALITY_REJECTED`, `WEIGHMENT_RECORDED`, `PROCUREMENT_ACCEPTED`, `RECEIPT_GENERATED`.

Response `200`:
```json
{
  "procurement_id": "uuid",
  "status": "WEIGHMENT_RECORDED",
  "quality_status": "ACCEPTED",
  "quantity_qtl": "18.40",
  "rate_per_qtl": null,
  "amount": null,
  "receipt_reference": null
}
```

Errors: `400 INVALID_QUANTITY`, `400 REJECTION_REASON_REQUIRED`, `401 UNAUTHENTICATED`, `403 OPERATOR_CENTRE_FORBIDDEN`, `404 PROCUREMENT_NOT_FOUND`, `409 INVALID_PROCUREMENT_TRANSITION`.

### H. Payment

#### `GET /api/v1/payments/{procurement_id}`

Response `200`:
```json
{
  "procurement_id": "uuid",
  "amount": "44914.40",
  "status": "PROCESSING",
  "reference": "PAY-DEMO-001",
  "updated_at": "2026-09-10T11:30:00+05:30"
}
```

Errors: `401 UNAUTHENTICATED`, `403 PAYMENT_FORBIDDEN`, `404 PAYMENT_NOT_FOUND`.

#### `POST /api/v1/operator/payments/{procurement_id}/status`

Request:
```json
{ "status": "PROCESSING", "reference": "PAY-DEMO-001" }
```

Allowed states: `NOT_STARTED`, `INITIATED`, `PROCESSING`, `CREDITED`, `FAILED`.

Response `200`:
```json
{
  "procurement_id": "uuid",
  "amount": "44914.40",
  "status": "PROCESSING",
  "reference": "PAY-DEMO-001",
  "updated_at": "2026-09-10T11:30:00+05:30"
}
```

Errors: `401 UNAUTHENTICATED`, `403 OPERATOR_CENTRE_FORBIDDEN`, `404 PAYMENT_NOT_FOUND`, `409 INVALID_PAYMENT_TRANSITION`.

### I. Operator dashboard / slot management

#### `GET /api/v1/operator/dashboard`

Response `200`:
```json
{
  "centre": { "id": "uuid", "name": "SIH Demo Procurement Centre 01" },
  "today": { "bookings": 28, "checked_in": 12, "waiting": 5, "in_service": 1, "completed": 6 }
}
```

Errors: `401 UNAUTHENTICATED`, `403 OPERATOR_ONLY`, `403 OPERATOR_CENTRE_FORBIDDEN`.

#### `GET /api/v1/operator/slots?date=2026-09-10`

Response `200`:
```json
{
  "slots": [{
    "id": "uuid", "date": "2026-09-10", "start": "10:30", "end": "11:00",
    "capacity": 12, "booked_count": 8, "active": true
  }]
}
```

Errors: `400 INVALID_DATE`, `401 UNAUTHENTICATED`, `403 OPERATOR_CENTRE_FORBIDDEN`.

#### `POST /api/v1/operator/slots`

Request:
```json
{ "date": "2026-09-11", "start": "10:30", "end": "11:00", "capacity": 12 }
```

Response `201`:
```json
{
  "id": "uuid", "date": "2026-09-11", "start": "10:30", "end": "11:00",
  "capacity": 12, "booked_count": 0, "active": true
}
```

Errors: `400 INVALID_SLOT_RANGE`, `400 INVALID_CAPACITY`, `401 UNAUTHENTICATED`, `403 OPERATOR_CENTRE_FORBIDDEN`, `409 SLOT_OVERLAP`.

#### `PATCH /api/v1/operator/slots/{slot_id}`

Request:
```json
{ "capacity": 14, "active": true }
```

Response `200`:
```json
{
  "id": "uuid", "date": "2026-09-11", "start": "10:30", "end": "11:00",
  "capacity": 14, "booked_count": 0, "active": true
}
```

Errors: `400 CAPACITY_BELOW_BOOKED_COUNT`, `401 UNAUTHENTICATED`, `403 OPERATOR_CENTRE_FORBIDDEN`, `404 SLOT_NOT_FOUND`, `409 SLOT_UPDATE_CONFLICT`.

## 3. Tasks

### Team allocation
| Role | Count | Phase 1 responsibility |
|---|---:|---|
| F1 | 1 | Consumes frozen contract using typed mocks until endpoints are ready. |
| B1 | 1 | All Phase 1 schema/RLS/RPC/API/auth/test/deploy work. |

### Phase 1 — 14 hours
```text
0–1 BOTH contract freeze
B1 1–3 schema/auth/RLS
B1 3–6 centres/slots/booking
B1 6–9 queue/procurement/payment
B1 9–11 operator dashboard/seed/tests
11–14 BOTH merge → integration → QA → deploy
```

1. Contract sync + Hono skeleton — .75h
2. OTP façade/auth middleware — 1h
3. Core migrations — 1.5h
4. RLS/operator-centre authorization — 1.25h
5. Centre/slot read + operator slot management — 1h
6. Atomic booking RPC — 1.5h
7. Queue RPCs — 1.25h
8. Procurement state machine — 1.5h
9. Payment status — .75h
10. Operator dashboard — .5h
11. Seed/RLS/concurrency tests — 1.25h
12. Integration/deploy — 1.75h

## 4. Code Specifications

### 4.1 Phase 1 schema

**profiles**: `id uuid PK→auth.users`, `role FARMER|OPERATOR`, `mobile_e164 unique`, `profile_complete`, timestamps. No self-promotion.

**farmers**: `id`, unique `user_id`, full_name/state_code/district/village, optional external farmer ref, preferred_language, privacy_acknowledged_at, timestamps.

**centres**: id/name/state_code/district/address_text/avg_service_minutes>0/active/timestamps.

**operator_centres**: unique `(operator_user_id, centre_id)`; every operator mutation checks this.

**procurement_rates**: state/scheme/season/commodity/rate_per_qtl NUMERIC/source/active. No farmer/operator edit API.

**slots**: centre/date/start/end/capacity>0/booked_count>=0/active; `booked_count<=capacity`; unique centre/date/time.

**bookings**: reference unique, farmer/centre/slot FKs, commodity, quantity NUMERIC>0, status `BOOKED|CHECKED_IN|IN_QUEUE|IN_SERVICE|COMPLETED|CANCELLED`.

**queue_entries**: booking unique, centre, deterministic sequence, `WAITING|CALLED|IN_SERVICE|COMPLETED`, timestamps.

**procurements**: booking unique, procurement/quality status, quantity/rate/amount NUMERIC, receipt reference.

**procurement_events**: append-only event/actor/reason/metadata/time. Ordinary roles cannot UPDATE/DELETE.

**payments**: procurement unique, amount NUMERIC, `NOT_STARTED|INITIATED|PROCESSING|CREDITED|FAILED`, reference, timestamps.

### 4.2 AuthService

Request OTP: normalize E.164 → rate-limit → Supabase Phone OTP → masked response; never log OTP.  
Verify OTP: validate → Supabase verify → ensure profile → return exact contract session.

### 4.3 BookingService / RPC

Inside one DB transaction:
1. resolve farmer from authenticated user, never browser farmer_id;
2. lock slot;
3. validate active/date;
4. validate `booked_count < capacity`;
5. enforce duplicate-active-booking rule;
6. insert booking/reference;
7. increment booked_count;
8. create/associate procurement/payment shell records as needed;
9. commit exact response.

Never implement separate read/write capacity logic.

### 4.4 SlotService

Assigned centre only. Validate time, overlap, capacity. `active=false` blocks new booking but does not delete existing bookings. Never capacity < booked_count.

### 4.5 QueueService

Check-in: correct centre/state; one deterministic queue record.  
Call-next: lock oldest WAITING; no arbitrary priority.  
Start: only CALLED.  
Complete: only valid state and procurement completion condition.

### 4.6 ProcurementService

```text
NOT_STARTED
→ QUALITY_IN_PROGRESS
→ QUALITY_ACCEPTED → WEIGHMENT_RECORDED → PROCUREMENT_ACCEPTED → RECEIPT_GENERATED
└→ QUALITY_REJECTED
```

Reject requires an authoritative supplied reason. Generic code does not invent FAQ thresholds. Procurement acceptance reads active configured rate and calculates using PostgreSQL NUMERIC. Every transition appends an event.

### 4.7 PaymentService

`NOT_STARTED → INITIATED → PROCESSING → CREDITED`, with `FAILED` only from a valid processing state. CropSaathi records status only; it does not move money.

### 4.8 RLS / endpoint implementation

Farmer: own profile/booking/queue/procurement/payment.  
Operator: assigned centre only.  
Configured rates: read-only to farmer/operator.

Every Hono route: JWT verify → Zod validate → role/ownership → RLS-safe query/RPC → domain-error map → exact response validation. No raw SQL/Supabase/provider error.

### 4.9 GoI/public-service compliance notes

- Auth endpoints: mobile OTP only; no universal Aadhaar requirement; no OTP/token logs.
- Profile endpoint: data minimization; no Aadhaar/PAN/bank/biometrics.
- Centre/slot endpoints: model rules by state/scheme config; do not assume one nationwide APMC workflow.
- Booking: appointment does not override official procurement eligibility/FAQ/MSP.
- Queue: centre-scoped and auditable; no other-farmer private data.
- Procurement: MSP/FAQ comes from authoritative configuration; generic code does not invent thresholds.
- Payment: workflow state only; no bank credentials and no claim CropSaathi executes payment.
- Operator endpoints: assigned-centre authorization on every mutation.
- Accessibility direction: frontend targets GIGW 3.0 / WCAG 2.1 AA; prototype does not claim certification.
- Prototype truthfulness: no fake PFMS/e-NAM/e-Samriddhi/UIDAI integration.

### 4.99 What NOT to Build in This Phase

- Notifications/preferences/SMS.
- Realtime.
- Mandi-price cache.
- U1 readiness/risk.
- U3 payment events/trace.
- Future Token Assurance/Transport backend.
- AI/maps/analytics.
- Aadhaar/bank/fake government integrations.

## 5. Design Consistency Rules

These rules are frozen for all three phases. Later phases may add states and functionality, not a new visual language.

### 5.1 UI philosophy

- Flat, card-based, single-column-priority.
- One dominant farmer action per screen.
- Farmer desktop content stays centered around `max-width: 760px`.
- Operator workflows may use up to `900px`, but remain vertically structured rather than becoming BI dashboards.
- Mobile is the default design; desktop expands spacing, not complexity.
- No horizontal application-level scrolling at 360, 390, 768, 1024, or 1440 widths.
- No charts, decorative-only cards, testimonial sections, fake stats, stitched grids, giant hero art, or marketing blocks.
- No content image is required. Do not add placeholder photography just to fill whitespace.
- No Google Images.
- If a real image is added later, use a properly licensed source and native lazy loading below the fold.
- No hover-only, drag-only, right-click, popup-window, or multi-window workflow.

### 5.2 Locked CropSaathi colors

```css
:root {
  --color-primary: #166534;
  --color-primary-dark: #14532D;
  --color-primary-soft: #ECFDF3;

  --color-bg: #F7F8F5;
  --color-surface: #FFFFFF;
  --color-text: #17201B;
  --color-muted: #5E6A62;
  --color-border: #D8DED9;

  --color-success: #15803D;
  --color-success-bg: #F0FDF4;
  --color-warning: #A65A00;
  --color-warning-bg: #FFF7E6;
  --color-danger: #B42318;
  --color-danger-bg: #FEF3F2;
  --color-info: #1D4ED8;
  --color-info-bg: #EFF6FF;
  --color-disabled: #9AA39D;
  --color-disabled-bg: #EEF0EE;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;

  --radius-control: 8px;
  --radius-card: 12px;
}
```

### 5.3 Typography

```css
font-family: system-ui, "Noto Sans Devanagari", "Nirmala UI", sans-serif;
```

- Heading: 24px.
- Subheading/card title: 18px.
- Body: 16px.
- Supporting/metadata: minimum 14px.
- No essential text below 14px.
- No remote Google Font dependency.
- Never disable browser zoom.

### 5.4 Interaction / navigation / responsiveness

- Buttons and inputs: minimum 48px high; mobile primary actions may use 52px.
- Minimum 12px gap between adjacent interactive controls.
- Farmer mobile nav: **Home, Book, Queue, Status, Payment**.
- Farmer desktop: same destinations in a simple top nav.
- Public pages: no authenticated bottom nav.
- Operator Phase 1 nav: **Dashboard, Slots, Queue, Procurement**.
- Operator `Readiness` is added only in Phase 3 when U1 exists.
- Tables become labeled cards on mobile.
- Long IDs wrap, never overflow.
- Respect `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)`.
- Prefer `min-height: 100dvh`.
- Critical writes require connectivity and must never show false offline success.

### 5.5 Accessibility / bilingual readiness

- Status is always **color + icon + text**, never color alone.
- Visible labels and focus states.
- Semantic landmarks/headings.
- Restrained `aria-live` for queue/realtime updates.
- Important farmer actions bilingual-ready:
  - Login / लॉग इन
  - Register / पंजीकरण
  - Book Slot / स्लॉट बुक करें
  - Live Queue / लाइव कतार
  - Procurement Status / खरीद स्थिति
  - Payment Status / भुगतान स्थिति
  - Continue / आगे बढ़ें
  - Back / वापस
  - Logout / लॉग आउट

### 5.6 Consistent SIH demo fixture

Use one synthetic story when demo data is required:

- Farmer: **Ramesh Patel**
- State: **Gujarat**
- District: **Gandhinagar**
- Main centre: **SIH Demo Procurement Centre 01**
- Commodity: **Paddy (Common)** / `PADDY_COMMON`
- Quantity: **18.40 qtl**
- Season: **2026–27**
- Booking reference: **BK-DEMO-001**
- Procurement reference: **PR-DEMO-001**
- Payment reference: **PAY-DEMO-001**
- U3 blocker reference: **STK-DEMO-101**

Do not mix real farmer identities, bank details, or misleading live government-integration claims into demo data.

## 6. Integration Checklist

- [ ] Clean migrations apply from zero.
- [ ] OTP/token/secret absent from logs.
- [ ] RLS blocks cross-farmer reads.
- [ ] Operator-centre scope on every operator mutation.
- [ ] Slot constraints work.
- [ ] One-slot concurrency test has one winner.
- [ ] Invalid workflow returns 409 + universal error.
- [ ] Procurement events immutable.
- [ ] Amount uses DB NUMERIC.
- [ ] Rate read-only to farmer/operator.
- [ ] Payment transition validation works.
- [ ] Contract response tests pass.
- [ ] Seed is SIH demo only.
- [ ] F1 full flow works with real API.
- [ ] No browser-exposed server secret.

## 7. Merge Protocol

1. Freeze the Phase N HTTP/event contract and Zod schemas **before coding**.
2. Freeze route constants and commit `packages/contracts` once.
3. Run `pnpm contracts:sync`; generated Edge Function schemas are never edited manually.
4. Branch ownership:
   - F1: `phaseN/frontend`, owns `apps/web/**`.
   - B1: `phaseN/backend`, owns `supabase/**`.
5. F1 uses only contract-based mocks in a dedicated dev adapter; no invented fields.
6. B1 validates requests/responses against the exact same schemas; no renamed fields.
7. Universal error response is always:
   ```json
   { "error": true, "code": "STRING_CODE", "message": "Human readable" }
   ```
8. Merge order: **contract → backend → frontend**.
9. Before backend merge: clean migrations, API tests, RLS tests, concurrency tests.
10. Before frontend merge: `svelte-check`, component tests, production build.
11. After both merges: run the entire phase integration checklist using real API data.
12. Any shape mismatch is fixed at the shared contract source and then on both sides in one reviewed change; never hide it with aliases/silent defaults.
13. Tag completion:
    - `phase1-complete`
    - `phase2-complete`
    - `phase3-complete`
14. Do not begin the next phase until the current tag exists and the deployed increment works.
