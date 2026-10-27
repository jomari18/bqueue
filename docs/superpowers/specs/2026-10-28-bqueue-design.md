# B.Queue: Design Spec

- **Date:** 2026-10-28
- **Author:** Jomari M. Candido
- **Status:** Draft, waiting for review
- **Series:** Project 3 of 4 new portfolio projects (ResuMatch, ZariZari, B.Queue, Expense Splitter)
- **Name:** B.Queue ("B" for barangay, "Queue" for the pila). Live at `bqueue.netlify.app` with the API at `bqueue-api.onrender.com`; both names were free on 28 October 2026.

## 1. Purpose

B.Queue is a document request and walk-in queue system for a Philippine barangay hall. Residents request barangay documents online and follow their status live. At the hall they take a queue number from their phone or a kiosk, and a "Now Serving" TV announces each call with a chime and a voice. Staff serve the queue from their counters, and the punong barangay (kapitan) approves documents and reads the reports.

It is a portfolio project. It shows skills that Jomari's live apps do not show yet and that Philippine junior developer job posts ask for: **real-time features with Socket.io (WebSockets)**, a **NestJS** API (structured like ASP.NET Core, which matches Jomari's C# background), **Next.js** with internationalization (**English and Filipino**), safe **concurrency** in PostgreSQL (two counters never call the same number), **QR document verification**, and a **3D** landing scene.

### 1.1 What Jomari asked for (decided during brainstorming)

- Core: document requests **and** a walk-in queue.
- Four roles: Residente, Staff (at a counter), Kapitan/Admin, and a public "Now Serving" TV display with no login.
- Each visitor gets a private demo barangay, opened in one click and deleted after 24 hours. The visitor can switch between all roles, open the TV display in a new tab, and scan a QR code with a phone to join as a resident. Simulated residents keep the demo alive and can be turned off.
- Five documents: Barangay Clearance, Certificate of Residency, Certificate of Indigency (free), Business Clearance and Barangay ID.
- Request flow: the resident enters a purpose, staff review, the kapitan approves, the request becomes "Ready for pickup", and every change shows live. At pickup the resident queues, shows an ID in person and pays cash at the counter; staff record the official receipt (OR) number.
- Each released document has a QR code that opens a public "Verify document" page.
- No ID uploads and no online payment.
- Queue: three lanes, Priority (P-001, for seniors, PWD and pregnant women), Documents (D-001) and General (G-001). Numbers come from a virtual queue on the phone or from a kiosk.
- "Call next" shows "D-012 → Counter 2" on the TV with a chime and a spoken announcement. The resident's phone shows their live position and estimated wait, alerts them when 3 people are ahead and when called. A no-show is called again up to 2 times, then marked Missed, and can rejoin. Numbers restart at 001 every day.
- Stack: Next.js + NestJS + Socket.io + PostgreSQL (Neon), the API in Docker on Render, the web app on Netlify.
- Language: an EN/FIL toggle for every screen, with a Filipino voice on the TV.
- Design: the Figma Community file "Donka Help Desk — Internal Request System" by Dayse, recoloured from pink to **forest green** (section 11.1).
- 3D landing: a glowing 3D queue ticket "D-012" behind vertical reeded-glass slats, inspired by the Spline scene "Reeded liquid glass – Prism hero section concept" and rebuilt in React Three Fiber. On scroll the ticket turns to D-013, as if the next number were called.

### 1.2 Assumptions (correct these if wrong)

- Only free tiers are used, with no credit card: Netlify, Render, Neon and GitHub Actions.
- The main users are recruiters trying the demo. The features still match how a real barangay hall works.
- The UI uses a light theme only, like the reference. A dark theme is out of scope.
- Time is Asia/Manila. "Today" means the Manila calendar day. Money is in Philippine pesos, stored as integer centavos.
- All people, names and the barangay in the demo are fictional ("Barangay Masagana").
- The TV display runs on a 1080p landscape screen in a browser. The kiosk runs on a tablet in a browser.
- There is no offline mode: the queue needs a live connection.

### 1.3 Success criteria

1. A visitor goes from the landing page to a number called and announced on the TV tab in under 2 minutes, including the API waking up.
2. When the API is awake, a call appears on the TV in under 1 second after staff press "Call next".
3. Twenty concurrent "Call next" requests from different counters call twenty different tickets, and a lane never issues the same number twice in a day.
4. A resident cannot do staff actions, staff cannot approve documents, and a display or kiosk key cannot change anything beyond issuing a kiosk ticket, even by calling the API directly.
5. No barangay can read or receive another barangay's data, through REST or Socket.io.
6. A released document's QR code opens a page that says "Valid"; an unknown code says "Not found".
7. Every user-facing string exists in English and Filipino.
8. The landing page scores at least 90 for Performance and 100 for Accessibility in Lighthouse (mobile).
9. CI passes on every push, and the same Docker image runs locally, in CI and on Render.

## 2. Scope

### 2.1 In scope

- Landing page with the 3D ticket scene, "Try the demo", the API wake-up and a Credits page.
- Demo barangay creation with seeded data, demo logins for every role, a demo panel to switch roles and open the TV and kiosk, the simulator toggle and a 24-hour expiry.
- Login for kapitan (username + password), staff (username + 6-digit PIN) and residents (username + password); refresh and logout.
- Resident: request a document, follow its status, cancel while it is still Submitted, take a queue number, see the live position and estimated wait, alerts.
- Staff: the request board (review, forward, reject), the counter screen (call next, call again, served, missed, rejoin, release a document at pickup), print the document.
- Kapitan: approvals with an electronic signature, revoking a released document, document types and fees, counters and their lanes, staff accounts, display and kiosk keys, reports.
- TV display ("Now Serving") with a chime and text-to-speech. Kiosk for walk-in numbers. A public "Verify document" page. A printable A4 document with a QR code.
- EN/FIL toggle on every screen. Responsive layouts: phone for residents, tablet and desktop for staff, 1080p for the TV.

### 2.2 Out of scope

- Real sign-up, email, SMS, password reset by email.
- Online payment of any kind.
- Uploading IDs or photos.
- Web push notifications (alerts work while the resident's page is open).
- Several barangays per account, and a real (non-demo) barangay setup.
- Offline mode and a service worker.
- Printing tickets or documents directly to a printer (printing uses the browser print dialog).
- A dark theme.

## 3. User flows

### 3.1 Recruiter (first visit)

1. Opens the landing page. The page pings the API's `/health` directly so the free Render instance starts waking up. The 3D ticket starts on the first pointer move, key press or scroll.
2. Clicks "Try the demo". If the API is still waking, the button shows "Opening your barangay… (the free server takes up to a minute to wake up)".
3. The demo barangay is created and the visitor is signed in as staff at Counter 2. The demo panel shows the role switcher (Kapitan, Staff – Counter 2, Residente – Juan Dela Cruz), "Open TV display", "Open kiosk", a QR code that opens the resident view on a phone, the simulator toggle and "Demo barangay, deleted in 23 h".
4. Opens the TV display in a new tab and presses "Start display" to allow sound.
5. Presses "Call next" on the counter and sees and hears "D-012, Counter 2" on the TV within a second. Simulated residents keep joining the queue, and the simulated staff at Counter 1 keeps calling.
6. Switches to the resident, requests a Barangay Clearance, switches to staff to forward it and to the kapitan to approve it, and watches each status change arrive live.
7. As the resident, takes a Documents number for pickup; as staff, calls it, records the OR number, releases the document and prints it. Scans its QR code with a phone and sees "Valid".

### 3.2 Residente

Home ("Ano ang kailangan mo?") → choose a document chip → enter the purpose (with quick chips: Employment, School, Bank, Travel, Others) → submit → follow the status timeline on "My requests" → when "Ready for pickup", tap "Get a number for pickup" (Documents lane, linked to the request) → watch "3 ahead · about 9 min" → alert at 3 ahead → full-screen "Ikaw na! Counter 2" when called.

### 3.3 Staff (counter)

Open the counter (choose the counter if not assigned) → "Call next" → the ticket card shows the code, lane and the linked request if any → serve → "Served" (or "Call again", then "Missed") → for a pickup: confirm the ID was shown, enter the OR number when the fee is above zero, "Release" → "Print" the document. Between calls, review new requests on the request board: forward to the kapitan or reject with a reason.

### 3.4 Kapitan

Approvals → open a request → "Approve and sign" or "Reject" with a reason → Reports (today, 7 and 30 days) → Settings: document types and fees, counters and lanes, staff, display and kiosk keys, simulator.

### 3.5 TV display and kiosk

- **TV:** opened from the demo panel or with its display link. "Start display" enables sound. The screen shows each open counter with its current number, the last 5 calls, waiting counts per lane, the barangay name, the date and the time. A call flashes, plays a chime and speaks the announcement.
- **Kiosk:** three large buttons (Priority, Documents, General). The ticket screen shows the number, the people ahead and a QR code that opens the ticket's live page on a phone. It returns to the start after 15 seconds.

### 3.6 Anyone verifying a document

Scans the QR code or opens `/verify` and types the code → sees "Valid" (document type, name, issue date, valid until, barangay), "Expired", "Revoked" or "Not found".

## 4. Architecture

```
Browser (Next.js 16 on Netlify)
 ├─ pages and assets ─────────────────────────────► Netlify CDN and Netlify Next.js runtime
 ├─ REST: /api/* (same origin) ──► Netlify signed proxy ──► Render: Docker (NestJS API) ──► Neon PostgreSQL
 ├─ Real-time: wss://bqueue-api.onrender.com (Socket.io, direct) ◄── 60-second socket ticket from POST /api/realtime/ticket
 └─ wake-up ping: GET https://bqueue-api.onrender.com/api/health (direct, CORS for the site origin only)
```

- Business requests share one origin through the Netlify proxy, exactly as in ZariZari: Netlify signs each proxied request with an HS256 JWS in `x-nf-sign`, and the API refuses every route except `/api/health` when the signature is missing or invalid. The refresh cookie is first-party.
- Netlify cannot proxy WebSockets, so Socket.io connects straight to Render. The browser first asks the API (through the signed proxy) for a **socket ticket**: a JWT with a 60-second lifetime that names the barangay, the subject (user, display, kiosk or ticket tracker) and the rooms it may join. The socket server verifies the ticket and the `Origin` header, then joins the rooms the ticket allows. A browser never chooses its rooms.
- **All writes go through REST.** The socket channel only pushes events from the server. After a write commits, the API emits events to the affected rooms.
- The Netlify proxy times out after 26 seconds, so the client waits for the direct `/health` before proxied calls while the API is waking, and every request stays short.

### 4.1 Tech stack

| Area | Choice |
|---|---|
| Web | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Real-time client | `socket.io-client` 4 |
| i18n | `next-intl` 4, locale in a cookie, no locale prefix in URLs |
| 3D | three.js with React Three Fiber and drei (`MeshTransmissionMaterial`, `RoundedBox`, `Text`), built from primitives |
| QR | `qrcode` (generate) on the web; the verify page also accepts typed codes |
| API | NestJS 12 on Node.js (current LTS), Socket.io 4 through `@nestjs/websockets` and `@nestjs/platform-socket.io`, zod validation through a pipe, pino logs, helmet |
| Auth | `jose` (JWT HS256), argon2id password and PIN hashing |
| Database | PostgreSQL on Neon, Prisma 7 with the `pg` adapter |
| Shared | zod schemas, enums, ticket codes, ETA math, Filipino number words, i18n message keys |
| Tests | Vitest (web, shared, and the API with SWC for decorators), Supertest, `socket.io-client` in API tests, Testing Library, Playwright, axe |
| CI/CD | GitHub Actions, Docker, Render auto-deploy after checks pass, Netlify builds |

Exact versions are the current stable releases at implementation time and are pinned in `package.json` (checked on 28 October 2026: Next 16.4.3, React 19.3.1, NestJS 12.3.2, Socket.io 4.8.4, Prisma 7.10.1, next-intl 4.14.9, three 0.186.1, drei 10.7.9, Tailwind 4.3.3).

### 4.2 Repository layout (npm workspaces)

```
apps/web        Next.js app (landing, demo panel, resident, staff, kapitan, display, kiosk, verify, print)
apps/api        NestJS API, Socket.io gateway, Prisma schema and migrations, simulator, Dockerfile
packages/shared zod schemas, enums, ticket codes, ETA math, number words, message keys
docker-compose.yml   api + postgres for local development
.github/workflows    ci.yml, cleanup.yml
docs/                spec, plan, diagrams, credits
```

### 4.3 Units

**API (`apps/api`), one NestJS module each**

| Module | Purpose | Depends on |
|---|---|---|
| `config` | Reads and validates environment variables at start | none |
| `prisma` | Prisma client with the `pg` adapter | config |
| `common` | Global proxy-signature guard, error filter (section 9.9), zod validation pipe, client IP | config |
| `auth` | Login, lockout, sessions and refresh rotation, logout, `JwtAuthGuard`, `RolesGuard` with `@Roles()` | prisma |
| `demo` | Creates and seeds demo barangays, demo limits, cleanup of expired barangays | prisma, auth |
| `documents` | Document types, requests and their state machine, release, revoke, verification | prisma, realtime |
| `queue` | Tickets, daily sequences, counters, call next and the other counter actions, ETA | prisma, realtime |
| `realtime` | Socket tickets, the Socket.io gateway, room membership, the event emitter, revoking a user's sockets | auth, config |
| `reports` | Request and queue summaries | prisma |
| `settings` | Counters, staff, display and kiosk keys, simulator toggle | prisma, auth, realtime |
| `simulator` | Simulated residents and the simulated Counter 1 staff | queue, documents |
| `domain/*` (plain TypeScript) | Pure functions: request transitions, lane order, ETA, ticket codes, Manila day | none |

Every service method takes the `barangayId` from the authenticated subject as its first argument, and every query filters by it.

**Web (`apps/web`)**

| Unit | Purpose |
|---|---|
| `app/` | App Router routes, layouts, the right-hand icon navigation, error boundaries, `proxy.ts` for the CSP nonce |
| `lib/api` | Typed REST client using the shared schemas; refresh on 401 |
| `lib/auth` | In-memory access token, refresh on load, demo logins kept on the device for role switching |
| `lib/realtime` | Socket ticket fetch, connect and reconnect, version tracking, resync |
| `features/resident`, `staff`, `kapitan`, `display`, `kiosk`, `verify`, `print`, `demo` | Screens and their components |
| `landing/` | Landing page and the lazily loaded 3D scene |
| `messages/en.json`, `messages/fil.json` | Every user-facing string |

### 4.4 Key interfaces

```ts
// apps/api/src/queue/queue.service.ts
callNext(barangayId: string, staff: AuthUser, counterId: string): Promise<TicketView>
finish(barangayId: string, staff: AuthUser, ticketId: string, outcome: "SERVED" | "MISSED"): Promise<TicketView>
callAgain(barangayId: string, staff: AuthUser, ticketId: string): Promise<TicketView>
takeTicket(barangayId: string, subject: ResidentOrKiosk, input: TakeTicketInput): Promise<{ ticket: TicketView; duplicate: boolean }>

// apps/api/src/documents/requests.service.ts
transition(barangayId: string, actor: AuthUser, requestId: string, action: RequestAction): Promise<RequestView>

// apps/api/src/realtime/events.service.ts
emitQueueChanged(barangayId: string, version: bigint): Promise<void>
emitTicketPositions(barangayId: string): Promise<void>
emitRequestUpdated(barangayId: string, request: RequestView): void

// packages/shared
ticketCode(lane: Lane, number: number): string           // "D-012"
etaMinutes(ahead: number, avgServiceSeconds: number, openCounters: number): number
filipinoDigits(code: string): string                     // "D-012" → "D, sero, isa, dalawa"
```

## 5. Data model (PostgreSQL via Prisma)

All ids are UUIDs unless noted. Every table except `Barangay` and `DemoQuota` has `barangayId` (directly or through its parent) with `ON DELETE CASCADE`, so deleting a barangay deletes all of its data. Every foreign key has an index (a lesson from ZariZari, where missing indexes made cleanup slow). Money is integer centavos. Times are `timestamptz`.

| Table | Columns | Notes |
|---|---|---|
| `Barangay` | `id`, `code` (4 chars, unique), `name`, `city`, `queueVersion` (bigint), `simulatorOn`, `lastHumanActionAt`, `displayKeyHash`, `kioskKeyHash`, `joinCodeHash`, `joinCodeExpiresAt`, `createdAt`, `expiresAt` | Demo barangays expire 24 h after creation; `queueVersion` rises with every queue change; the join code signs a phone in as the demo resident (section 7.5) |
| `User` | `id`, `barangayId`, `role` (`KAPITAN`, `STAFF`, `RESIDENT`), `username` (unique), `displayName`, `secretHash`, `secretKind` (`PASSWORD` or `PIN`), `failedAttempts`, `lockedUntil`, `active`, `createdAt` | Usernames look like `kapitan.7k2f`, `staff2.7k2f`, `juan.7k2f` |
| `Session` | `id`, `userId`, `familyId`, `tokenHash` (unique), `expiresAt`, `revokedAt`, `replacedById` | Refresh rotation, as in ZariZari |
| `Resident` | `id`, `barangayId`, `userId` (nullable, unique), `fullName`, `birthDate`, `sex`, `civilStatus`, `purok` (1–7), `addressLine`, `residentSince` (year), `createdAt` | Seeded residents without a login are used by the simulator |
| `DocumentType` | `id`, `barangayId`, `code` (`CLEARANCE`, `RESIDENCY`, `INDIGENCY`, `BUSINESS`, `BRGY_ID`), `nameEn`, `nameFil`, `feeCentavos`, `processingDays`, `validityDays`, `needsBusinessName`, `active` | Unique (`barangayId`, `code`) |
| `Request` | `id` (client UUID), `barangayId`, `residentId`, `documentTypeId`, `purpose`, `businessName` (nullable), `status`, `feeCentavos` (snapshot), `rejectReason`, `approvedById`, `approvedAt`, `orNumber`, `releasedById`, `releasedAt`, `verificationCode` (unique, nullable), `validUntil`, `revokedAt`, `revokeReason`, `createdAt`, `updatedAt` | The client id makes submission idempotent |
| `RequestEvent` | `id`, `requestId`, `fromStatus`, `toStatus`, `actorId` (nullable: null when the actor is a seeded resident without a login, acting through the simulator), `note`, `createdAt` | Append-only history |
| `Counter` | `id`, `barangayId`, `name`, `lanes` (enum array), `staffId` (nullable), `open`, `currentTicketId` (nullable, unique), `sortOrder` | At most one current ticket per counter |
| `QueueTicket` | `id` (client UUID), `barangayId`, `day` (Manila date), `lane` (`PRIORITY`, `DOCUMENTS`, `GENERAL`), `number`, `code`, `status`, `source` (`PHONE` or `KIOSK`), `residentId` (nullable), `requestId` (nullable), `trackingTokenHash` (kiosk tickets), `queuedAt`, `calledAt`, `servedAt`, `counterId`, `callCount`, `rejoined`, `createdAt` | Unique (`barangayId`, `day`, `lane`, `number`) |
| `QueueSequence` | `barangayId`, `day`, `lane`, `lastNumber` | Primary key (`barangayId`, `day`, `lane`); the daily counter behind ticket numbers |
| `DemoQuota` | `ipHash`, `day`, `count` | Demo creation limit per IP per day |

Request statuses: `SUBMITTED`, `FOR_APPROVAL`, `READY_FOR_PICKUP`, `RELEASED`, `REJECTED`, `CANCELLED`. Ticket statuses: `WAITING`, `CALLED`, `SERVED`, `MISSED`, `CANCELLED`.

Indexes, besides foreign keys: `QueueTicket(barangayId, day, status, lane, queuedAt)`, `Request(barangayId, status, createdAt)`, `Barangay(expiresAt)`.

**Invariants (checked by tests):** a counter has at most one `CALLED` ticket; a lane never repeats a number in a day; every status change has a `RequestEvent`; `verificationCode` exists only when the status is `RELEASED`.

## 6. Business rules

1. **Request transitions.**

   | From | Action | To | Who |
   |---|---|---|---|
   | — | submit | `SUBMITTED` | Resident |
   | `SUBMITTED` | cancel | `CANCELLED` | The resident who submitted it |
   | `SUBMITTED` | forward | `FOR_APPROVAL` | Staff, Kapitan |
   | `SUBMITTED`, `FOR_APPROVAL` | reject (reason required) | `REJECTED` | Staff from `SUBMITTED`; Kapitan from either |
   | `FOR_APPROVAL` | approve and sign | `READY_FOR_PICKUP` | Kapitan |
   | `READY_FOR_PICKUP` | release (ID checked; OR number when the fee is above zero) | `RELEASED` | Staff, Kapitan |
   | `RELEASED` | revoke (reason required) | stays `RELEASED`, `revokedAt` set | Kapitan |

   Any other move answers `409 invalid_transition`. Each move writes a `RequestEvent` in the same transaction.
2. **Release.** Release sets the OR number (format `OR-` plus 4 to 10 digits; skipped for free documents), a unique 10-character verification code (Crockford base32, about 50 bits, from a cryptographic random source), and `validUntil = releasedAt + validityDays`.
3. **Fees and validity (seeded defaults).** Clearance ₱100, valid 180 days. Residency ₱75, 180 days. Indigency free, 180 days. Business Clearance ₱500, 365 days, needs the business name. Barangay ID ₱50, 365 days. The kapitan can change fees and activate or deactivate types; a request keeps the fee it was submitted with.
4. **Ticket numbers.** Taking a ticket runs `INSERT … ON CONFLICT (barangayId, day, lane) DO UPDATE SET lastNumber = lastNumber + 1 RETURNING lastNumber` and inserts the ticket in the same transaction, so numbers are unique and gap-free under concurrency. The code is the lane letter, a hyphen and three digits (`P-001`, `D-012`, `G-105`); after 999 the number keeps its digits (`D-1000`).
5. **Call next.** In one transaction:
   1. Lock the counter row.
   2. Refuse with `409 counter_busy` when the counter still has a `CALLED` ticket.
   3. Pick the next ticket with `SELECT … FOR UPDATE SKIP LOCKED LIMIT 1`, from today's `WAITING` tickets in the lanes the counter serves. Priority-lane tickets come first, then the earliest `queuedAt`, then the lowest number.
   4. Set it `CALLED` with the counter and `calledAt`, increment `callCount`, and increment `Barangay.queueVersion`.

   `SKIP LOCKED` lets concurrent counters take different tickets without waiting. When nothing waits, the answer is `200` with `ticket: null`.
6. **Call again, served, missed, rejoin.** "Call again" re-announces a `CALLED` ticket, up to 3 calls in total (`409 call_limit` after that). "Served" sets `SERVED` and `servedAt`. "Missed" sets `MISSED`. A missed ticket can rejoin once, by its resident or by staff: it becomes `WAITING` again with a new `queuedAt` (the end of its lane) and keeps its code.
7. **One active ticket per lane.** A resident can hold at most one `WAITING` or `CALLED` ticket per lane (`409 already_in_queue`, with the existing ticket). A pickup ticket for a request must be in the Documents lane, and the request must be `READY_FOR_PICKUP` and belong to the resident.
8. **Kiosk tickets.** A kiosk ticket has no resident. Its page is opened with a random tracking token in the QR code; only the token's hash is stored. The kiosk key allows at most 10 tickets per minute per barangay.
9. **Estimated wait.**
   - `ahead` counts the `WAITING` tickets that would be called before this one: earlier tickets in its own lane, plus every waiting Priority ticket when its lane is Documents or General.
   - `avgServiceSeconds` is the average of `servedAt − calledAt` over the last 10 tickets served today in that lane, or 240 seconds when there are none.
   - `etaMinutes = ceil(ahead × avgServiceSeconds ÷ 60 ÷ max(1, open counters serving the lane))`.
   - The UI says "about N min" and never shows less than 1 minute.
10. **Day boundary.** Numbers restart each Manila day. Tickets from earlier days that are still `WAITING` or `CALLED` become `CANCELLED` the first time the queue is read on a new day, and in the daily cleanup.
11. **Idempotency.** Request submission and ticket taking use client-generated ids. Repeating an id returns the stored record (`duplicate: true`) and changes nothing.
12. **Barangay isolation.** Every query filters by the `barangayId` of the authenticated subject. Ids from another barangay answer 404. Socket rooms are named by barangay and assigned only by the server.
13. **Server time is the only clock.** Every time (`queuedAt`, `calledAt`, status dates, the Manila day) comes from the server. The device clock never decides anything (a lesson from ZariZari's deferred minors).
14. **Free-tier protection.**
    - At most 5 demo barangays per IP per day, and at most 200 active at once.
    - At most 3 open requests per resident.
    - At most 300 requests per barangay, and at most 500 tickets per barangay per day. The simulator stops at these caps.

## 7. Authentication and roles

### 7.1 Login and lockout

- Kapitan and residents: username + password (demo passwords are generated, 16 characters). Staff: username + 6-digit PIN (the kapitan sets it; PINs such as 000000 or 123456 are refused).
- Secrets are hashed with argon2id. A wrong secret or an unknown user returns the same `invalid_credentials`.
- After 5 wrong attempts the account is locked for 15 minutes (`account_locked` with the retry time). A rate limit per IP also applies.

### 7.2 Tokens

- **Access token:** JWT HS256, 15 minutes, claims `sub`, `brgy`, `role`; kept in memory and sent as `Authorization: Bearer`.
- **Refresh token:** 32 random bytes, stored as a SHA-256 hash in `Session`, sent as the cookie `__Host-bq_refresh` (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`), valid until the barangay expires.
- **Rotation:** each refresh issues a new token and marks the old one replaced; reusing a replaced token revokes the whole family.
- **The cookie is cleared only on a 401 answer**, never on a 5xx or a network error. This avoids ZariZari's deferred minor M1, where a passing database error signed the device out.
- **CSRF:** business endpoints use the bearer token; the refresh endpoint also requires the header `X-Requested-With: bqueue`.
- **Logout and deactivation** revoke the sessions and disconnect the user's sockets (`session:revoked`).

### 7.3 Socket tickets and keys

- `POST /api/realtime/ticket` (signed in) returns a socket ticket: JWT HS256 with its own secret, `aud: "bq-socket"`, a 60-second lifetime, a single-use `jti`, the barangay and the allowed rooms. The used `jti` values are remembered in memory until they expire (one API instance).
- **Display key and kiosk key:** 32 random bytes each, stored as hashes on the barangay. The display link is `/display#<key>` and the kiosk link `/kiosk#<key>`; the key sits in the URL fragment, so it is never sent in requests or logs. The page posts the key to `POST /api/realtime/display-ticket` or `POST /api/realtime/kiosk-ticket` for a socket ticket that may join only the barangay's public room. The kiosk key also authorizes `POST /api/kiosk/tickets`. The kapitan can rotate either key, which disconnects its sockets.
- **Kiosk ticket tracker:** the QR code opens `/t#<trackingToken>`; the page exchanges the token for a socket ticket that joins only that ticket's room.

### 7.4 Permissions

| Action | Kapitan | Staff | Resident | Display key | Kiosk key |
|---|---|---|---|---|---|
| Submit, cancel own requests; take own tickets; rejoin own missed ticket | — | — | ✅ | — | — |
| See own requests and tickets | — | — | ✅ | — | — |
| Request board: forward, reject from Submitted | ✅ | ✅ | — | — | — |
| Approve and sign; reject from For approval; revoke | ✅ | — | — | — | — |
| Counter actions (including rejoin of a missed ticket); release at pickup; print | ✅ | ✅ | — | — | — |
| Watch the public queue (TV) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Issue a walk-in ticket (staff and kapitan open the kiosk link for this) | — | — | — | — | ✅ |
| Reports; settings (fees, counters, staff, keys, simulator) | ✅ | — | — | — | — |

The API enforces this table with guards. Responses for residents never include other residents' data.

### 7.5 Demo barangays

- `POST /api/demo` creates "Barangay Masagana", Lungsod ng Kalayaan (fictional), with a random 4-character code. It seeds the following, using batched `INSERT … SELECT FROM unnest(…)` statements so creation stays under 5 seconds on Render's free CPU (a lesson from ZariZari):
  - **People:** Kapitan Hon. Teresa Villanueva; two staff, Ate Liza (Counter 1, run by the simulator) and Kuya Ramil (Counter 2, for the visitor); the resident Juan Dela Cruz, with a login; and 40 more residents without logins.
  - **Counters:** Counter 1 and Counter 2 (all three lanes, open), and Counter 3 (closed).
  - **Documents:** the five document types with the default fees.
  - **History:** 30 days of past requests and tickets, so the reports have data.
  - **Today:** a few requests in every status, and 6 to 10 waiting tickets.
- The response signs the visitor in as Kuya Ramil (staff, Counter 2) and returns the demo logins, the display link and the kiosk link once. The web app keeps them on the device for the role switcher and the "Open TV display" button.
- **Joining from a phone:** the demo panel's QR code holds a link `/join#<code>`.
  - The code is 128 random bits, single-use, valid for 10 minutes, and stored only as a hash on the barangay.
  - The phone posts it to `POST /api/demo/join` and is signed in as Juan Dela Cruz. The code works only for that demo resident account.
  - "New QR code" in the demo panel issues a fresh code (`POST /api/demo/join-code`, signed in as any demo account of the barangay).
  - No password is typed on the phone.
- Expired barangays are deleted when a new demo barangay is created and by the daily GitHub Actions job.

## 8. Real-time

### 8.1 Rooms

| Room | Members | Purpose |
|---|---|---|
| `b:{id}:public` | Everyone in the barangay, displays, kiosks | Queue state and calls |
| `b:{id}:staff` | Staff and kapitan | Requests and counters |
| `u:{userId}` | One signed-in user | Their requests and tickets; session revocation |
| `t:{ticketId}` | A kiosk ticket's tracker page | That ticket's position and call |

### 8.2 Events (server → client)

| Event | Room | Payload |
|---|---|---|
| `queue:state` | the joining socket | Full snapshot: `version`, counters (name, open, current code), waiting counts per lane, last 5 calls |
| `queue:changed` | `public` | Same shape as `queue:state` |
| `queue:called` | `public` | `version`, `code`, `lane`, `counterName`, `callCount` |
| `ticket:updated` | `u:` or `t:` | `ticketId`, `status`, `ahead`, `etaMinutes`, `counterName` |
| `request:created` | `staff` | Request summary |
| `request:updated` | `staff`, `u:` (the requester) | `requestId`, `status`, `updatedAt` |
| `session:revoked` | `u:` | The client signs out |

Clients never emit business events.

### 8.3 Versions and resync

Every queue change increments `Barangay.queueVersion` in its transaction, and the events carry the new version. A client that sees a gap (for example 41, then 43) or reconnects fetches `GET /api/queue/state` and continues from the returned version, so a missed event never leaves a stale screen.

### 8.4 Connection life

- Socket.io uses WebSocket first, with long-polling as the fallback; CORS and the `Origin` check allow only the site origin.
- On disconnect, the UI shows "Reconnecting…" and Socket.io retries with backoff. Each reconnect fetches a new socket ticket.
- **The TV pauses itself after 30 minutes without queue changes** ("Display paused. Tap to resume") and disconnects. This saves the free Render instance hours and Neon compute (section 17).
- The simulator runs only while a barangay has at least one connected socket, and stops 2 minutes after the last one leaves.

### 8.5 Simulator

- Every 15 to 40 seconds while it is on, a seeded resident does one thing: submits a request (55%) or takes a ticket in a random lane (Documents 50%, General 30%, Priority 20%).
- About every 45 seconds, Ate Liza at Counter 1 finishes her current ticket (Served 90%, Missed 10%) and calls the next.
- Simulated actions use the same services as people, so they emit the same events and pass the same rules.
- The visitor processes requests; the simulator never forwards or approves them.
- The simulator pauses itself 20 minutes after the last action by a person (any REST write not made by the simulator, tracked in `Barangay.lastHumanActionAt`). A forgotten TV tab therefore stops changing, pauses after its own 30 minutes, and lets the free server sleep. The next action by a person resumes the simulator when it is switched on.

## 9. API contracts

All routes are under `/api`, accept and return JSON, and are validated with the shared zod schemas.

### 9.1 Health, demo and admin

| Route | Access | Notes |
|---|---|---|
| `GET /health` | public, direct or proxied | `{ ok: true }`; CORS for the site origin only |
| `POST /demo` | public | 201 `{ accessToken, user, barangay, demoLogins, displayLink, kioskLink, joinLink, expiresAt }`; 429 `demo_limit`; 503 `demo_full` |
| `POST /demo/join` | public, rate-limited | `{ code }` → signs in as the barangay's demo resident; 401 `invalid_credentials` for a used, expired or unknown code |
| `POST /demo/join-code` | any signed-in account of the barangay | Returns a fresh `joinLink`; the previous code stops working |
| `POST /admin/cleanup` | secret header | Deletes expired barangays and closes old tickets; returns `{ deleted }` |

### 9.2 Auth

`POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /me`, with the same shapes as ZariZari (section 7).

### 9.3 Documents and requests

| Route | Role | Notes |
|---|---|---|
| `GET /document-types` | any signed in | Active types with names in both languages |
| `POST /requests` | Resident | `{ id, documentTypeId, purpose, businessName? }` → 201 or 200 `duplicate` |
| `GET /requests` | any signed in | Residents get their own; staff and kapitan filter by status |
| `GET /requests/:id` | owner resident, staff, kapitan | With its events |
| `POST /requests/:id/{cancel,forward,reject,approve,release,revoke}` | per section 7.4 | `reject` and `revoke` need `reason`; `release` needs `idChecked: true` and `orNumber` when the fee is above zero |
| `GET /requests/:id/document` | owner resident, staff, kapitan | Data for the printable document |
| `GET /verify/:code` | public, rate-limited | `{ status: VALID, EXPIRED or REVOKED, documentName, fullName, issuedAt, validUntil, barangay }` or 404 |

### 9.4 Queue

| Route | Role | Notes |
|---|---|---|
| `GET /queue/state` | any signed in, display or kiosk | Same shape as `queue:state` |
| `POST /queue/tickets` | Resident | `{ id, lane, requestId? }` → ticket with `ahead` and `etaMinutes` |
| `GET /queue/tickets/mine` | Resident | Today's tickets |
| `POST /kiosk/tickets` | kiosk key | `{ id, lane }` → ticket and the tracking token (shown once in the QR) |
| `POST /queue/tickets/:id/rejoin` | the owner resident, staff, kapitan | Missed tickets only, once |
| `POST /counters/:id/call-next` | Staff, Kapitan | Section 6, rule 5 |
| `POST /queue/tickets/:id/{call-again,served,missed}` | Staff, Kapitan | Only on the counter's current ticket |
| `POST /counters/:id/{open,close,assign}` | Staff (own counter), Kapitan | Close is refused while a ticket is called |

### 9.5 Real-time

`POST /realtime/ticket` (signed in), `POST /realtime/display-ticket` (`{ key }`), `POST /realtime/kiosk-ticket` (`{ key }`) and `POST /realtime/tracker-ticket` (`{ token }`), each → `{ ticket, url, expiresIn: 60 }`.

### 9.6 Reports (Kapitan)

`GET /reports/summary?range=today|7d|30d` returns:
- **Requests:** by type and status; average days from Submitted to Ready; released count; fees collected.
- **Queue:** tickets per lane; average wait (`calledAt − queuedAt`) and average service time per lane; no-show rate; tickets by hour.

### 9.7 Settings (Kapitan)

`GET/PATCH /settings/document-types/:id` (fee, active), `GET/POST/PATCH /settings/counters`, `GET/POST/PATCH /settings/staff` (add, reset PIN, deactivate), `POST /settings/keys/{display,kiosk}/rotate` (returns the new link once), `PATCH /settings/simulator` (`{ on }`).

### 9.8 Rate limits

Login 20 per 15 minutes per IP; demo join 10 per minute per IP; verify 30 per minute per IP; kiosk tickets 10 per minute per barangay; demo creation per section 6, rule 14. Limits answer `429` with `RateLimit` headers (draft-8), as in ZariZari.

### 9.9 Errors

Every error uses `{ "error": { "code": string, "message": string, "field"?: string, "retryAfter"?: string } }`. The `message` is in the language of the `Accept-Language` header (`en` or `fil`).

| Status | Codes |
|---|---|
| 400 | `invalid_input` |
| 401 | `unauthenticated`, `invalid_credentials`, `session_expired` |
| 403 | `forbidden`, `bad_proxy_signature` |
| 404 | `not_found` |
| 409 | `invalid_transition`, `counter_busy`, `call_limit`, `already_in_queue`, `limit_reached` |
| 423 | `account_locked` |
| 429 | `rate_limited`, `demo_limit` |
| 503 | `demo_full`, `service_unavailable` |

## 10. Display, voice and alerts

- **TV layout (1920×1080):**
  - One large card per open counter ("COUNTER 2 · D-012").
  - A banner for the newest call that pulses for 5 seconds.
  - The last 5 calls, the waiting counts per lane, the barangay name and the date and time.
  - Readable from 6 meters: ticket numbers at least 160 px tall.
- **Sound:** browsers block audio until the user interacts, so the TV starts on a "Start display" screen. After the tap it plays a short chime (our own audio file) and then speaks with the Web Speech API.
- **Announcement text:**
  - English: "Now serving D, zero, one, two, at Counter 2."
  - Filipino: "Numero D, sero, isa, dalawa, sa Counter 2."
  - Digits are read one by one with `filipinoDigits` (0 sero, 1 isa, 2 dalawa, 3 tatlo, 4 apat, 5 lima, 6 anim, 7 pito, 8 walo, 9 siyam). "Call again" repeats the announcement.
- **Voice choice:** a `fil-PH` voice for Filipino. When the device has none, the TV speaks the English text and still shows the Filipino text on screen. The display settings choose the language.
- **Resident alerts:** when `ahead` drops to 3, a banner, a short sound and a vibration where supported. When called, a full-screen "Ikaw na! Counter 2" with a sound. The tab title also changes ("(!) D-012 · B.Queue"). Each alert fires once per ticket state.
- **Screen readers:** calls are announced through an `aria-live="assertive"` region on the TV, kiosk and ticket pages.

## 11. UI and 3D

### 11.1 Visual reference and credit

The UI follows **"Donka Help Desk — Internal Request System" by Dayse** from the Figma Community (https://www.figma.com/community/file/1632877364892925660/donka-help-desk-internal-request-system), a free file under **CC BY 4.0**, which allows adaptation with attribution.

- **What we keep:** the warm off-white canvas; white cards with soft shadows and large radii; a bold sans for headings and a serif for card titles; a display serif for the brand; pill tags and chips; the floating vertical icon navigation on the right; the centred composer card; and the curved connector lines with dots between cards.
- **What we change:**
  - the accent, from pink to forest green
  - the brand (no Donka name or logo)
  - all content (barangay documents and queues instead of marketing requests)
  - the screens, to fit barangay flows
  - the icons

Credit text, shown on the Credits page and in the README: *UI adapted from "Donka Help Desk — Internal Request System" by Dayse (Figma Community), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Changes: forest green accent, new brand, barangay screens and content, icons.*

The 3D landing is inspired by the Spline scene "Reeded liquid glass – Prism hero section concept". No file, mesh or code from that scene is used; the scene is rebuilt from primitives. The Credits page names it as inspiration.

### 11.2 Design tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F8F7F4` | Page canvas |
| `--surface` | `#FFFFFF` | Cards |
| `--raised` | `#F1EFEA` | Chips, inputs, metric tiles |
| `--text` | `#1A1A1A` | Body text |
| `--muted` | `#5F5E5A` | Supporting text |
| `--accent` (replaces Donka's pink) | `#1F7A4D` | Buttons, links, active navigation, connectors |
| `--accent-tint` | `#E2F1E8` | Tag and chip backgrounds, TV call banner |
| `--accent-ink` | `#0F4029` | Text on `--accent-tint`; TV numbers |
| `--on-accent` | `#FFFFFF` | Text on `--accent` |
| `--lime` | `#C6F432` | 3D highlights and the landing CTA ring only, never text |
| `--danger` | `#B42318` | Errors, Rejected |
| `--warning` | `#8A5206` | Missed, warnings |

Every text pair passes WCAG AA (4.5:1). A unit test checks the pairs so a later token change cannot break contrast. Radius: 20 px cards, 999 px pills, 12 px inputs.

**Fonts:**
- The sans and serif families are read from the Figma file at implementation time and self-hosted with `next/font`, using free licences only.
- If a family in the file is not free, the fallbacks are Inter (sans), Noto Serif (serif) and Bodoni Moda (display), all under the SIL Open Font License.

### 11.3 Screens

Landing, Credits, Demo panel, Login, Resident home, Request form, My requests (timeline), My ticket, Staff request board, Counter, Release dialog, Print document (A4), Kapitan approvals, Reports, Settings (document types, counters, staff, keys, simulator), TV display, Kiosk, Kiosk ticket tracker, Verify, 404.

How Donka maps to B.Queue:
- The Cover becomes the landing hero.
- The Home composer becomes the resident's "Ano ang kailangan mo?".
- The Explore cards with connectors become the request status timeline.
- The icon rail becomes the staff and kapitan navigation.
- The Article card becomes the printable document.

### 11.4 3D ticket (landing)

- **Scene:**
  - About 14 vertical reeded-glass slats (thin rounded boxes) with drei `MeshTransmissionMaterial`: low roughness, index of refraction around 1.5, slight chromatic aberration.
  - Behind the slats, a rounded 3D ticket card in forest green with lime edges, showing "D-012" with drei `Text` and a local font file.
  - A soft green glow, a mint backdrop and a floor shadow.
- **Motion:**
  - Slight pointer parallax on the ticket, so the slats bend it differently as it moves.
  - A gentle float.
  - Scrolling past the hero flips the ticket from D-012 to D-013, with a short spring animation and no sound.
- **Performance:**
  - The scene loads only after the visitor's first pointer move, key press, scroll or touch.
  - Device pixel ratio capped at 1.5; the transmission buffer resolution capped (256 on phones, 512 on desktops); fewer slats on phones.
  - Paused when the tab is hidden or the hero is off screen.
  - A still image (`ticket-still.webp`, rendered by a tool script) shows before that, and always under reduced motion or without WebGL.
  - The landing never waits for the 3D scene.

### 11.5 Brand

- **Name:** **B.Queue**.
- **Mark:** a forest-green ticket stub with a bold "B." on it.
- **Where people see it:** the landing hero (display serif), the navigation, tab titles, the TV header, the printed document, the README and the social image.
- **Internal identifiers:** `bq` and `bqueue`, which people never see.

### 11.6 Accessibility and layout

- WCAG AA contrast and visible focus; keyboard support for every action.
- Labels on every control; `aria-live` regions for calls, status changes and errors.
- Reduced motion respected; touch targets at least 48 px (larger than usual, for senior citizens); base text 17 px.
- Layouts from 360 px phones up to the 1080p TV.
- Axe checks run in the end-to-end tests.

## 12. Internationalization

- `next-intl` with the messages in `apps/web/messages/en.json` and `fil.json`. The locale is chosen by the EN/FIL toggle, kept in a cookie and defaults to English. The TV's language comes from the display settings.
- A unit test fails when a key exists in one language and not the other, or when a message has different placeholders in each.
- Document type names come from the API in both languages. API error messages follow `Accept-Language`.
- Filipino copy uses everyday Tagalog with common English loanwords as used in barangay halls ("Ready for pickup" becomes "Puwede nang kunin"). Jomari reviews the Filipino strings before release.

## 13. Security and privacy

- **Secrets** (JWT secret, socket ticket secret, proxy signing secret, cleanup secret, IP salt, database URLs) live only in Render, Netlify and GitHub settings.
- **API hardening:** the API refuses unsigned proxied requests, uses helmet, limits JSON bodies to 32 KB, validates every input with zod, and uses parameterized queries (Prisma, and the parameterized raw SQL in rules 4 and 5).
- **Socket.io:** handshake tickets as described in section 7.3; an Origin check; server-assigned rooms; 16 KB maximum message size; the user's sockets are disconnected on logout, deactivation and key rotation.
- **Content Security Policy:**
  - `script-src 'self' 'nonce-…' 'strict-dynamic'`, with the nonce created per request in `proxy.ts`, as in ResuMatch.
  - `connect-src 'self'` plus `https://bqueue-api.onrender.com` and `wss://bqueue-api.onrender.com`.
  - `frame-ancestors 'none'`, `form-action 'self'`.
  - Also HSTS, `nosniff`, a strict referrer policy, and `Permissions-Policy` with the camera off and audio playback allowed.
  - The Netlify badge is turned off from the start, so no badge allowance is needed in the CSP (a lesson from ZariZari).
- **Credentials:** passwords and PINs use argon2id; lockout and rate limits slow down guessing.
- **Logs** contain ids, codes and timings, never secrets, names or request bodies. IPs are stored only as salted hashes, for the demo limit.
- **Verify page:** shows only the document type, name, dates and barangay, never the purpose, address or birth date. Codes are not guessable, and the page is rate-limited.
- **Demo data** is fictional and deleted after 24 hours.

## 14. Testing

| Level | Tool | Covers |
|---|---|---|
| Unit | Vitest | Request transitions table, lane order, ETA, ticket codes, Filipino digits, Manila day, message parity (EN/FIL), contrast pairs, seed invariants |
| API | Vitest + Supertest + `socket.io-client` + a real PostgreSQL (Docker locally, a service container in CI) | Every endpoint for every role and anonymous; barangay isolation for every resource and every room; 20 concurrent "Call next" calls from different counters giving 20 different tickets; 50 concurrent ticket takes giving gap-free numbers; counter busy; call limit; rejoin once; request transitions and their events; release and verification; idempotent submissions and tickets; socket ticket expiry, reuse and wrong origin; key rotation disconnecting sockets; refresh rotation and reuse; lockout; demo limits and cleanup; join codes (single use, 10-minute expiry, demo resident only); the simulator pausing 20 minutes after the last action by a person; proxy signature checks |
| Component | Testing Library | Request form, status timeline, counter actions, TV call banner, kiosk, language toggle |
| E2E | Playwright against the production builds (web and the API Docker image) | Demo → "Call next" on the counter → the TV tab shows and announces the call within 1 second (the speech call is checked through a test hook); resident on a phone viewport takes a number and sees the position move; full request flow to "Valid" on the verify page; kiosk ticket and its tracker page; EN/FIL switch; reconnect after the API restarts; reduced motion; axe checks |
| Lighthouse | Lighthouse CLI | Landing on mobile: Performance ≥ 90, Accessibility 100 |

## 15. Configuration and deployment

| Service | Settings |
|---|---|
| Neon | Project `bqueue` (PostgreSQL 17, Singapore). `DATABASE_URL` (pooled) and `DIRECT_URL` (migrations) |
| Render | Blueprint `render.yaml`: Docker web service `bqueue-api` from `apps/api/Dockerfile`, free plan, Singapore, `healthCheckPath: /api/health`, `autoDeployTrigger: checksPass`. Env: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `SOCKET_TICKET_SECRET`, `PROXY_SIGNING_SECRET`, `CLEANUP_SECRET`, `IP_HASH_SALT`, `SITE_ORIGIN`. The container runs `prisma migrate deploy`, then starts NestJS |
| Netlify | Site `bqueue`, built from the root `netlify.toml` (Next.js runtime). Redirect `/api/*` → `https://bqueue-api.onrender.com/api/:splat`, status 200, `signed = "PROXY_SIGNING_SECRET"`; security headers. Env: `PROXY_SIGNING_SECRET` (runtime), `NEXT_PUBLIC_API_WAKE_URL`, `NEXT_PUBLIC_SOCKET_URL`. "Powered by Netlify" badge off |
| GitHub Actions | `ci.yml`: install, lint, typecheck, unit and component tests, API tests with a Postgres service, Docker image build, E2E. `cleanup.yml`: daily at 03:00 Manila, `POST /api/admin/cleanup` with the secret, using the repository variables `SITE_URL` and `API_URL` |

Local development: `docker compose up` starts the API and PostgreSQL; `npm run dev -w @bq/web` starts Next.js with a rewrite of `/api` to the local API, and the socket client connects to the local API directly.

## 16. Deliverables

1. Public GitHub repository `jomari18/bqueue` with this spec, the plan, a README and diagrams. The README covers setup, architecture and credits. The diagrams are context, data flow, a request flowchart and a sequence diagram of "Call next" reaching the TV.
2. Live web app on Netlify and API on Render, connected to Neon.
3. Green CI on `main`.
4. Portfolio entry (screenshot, walkthrough video, case study) after approval, like ZariZari.

## 17. Risks and mitigations

| Risk | Mitigation |
|---|---|
| The Render free instance sleeps (about 1 minute to wake) | Wake-up ping on landing; clear waiting message; reconnect with resync; the TV shows "Reconnecting…" |
| Render free hours (750 a month) are shared with `zarizari-api` on the same workspace, and an open TV or socket may keep the instance awake | The TV pauses after 30 minutes without changes; the simulator stops without clients; check usage in the Render dashboard after launch |
| Netlify cannot proxy WebSockets | Direct socket connection with short-lived tickets, an Origin check and server-assigned rooms (section 7.3) |
| The Netlify proxy times out at 26 s | Wait for `/health`; seed with batched inserts under 5 s; short requests |
| Neon free compute and storage, and the number of free projects | Scale to zero; small seeds; caps and daily cleanup. If the free plan refuses a second project, use a separate database in the existing Neon project |
| Nonce-based CSP makes every page render per request, which can lower Lighthouse Performance | Light landing JavaScript; 3D only after the first interaction; self-hosted fonts; measure early in the build |
| `MeshTransmissionMaterial` is expensive on phones | Capped buffer and pixel ratio, fewer slats, pause off screen, still image fallback |
| No Filipino voice on many devices | Fall back to the English announcement while showing the Filipino text |
| Browsers block audio without a tap | "Start display" screen on the TV; alerts on the resident's phone after their first tap |
| GitHub disables scheduled workflows after 60 days without repository activity | Expired barangays are also deleted when a new demo barangay is created; note in the README (ZariZari's deferred minor M9) |
| Design attribution | CC BY 4.0 credit on the Credits page and in the README; own brand and content |

## 18. Prerequisites (Jomari's actions or approvals)

1. Approve this spec and then the implementation plan.
2. Create the Neon project and approve the Render Blueprint and the Netlify site, as for ZariZari.
3. Approve creating the GitHub repository and each push and deploy.
4. Enter the secrets in Render, Netlify and GitHub personally; they are never pasted in chat.
5. Review the Filipino strings before release, and confirm the credit text in section 11.1.

## 19. Build order

The implementation plan follows these milestones. Each one ends with green tests and something that can be shown.

1. **Foundation:** monorepo, shared package, Prisma schema and migrations with foreign key indexes, Docker Compose, NestJS skeleton with the error format, health route, proxy signature guard, CI with lint, typecheck and tests.
2. **Auth and demo:** login, lockout, sessions and rotation, role guards, demo barangay creation with the batched seed, cleanup.
3. **Requests and documents:** document types, the request state machine with events, release, verification and revoke, the printable document data.
4. **Queue core:** daily sequences, taking tickets (resident and kiosk), counters, call next with `SKIP LOCKED`, call again, served, missed and rejoin, ETA, day boundary.
5. **Real-time:** socket tickets and keys, the gateway and rooms, events with versions, resync, revocation, the simulator.
6. **Web app:** Next.js shell with the Donka-based tokens and the CSP nonce, i18n, demo panel and role switcher, resident screens, staff board and counter, kapitan approvals, reports and settings.
7. **Display, kiosk and verify:** the TV with chime and voice, the kiosk and ticket tracker, the verify page, the A4 print view with QR.
8. **Landing and 3D:** the landing hero, the reeded-glass ticket scene, the wake-up flow, brand, Credits page.
9. **Ship:** Docker image in CI and E2E, Neon, Render and Netlify setup, Lighthouse, README and diagrams, portfolio entry after approval.
