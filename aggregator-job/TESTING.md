# Testing the deductions endpoint

How to run the integration tests and exercise `POST /api/vendors/deductions` by hand.

## Prerequisites

- Docker (for the TimescaleDB container in [`../database`](../database))
- Node.js 24 (see `.nvmrc`) and npm

## 1. Start the database

```bash
cd ../database
cp .env.example .env   # then adjust POSTGRES_PORT if 5432 is taken on your machine
npm run db:setup       # starts the container, runs Flyway migrations, seeds, verifies
```

This database has one hypertable gotcha: the container must be published on the
port your `.env` points at. On a clean machine the defaults (`5432`) just work.
On my machine a local PostgreSQL service owns 5432, so `database/.env` sets
`POSTGRES_PORT=5433` and `aggregator-job/.env` sets `DB_PORT=5433` — the two
must match. If `db:seed` fails with "database marketplace does not exist", a
different PostgreSQL is answering on your port; see the note at the bottom.

## 2. Configure and run the tests

```bash
cd ../aggregator-job
cp .env.example .env   # DB_PORT must match the database container's host port
npm install
npm test               # jest --runInBand --coverage
```

The suite is 13 integration tests that run against the **real** TimescaleDB
container (no mocks — the SQL only proves itself against hypertables). Each
test creates its own store, product, sales rows, and deduction directly in the
database, and cleans up with a single `DELETE FROM generic.store`, which
cascades to every table. Suites are isolated from the seed data.

Expected tail of a green run:

```
Tests:       13 passed, 13 total
Test Suites: 1 passed, 1 total
```

## 3. Exercise the endpoint by hand

```bash
npm run dev   # http://localhost:3000
```

Then, with the seeded data (store 1 has six NET_RECEIPTS deductions; on the
seeded fixture deduction 1 is a 7% SUBSCRIPTION_FEE covering 1,800 sales):

```bash
# Happy path — first call creates the events
curl -s -X POST http://localhost:3000/api/vendors/deductions \
  -H "Content-Type: application/json" \
  -d '{"storeId":"1","deductionId":"1"}'

{"status":"success","message":"Deductions processed successfully","expenseEventsCreated":1800,"expenseEventsRemoved":1800}

# Same call again — idempotent: same counts, no duplicate rows
# (on a truly fresh database the first call reports expenseEventsRemoved: 0)

# Unknown deduction -> 404
curl -s -X POST http://localhost:3000/api/vendors/deductions \
  -H "Content-Type: application/json" \
  -d '{"storeId":"1","deductionId":"999999999"}'

{"error":"NOT_FOUND","status":"error","message":"Deduction not found",...}

# Malformed id -> 400
curl -s -X POST http://localhost:3000/api/vendors/deductions \
  -H "Content-Type: application/json" \
  -d '{"storeId":"abc","deductionId":"1"}'

{"error":"INVALID_REQUEST","status":"error","message":"storeId must be a positive integer",...}
```

Error bodies include a `stack` field while `NODE_ENV=development`; it is
omitted in production. Other interesting cases:

- Deactivate the deduction (`UPDATE vendor.deductions SET is_active = false
  WHERE deduction_id = 1;`) and call again → `expenseEventsRemoved: 1800,
  expenseEventsCreated: 0`, and the SELL_OUT rows are gone.
- `GET http://localhost:3000/api/health` → `{"status":"ok",...,"database":"connected"}`.

## Where logs go

The app logs through winston to the console, `logs/combined.log`, and
`logs/error.log`. Each request logs receipt, validation outcome, removed and
created counts, and duration.

## Troubleshooting

- **"database marketplace does not exist" during seed** — something other than
  the container is listening on your configured port. Check what owns it
  (`netstat -ano | findstr :5432`), and either stop that service or publish the
  container on another port via `POSTGRES_PORT` in `database/.env` (mirroring
  `DB_PORT` in `aggregator-job/.env`), then `docker-compose up -d postgres`.
- **Tests hang or fail to connect** — confirm the container is healthy
  (`docker ps`) and that both `.env` files agree on the port.
- **Lint complains about `␍` on every line** — Windows checkout artifact
  (`core.autocrlf=true`); the repo stores LF. `git config core.autocrlf false`
  plus a fresh checkout, or `npm run lint:fix`, if you want a clean local lint.
