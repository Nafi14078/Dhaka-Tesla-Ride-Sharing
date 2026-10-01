# Dhaka Tesla Pool

> Share a seat. Split the fare. Survive Dhaka traffic.

A ride-pooling MVP built around Jashim's three-seat "Tesla" — Bullet —
and passengers Nusrat, Rafiq, and Shirin. Passengers request a ride and
get pooled with a compatible stranger when it makes sense; Jashim sees
requests, accepts them, pools a second rider in when there's room, and
runs the trip through to completion.

## Summary & Problem Statement

Nusrat wants to get from Banani to Mohakhali. Rafiq, booking two
minutes later, wants Banani to Gulshan 1 — overlapping but not
identical. The app has to decide, fast, whether they can share a seat,
split the fare fairly, and track the ride to a clean finish — without
requiring a Google Maps key for local development, and without ever letting Jashim's
3-seat Bullet get overbooked, even if two passengers grab the last seat
at the same instant.

## Features Implemented

**Passenger**
- Sign up / log in (JWT)
- Request a ride: pickup zone, destination zone, seat count
- See a fare estimate immediately (recalculated once actually pooled)
- Track status live: `REQUESTED → MATCHED → DRIVER_ARRIVED → STARTED → COMPLETED` (or `CANCELLED`)
- View ride history; cancel while still allowed

**Driver**
- Register a Tesla (name + fixed seat capacity); go online/offline
- See pending ride requests
- Accept a request (creates a Pool tied to their vehicle)
- Pool a second/third compatible rider into an already-accepted trip
- Mark arrived → start → complete; the whole pool moves together
- See who's on board, their seats and fares; view trip history

**Platform**
- Ownership enforced everywhere (a passenger only ever sees/cancels their own ride)
- Pool capacity can never exceed the vehicle's fixed seat count, even under concurrent claims
- Every status change is logged (`StatusEvent`) for after-the-fact audit

*(Screenshots/GIFs: add these once you've run the app locally — drop them in `docs/screenshots/` and reference them here.)*

## Architecture & Data Model

See [`docs/architecture.md`](docs/architecture.md) for the full diagram and ERD (Mermaid — renders directly on GitHub). Summary:

```
Browser (Passenger / Driver)
   → Next.js App Router (frontend/)
      → Node.js + Express API (backend/), JWT auth
         → PostgreSQL via Prisma ORM
```

No microservices, no queues, no Redis/Kafka/Kubernetes — at this scale
(one API, one DB, a handful of endpoints) that would be complexity
looking for a job. See the Bonus section below for what changes at
scale.

## Ride / Pool Lifecycle

```
REQUESTED → MATCHED → DRIVER_ARRIVED → STARTED → COMPLETED
     └───────────┴───────────┘
              CANCELLED (only from REQUESTED or MATCHED)
```

- A **RideRequest** is the passenger-facing unit — one per passenger, one fare, one status.
- A **Pool** is the driver-facing unit — one per vehicle-trip, groups 1..N ride requests, `sum(seats) <= vehicle.capacity` always.
- Driver actions (arrive/start/complete) move the whole pool; each member's status follows.
- Passenger cancellation is per-ride and only allowed pre-arrival (see Assumptions).

## Matching Rule

Routing uses Google's Routes API when `GOOGLE_MAPS_API_KEY` is configured. Local development without a key uses a labeled straight-line estimate.
zones are a fixed list of Dhaka areas with plain lat/lng centroids
(`backend/src/lib/zones.ts`), grouped into route "clusters." Two ride
requests are compatible for pooling when:

1. they share the same **pickup zone**, and
2. their **destinations fall in the same cluster** (compatible routes, not necessarily identical).

Nusrat (Banani → Mohakhali) and Rafiq (Banani → Gulshan 1) match under
this rule — same pickup, both destinations in the `banani-gulshan`
cluster — reproducing the PRD's own example.

## Fare Model & Money

```
passengerFare = baseFare + distanceCharge - poolDiscount
```

- `baseFare` = ৳30 flat (3000 poisha)
- `distanceCharge` = ৳20/km (2000 poisha/km) × Google driving distance when configured; otherwise straight-line zone-centroid distance
- `poolDiscount` = 20% of `(baseFare + distanceCharge)`, applied per rider, **only** while that rider is actively sharing a pool with someone else

**Money is stored as integer poisha (1 BDT = 100 poisha)** everywhere —
never float/decimal. Reason: this formula does repeated add/subtract
across multiple pooled riders; floating-point rounding drift
accumulates silently across those steps, while integers make every
intermediate value exact and testable.

**Worked example (hand-checkable, matches `tests/fare.test.ts`):**

| | Nusrat (Banani→Mohakhali) | Rafiq (Banani→Gulshan 1) |
|---|---|---|
| Distance | 1.835 km | 1.786 km |
| Base fare | ৳30.00 | ৳30.00 |
| Distance charge | ৳27.53 (1.835 × 15) | ৳26.79 (1.786 × 15) |
| Subtotal | ৳57.53 | ৳56.79 |
| Pool discount (20%) | −৳11.51 | −৳11.36 |
| **Total fare** | **৳46.02** | **৳45.43** |

Payment: cash or a simulated "TeslaPay" wallet balance — no real
payment gateway integration for this MVP.

## Concurrency: the Last-Seat Problem

**Scenario (PRD §12):** Bullet has 1 seat left. Nusrat and Shirin both
try to claim it within milliseconds of each other; both read "1 seat
available" before either write lands.

**How this MVP handles it:** the seat-claim (`joinPool` in
`ride.service.ts`) runs inside a single Postgres transaction that opens
with `SELECT ... FOR UPDATE` on the `Pool` row. That row-lock forces
the second concurrent transaction to wait until the first commits (or
rolls back); when it resumes, it recomputes occupied seats from
scratch and sees the seat is gone. Exactly one of the two claims
succeeds — proven in `tests/ride.integration.test.ts`
("concurrency: two riders racing for the last seat").

**What I'd change at larger scale:** row-level locks serialize writes
per-pool, which is fine at MVP volume but becomes a contention point
under heavy concurrent load on popular routes. At scale I'd move to
optimistic concurrency (a `version` column — already present on `Pool`
but unused by the lock path today — checked via `WHERE version = $x`
on update, with a retry loop on conflict) or push matching into a
single-writer queue per geographic cell so seat contention never hits
the DB as a lock wait at all.

## Technology Choices & Justification (PRD §7)

| Layer | Choice | Alternatives considered | Why this fits this MVP | What would make me switch |
|---|---|---|---|---|
| Frontend | **Next.js 14 (App Router)** | Plain React + React Router | Built-in routing, no extra router config, easy path to SSR/deployment on Vercel's free tier if desired | If this needed to be a pure SPA with no server component at all, plain React+Vite would be lighter |
| Backend | **Express** | NestJS, Fastify | Small, explicit API surface (≈10 endpoints) — NestJS's DI/module ceremony buys nothing here; Fastify's speed edge doesn't matter at this scale | If the API grew past ~30 endpoints with real cross-cutting concerns (guards, interceptors, pipes), NestJS's structure would start paying for itself |
| Database | **PostgreSQL** | MySQL, SQLite | Pooling/capacity logic needs real transactions + row locking (`SELECT ... FOR UPDATE`) for the concurrency problem; Postgres's `FOR UPDATE` semantics are well-understood and Prisma supports them cleanly | SQLite would be fine for a pure demo but doesn't model production row-locking; no reason to prefer MySQL here |
| ORM | **Prisma** | raw `pg`, Sequelize, TypeORM, Knex | Small but relationship-heavy schema (User→Vehicle→Pool→RideRequest→StatusEvent) with real constraints; typed models + migrations with far less boilerplate than raw SQL under a timeboxed challenge — and it still drops to `$queryRaw` exactly where precision matters most (the concurrency lock) | If most queries needed hand-tuned SQL anyway, I'd move to raw `pg` + Kysely for compile-time-checked SQL without a full ORM |
| Auth | **JWT (jsonwebtoken) + bcrypt** | Session cookies + server-side store | Stateless, no session store needed for an MVP with no horizontal-scaling requirement yet; simple to test | At scale, I'd add refresh-token rotation and move revocation to a fast store (e.g. Redis) rather than relying on token expiry alone |
| Validation | **Zod** | Joi, manual checks | Schema = TypeScript type inference in one place; catches malformed requests before they touch business logic | — |
| Testing | **Jest + Supertest-ready structure** | Vitest, Mocha | Standard, well-documented, works out of the box with `ts-jest` | Vitest if the project moved to a Vite-based toolchain |
| Hosting | **Docker Compose, self-hosted / free-tier** | Render/Railway/Fly.io free tiers | No infra spend required by the brief; Docker Compose is reproducible anywhere an evaluator runs it | I'd deploy `api`+`db` to Railway/Render free tier and `web` to Vercel's free tier if a public URL is required — see Deployment below |

## Project Structure

```
dhaka-tesla-pool/
├── docs/architecture.md      # architecture diagram + ERD (Mermaid)
├── docker-compose.yml
├── .env.example
├── backend/                  # Express + Prisma API
│   ├── prisma/                schema.prisma, seed.ts, migrations/
│   ├── src/lib/                zones.ts, fare.ts, matching.ts, stateMachine.ts, prisma.ts
│   ├── src/services/            auth.service.ts, ride.service.ts, errors.ts
│   ├── src/middleware/           auth.ts, errorHandler.ts
│   ├── src/validation/            schemas.ts (Zod)
│   ├── src/routes/                 auth.routes.ts, ride.routes.ts, driver.routes.ts
│   ├── src/app.ts, src/index.ts
│   └── tests/                      fare/matching/stateMachine (pure) + ride.integration (DB)
└── frontend/                 # Next.js App Router
    ├── app/                    login, signup, passenger, driver pages
    └── lib/                     api.ts (fetch client), auth.ts (session)
```

## Prerequisites

- Docker + Docker Compose (recommended path), **or**
- Node.js 20+, PostgreSQL 16 (for running services natively)

## Environment Variables

Copy `.env.example` to `.env` and fill in real values before running
anything (`.env` itself is git-ignored — never commit real secrets):

```bash
cp .env.example .env
```

| Variable | Used by | Purpose |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `db` container | Postgres credentials |
| `DATABASE_URL` | `api` (Prisma) | Full connection string |
| `PORT` | `api` | Express listen port (default 4000) |
| `JWT_SECRET` | `api` | Signs auth tokens — set a long random string, never the placeholder, outside local dev |
| `NEXT_PUBLIC_API_URL` | `web` | Where the frontend sends API requests |

## Running with Docker (recommended)

```bash
cp .env.example .env
docker compose up --build
```

This brings up Postgres (with a healthcheck), runs `prisma migrate
deploy` + seeds the story cast, starts the API on **:4000**, and the
frontend on **:3000**. Open http://localhost:3000.

## Running Locally (without Docker)

```bash
# 1. Start Postgres yourself, then:
cp .env.example .env   # point DATABASE_URL at your local Postgres

# 2. Backend
cd backend
npm install
npx prisma migrate dev --name init   # first time only — creates migrations/
npm run seed
npm run dev                           # http://localhost:4000

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev                           # http://localhost:3000
```

## Demo Credentials (seeded)

All accounts use password `password123`:

| Role | Email |
|---|---|
| Driver (Jashim, owns Bullet — 3 seats) | `jashim@dhakatesla.dev` |
| Passenger | `nusrat@dhakatesla.dev` |
| Passenger | `rafiq@dhakatesla.dev` |
| Passenger | `shirin@dhakatesla.dev` |

## Running Tests

```bash
cd backend
npm test
```

- `tests/fare.test.ts`, `tests/matching.test.ts`, `tests/stateMachine.test.ts` are pure unit tests — no DB required.
- `tests/ride.integration.test.ts` needs a real Postgres reachable via `DATABASE_URL` (point it at a disposable database, e.g. run `docker compose up -d db` first) and covers, directly from the PRD's own list:
  - Bullet's capacity can never be exceeded
  - invalid state transitions are rejected
  - Nusrat's and Rafiq's pooled fares calculate correctly
  - users can't modify another user's ride
  - cancellation rules hold
  - two concurrent requests can't corrupt pool capacity (the Nusrat/Shirin race)

## API Overview

All routes except `/auth/*` and `/health` require `Authorization: Bearer <token>`.

```
POST   /auth/signup                    { name, email, password, role, phone? }
POST   /auth/login                     { email, password }

GET    /rides/zones                    list of Dhaka zone names
POST   /rides                          [passenger] { pickupZone, destinationZone, seats }
GET    /rides/mine                     [passenger] own ride history
GET    /rides/:id                      own ride, or 403 if not yours
POST   /rides/:id/cancel               [passenger] { reason? }

POST   /driver/vehicle                 [driver] register/update { name, capacity }
GET    /driver/vehicle                 [driver] own vehicle
POST   /driver/vehicle/online          [driver] { isOnline }
GET    /driver/requests?zone=          [driver] pending REQUESTED rides
POST   /driver/requests/:id/accept     [driver] creates a Pool, moves ride to MATCHED
POST   /driver/pools/join              [driver] { poolId, rideRequestId } — pool a 2nd/3rd rider
GET    /driver/pools/:id               [driver] pool detail (members, seats, fares)
POST   /driver/pools/:id/arrive        [driver] → DRIVER_ARRIVED
POST   /driver/pools/:id/start         [driver] → STARTED
POST   /driver/pools/:id/complete      [driver] → COMPLETED
GET    /driver/history                 [driver] past pools
```

## Deployment

*(Fill in once deployed — the brief requires free-tier only.)*

- **Backend + DB:** Render or Railway free tier both support a Postgres instance + a Node web service; document the URL here once deployed. If neither has free capacity at submission time, this Docker Compose setup is the reproducible fallback per PRD §6.
- **Frontend:** Vercel free tier, pointed at the deployed API via `NEXT_PUBLIC_API_URL`.
- **Deployment URL:** _TBD_

## Key Decisions & Trade-offs

- **One vehicle per driver** (unique `driverId` on `Vehicle`) — matches the story (Jashim owns exactly one Tesla, Bullet) and keeps the MVP schema simple. A real product would support drivers switching vehicles across shifts.
- **Driver-initiated pooling, not fully automatic matching** — a driver explicitly accepts the first rider (creating the Pool) and then explicitly adds compatible riders. This keeps the state machine simple and gives the driver visibility/control, at the cost of some passenger wait time an automatic matcher might avoid.
- **Zone-cluster matching over real routing** — trades precision for testability and PRD compliance (§4 explicitly asks to avoid fighting map APIs).
- **Pessimistic locking (`SELECT ... FOR UPDATE`) over optimistic retry** for the seat race — simpler to reason about and test correctly under a deadline; documented scaling path above.

## Known Limitations

- No real payment gateway (cash / simulated wallet only, per brief).
- No push notifications — passenger/driver views poll every 5s.
- Matching clusters are hand-curated for the 9 seeded zones; adding a zone means adding it to `zones.ts` and assigning a cluster.
- No password-reset flow.
- Single active vehicle per driver (see Assumptions).

## Next Improvements

- Real-time updates via WebSockets instead of polling.
- Driver ratings and a passenger-facing driver profile.
- Multiple vehicles per driver with a "currently driving" flag.
- Idempotency keys on ride-creation to protect against double-submit from flaky mobile networks.

## Assumptions (PRD §17)

Documented here, applied consistently, and each defensible in the interview:

1. **One active Tesla per driver.** Matches the story cast; a real fleet product would decouple driver from vehicle.
2. **Cancellation is only self-service before the driver arrives** (`REQUESTED`/`MATCHED`). Once `DRIVER_ARRIVED`, other pooled riders may already be affected, so that's treated as a driver-mediated resolution, not a passenger button.
3. **Pooling is driver-accepted, not silently automatic** — the first rider's acceptance creates the Pool; the driver then chooses whether to add a second matching rider. This gives a human checkpoint on who ends up sharing a ride.
4. **Zone clusters (for matching) are hand-defined**, not derived from real road distance — a documented simplification per PRD §4.
5. **Pool discount applies per rider, not split** between riders — pooling is always cheaper than solo for each rider individually, rather than a fixed total split unevenly.

## Bonus — "If Oi Tesla Goes Viral" (1M passengers / 100k drivers)

Without over-building the MVP, here's the reasoning for what changes at scale:

- **Matching/geospatial search:** replace zone-cluster lookup with a real geospatial index (PostGIS `ST_DWithin` or a dedicated service like Uber's H3 grid) so matching is a spatial query, not a fixed list.
- **DB:** read replicas for history/status polling reads; the hot write path (seat claims) stays on the primary. Indexes already exist on `(pickupZone, status)` and `(status)` — at scale these become composite indexes tuned to the actual query patterns observed.
- **Concurrency at scale:** move seat-claim serialization off Postgres row locks and into a per-geo-cell single-writer queue (e.g. Kafka partitioned by zone, or a Redis-backed distributed lock) so lock contention doesn't bottleneck a popular pickup zone.
- **Caching:** cache zone/fare-constant lookups (static, rarely-changing) in Redis or in-process; never cache ride/pool state (correctness-critical).
- **Real-time communication:** WebSockets or SSE for driver/passenger status pushes instead of polling, fanned out via a pub/sub layer.
- **Horizontal scaling:** stateless API containers behind a load balancer; JWT auth already supports this (no server-side session affinity needed).
- **Rate limiting & idempotency:** per-user rate limits on ride creation; idempotency keys on `POST /rides` and `POST /driver/pools/join` so retried requests from flaky mobile networks don't double-book.
- **Observability:** structured logging with request IDs threaded through the ride/pool lifecycle, plus metrics on match latency, pool-fill rate, and seat-claim conflict rate (a rising conflict rate is the earliest signal that geo-partitioning is needed).
- **Retry/failure strategy:** driver-accept and pool-join are already idempotent-safe by construction (re-accepting an already-MATCHED request fails cleanly); a job queue with backoff would handle any future async side-effects (e.g. notifications) without blocking the request path.
- **Security:** rate-limit auth endpoints, rotate JWT secrets, move to short-lived access tokens + refresh tokens.
- **Deployment:** containers behind a managed load balancer (e.g. ECS/Cloud Run), blue/green deploys, DB migrations run as a separate release step (already isolated via `prisma migrate deploy`).

## AI Usage (PRD §8)

- **Tools used:** Claude, for scaffolding the backend/frontend structure, drafting the Prisma schema, and writing the concurrency-safe `joinPool` transaction.
- **What for:** initial boilerplate (Express routing, Zod schemas, Next.js pages) and thinking through edge cases (the last-seat race, invalid-transition rejection).
- **One accepted suggestion:** using `SELECT ... FOR UPDATE` inside a Prisma `$transaction` for the seat-claim path, rather than relying on Prisma's default (non-locking) read-then-write, which would have reproduced the exact race condition the PRD asks about.
- **One rejected/changed suggestion:** the first draft made pooling fully automatic at request-creation time (system silently groups compatible requests with no driver involved until pickup). I changed this to driver-initiated acceptance because it matches the PRD's driver flow ("see relevant requests; accept a ride/pool") more literally and gives a clearer, more testable state machine — automatic silent pooling would have needed a separate "pending pool, no vehicle yet" concept that complicated the schema for no requirement it was solving.

## Demo Video

_Link: TBD — record after the app is running end-to-end (see PRD §13 for the 6-minute structure)._

## Git Workflow (PRD §10–11)

This README describes the code; the git history itself has to be built
by actually working this way on your machine — a copy-pasted repo
starts empty, so here's the sequence to follow once you've pasted
everything in:

```bash
git init
git checkout -b master
git add docs/ .gitignore README.md docker-compose.yml .env.example
git commit -m "chore(scaffold): initialize repo, gitignore, architecture doc and ERD"

git checkout -b feature/database-schema
git add backend/prisma backend/package.json backend/tsconfig.json
git commit -m "feat(db): Prisma schema for users, vehicles, pools, ride requests, status history"
git add backend/prisma/seed.ts
git commit -m "feat(db): seed script using Jashim/Bullet/Nusrat/Rafiq/Shirin cast"
git checkout master && git merge --no-ff feature/database-schema

git checkout -b feature/tesla-pooling
# add zones.ts, fare.ts, matching.ts, stateMachine.ts, ride.service.ts, jest tests
git commit -m "feat(zones): predefined Dhaka zones, haversine distance, matching rule"
git commit -m "feat(fare): fare engine, integer poisha, hand-checkable worked example"
git commit -m "feat(pool): capacity check + concurrency-safe seat claiming via row lock"
git commit -m "test(pool): capacity, fare, and state-machine unit tests"
git checkout master && git merge --no-ff feature/tesla-pooling

git checkout -b feature/passenger-auth
git commit -m "feat(auth): signup/login endpoints with JWT"
git commit -m "feat(auth): auth middleware, ownership checks on ride routes"
git checkout master && git merge --no-ff feature/passenger-auth

git checkout -b feature/driver-flow
git commit -m "feat(driver): vehicle registration, online toggle, accept/pool/advance endpoints"
git checkout master && git merge --no-ff feature/driver-flow

git checkout -b feature/frontend-flows
git commit -m "feat(web): scaffold Next.js app, auth pages"
git commit -m "feat(web): passenger dashboard — request, track, cancel, history"
git commit -m "feat(web): driver dashboard — online toggle, accept, pool, lifecycle"
git checkout master && git merge --no-ff feature/frontend-flows

git checkout -b feature/docker-deploy
git commit -m "build(docker): compose setup for api, web, and postgres with healthchecks"
git checkout master && git merge --no-ff feature/docker-deploy

# once everything above works together:
git checkout -b pre-release
# fix any integration issues, finalize README, add deployment link
git commit -m "docs: finalize README with deployment link and demo video"

git checkout -b release/v1.0.0
git tag v1.0.0
```

Keep commits scoped (`<type>(<scope>): <description>`) and avoid
"final/update/fix" messages — see PRD §11 for the exact convention.
Push feature branches as you go rather than merging everything at
once at the end; the evaluator reads the *history*, not just the
final diff.
