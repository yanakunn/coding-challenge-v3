# Process Deduction Endpoint (`POST /api/vendors/deductions`)

# Implementation Plan

| | |
|---|---|
| **Author** | Nurarissa |
| **Date** | 30 September 2026 |
| **Scope** | NET_RECEIPTS deductions, SELL_OUT expense events only |
| **Stack** | Node.js / TypeScript, Express, Sequelize (raw SQL), PostgreSQL 16 + TimescaleDB |
| **Status** | Plan only. The SQL was run against the challenge's own database image to check it (Appendix A) |

> 💡 **TL;DR**
> One transaction: lock the deduction, delete its own events, then recompute them with a single `INSERT ... SELECT` from `product_sales`. All maths happens in SQL, so Node never holds a sales row. Retrying converges to the same state.
> **Measured:** 100k rows in 2.3 s, 1M rows in 13.5 s on the first call. Retries take roughly twice as long because they delete first.

**Contents:** 1 Overview · 2 Database Reads · 3 Database Writes · 4 Performance Considerations · 5 Error Handling & Recovery · 6 Security Considerations · 7 Risks & Mitigations · 8 Future Considerations · 9 Open Questions · 10 Summary · Appendix A Evidence

---

## 1. Overview

### Objective

- **Purpose.** Take one deduction (a marketplace fee, for example "7% of shipped revenue") and turn it into `vendor.expense_events` rows, one per product-sale record in the deduction's date window.
- **Business objective.** The vendor profitability system needs fees as expense events to calculate net profit. This endpoint rebuilds the events for a single deduction on demand, for example after its rate, dates or active flag change.
- **In scope.** NET_RECEIPTS deductions (a percentage of revenue). SELL_OUT events built from product sales. Create, refresh, or remove (when inactive) the events of one deduction per call.
- **Out of scope.** FIXED_AMOUNT deductions and SELL_IN events (Rules 1 and 2), several deductions per call, scheduling.

### Assumptions

The spec leaves some points open. These are my readings, and the biggest ones are also open questions in §9.

| # | Type | Assumption | Reason |
|---|---|---|---|
| 1 | Data | ⚠️ **`expense_events.source_system_id` holds the product's `source_system_id`** (e.g. `MERCH001_SKU-1-001`) | The `expense_events` primary key has no product column. This is the only way to store one event per product per day with no schema change. **Biggest assumption.** |
| 2 | Data | `deduction_value` is a fraction (`0.10` means 10%) | The seed generates 0.00 to 0.10, and Scenario 1 multiplies by 0.10. |
| 3 | Processing | `expense_type = 'SELL_OUT'`, `expense_subtype = deduction_type`, `expense_status = 'CONFIRMED'` | The table has both a type and a subtype column; the spec names only one. `CONFIRMED` is the only status value in the seed. |
| 4 | Processing | The success response adds `expenseEventsCreated` and `expenseEventsRemoved`, and spells "successfully" correctly | Acceptance criterion 4 and Scenario 2 show counts; the API block does not. The spec's message has a typo ("succesfully"). |
| 5 | Processing | `FIXED_AMOUNT` gives **400**. A deduction that belongs to another store gives **404** | The deduction exists (not 404) and is outside the API's scope (not 500). A mismatch is treated as "not found" so one store's fee is never applied to another store's sales. |
| 6 | Processing | "Existing events are removed" means only this deduction's own events, matched on `deduction_id` | Migration V1.3 added that column and a `(store_id, deduction_id)` index for this purpose. Seeded `chargebacks` rows have no `deduction_id` and are never touched. |
| 7 | Processing | Dates use literal `report_date BETWEEN effective_date_from AND effective_date_to` | Rule 5 says inclusive on both ends. Both columns are `timestamptz`. |
| 8 | Operational | Authentication and rate limiting are handled upstream | I found no authentication middleware in the codebase. Confirm before production (§6). |
| 9 | Operational | One Postgres primary, default `READ COMMITTED` isolation, the TimescaleDB image the repo ships | The locking argument in §3.3 depends on `READ COMMITTED`. |

### Process Steps / Data Flow

#### Processing Steps

1. Receive `POST /api/vendors/deductions` with `storeId` and `deductionId`.
2. **Validate** both ids: numeric, positive, within BIGINT range. Otherwise return 400.
3. **Begin the transaction** and run `SET LOCAL lock_timeout = '5s'`.
4. **Read the store.** Return 404 if it does not exist.
5. **Read and lock the deduction** (`FOR UPDATE`). Return 404 if it does not exist or belongs to another store.
6. **Check the basis.** Return 400 if it is not `NET_RECEIPTS`.
7. **Delete** this deduction's previous events and count them.
8. **Insert** recomputed events from `product_sales` and count them. Skipped when the deduction is inactive.
9. **Commit.**
10. Return 200 with the counts, and log the outcome.

Any failure after step 3 rolls back the whole transaction and maps to 409, 503 or 500 (§5).

#### Data Flow Diagram

```
INPUT SOURCES     POST /api/vendors/deductions   { storeId, deductionId }
       │
       ▼
VALIDATION        numeric ids within BIGINT range  ───────────────►  400 INVALID_REQUEST
       │
       ▼
┌──────────────────── ONE TRANSACTION  (READ COMMITTED, lock_timeout 5s) ────────────────────┐
│ BUSINESS LOGIC                                                                             │
│   store exists?                                   ──────────────────►  404 NOT_FOUND       │
│   lock deduction row (FOR UPDATE), same store?    ──────────────────►  404 NOT_FOUND       │
│   basis = NET_RECEIPTS?                           ──────────────────►  400 INVALID_REQUEST │
│                                                                                            │
│ DATABASE WRITES                                                                            │
│   DELETE this deduction's events                  →  removed = N                           │
│   if is_active: INSERT ... SELECT product_sales   →  created = M                           │
│   COMMIT                                                                                   │
└────────────────────────────────────────────────────────────────────────────────────────────┘
       │            any failure inside the box  →  ROLLBACK  →  409 / 503 / 500
       ▼
OUTPUT            200 { status, message, expenseEventsCreated, expenseEventsRemoved }
```

**Why this flow.**

- Cheap checks come first, so a bad id never opens a transaction.
- One transaction gives all-or-nothing behaviour, which the spec's rollback rule requires.
- The work is set-based, so rows stay inside the database and Node only sees two counts.

---

## 2. Database Reads

There are three reads. The first two are point lookups. The third is the large one, and it runs inside the `INSERT` so sales rows never reach Node.

### 2.1 Store lookup

**Purpose.** Return a clear 404 for an unknown store before doing any work. Kept separate from the deduction check so the message can say which one is missing.

**Query.**

```sql
SELECT store_id FROM generic.store WHERE store_id = $1;
```

**Indexes.** `UNIQUE (store_id)` on `generic.store` (V1). Nothing to add.

**Notes.** A point lookup, effectively free. It runs inside the transaction so every check sees one consistent view.

### 2.2 Deduction lookup (locked)

**Purpose.** Read the rule (type, rate, window, active flag, basis) and lock the row so concurrent calls for the same deduction run one at a time.

**Query.**

```sql
SELECT deduction_id, store_id, deduction_basis, deduction_value, deduction_type,
       effective_date_from, effective_date_to, is_active, vendor_code
FROM vendor.deductions
WHERE deduction_id = $2::bigint
FOR UPDATE;
```

**Indexes.** `deductions_pkey`. No `store_id` index is needed; the table is small.

**Notes.**

- Under `READ COMMITTED`, a waiting call re-reads the row after the lock is released, so it recomputes from the latest values.
- The returned `store_id` is compared with the request's `storeId`. A mismatch is a 404 (assumption 5).

### 2.3 Sales read (inside the insert)

**Purpose.** The source rows for the events: one per product per day in the window, with the product's identity.

**Query.** Shown as a standalone `SELECT` for clarity. In the implementation it is the `SELECT` half of the `INSERT` in §3.2.

```sql
SELECT ps.store_id, p.source_system_id, p.product_sku,
       ps.report_date, ps.shipped_revenue
FROM vendor.product_sales ps
JOIN vendor.deductions d ON d.deduction_id = $2::bigint
JOIN generic.product   p ON p.product_id  = ps.product_id
WHERE ps.store_id = d.store_id
  AND ps.report_date BETWEEN d.effective_date_from AND d.effective_date_to;
```

**Indexes.** Existing ones are enough:

| Table | Index | Use |
|---|---|---|
| `vendor.product_sales` | Per-chunk `report_date` index (created by TimescaleDB) | Time scan of each chunk |
| `vendor.product_sales` | `idx_product_sales_store_id` (V1.2) | Store filter |
| `generic.product` | `UNIQUE (product_id)` (V1) | Join lookup per sale |

**Notes.**

- **Join strategy.** The measured plan is a nested loop: `deductions_pkey`, then per-chunk `report_date` index scans with a store filter, then a `product_id` lookup per row.
- **Deduction values come from the join, not from Node parameters.** This keeps rate and dates consistent with the lock and avoids Postgres's "could not determine data type of parameter" errors on untyped placeholders in `INSERT ... SELECT`.
- **No new index.** I tested `(store_id, report_date)` at 1M rows. The planner never used it and timings did not improve (Appendix A.4), so I am not proposing it.
- **Not measured:** windows narrower than the data, so chunk pruning is untested (§4).

---

## 3. Database Writes

### 3.1 Delete this deduction's previous events

**Purpose.** Implements Rule 3 (an inactive deduction loses its events) and clears stale events before a recompute, so retries never duplicate or leave orphans.

**Write Strategy.** A scoped delete, with the row count returned for the response.

```sql
WITH removed AS (
  DELETE FROM vendor.expense_events
  WHERE store_id = $1 AND deduction_id = $2::bigint
  RETURNING 1
)
SELECT count(*)::int AS removed FROM removed;
```

`count()` reaches Node as a string, hence `::int`.

**Constraints.**

- Scoped to `store_id` and `deduction_id`, so the seeded `chargebacks` rows (no `deduction_id`) are never touched.
- No date predicate on purpose: it removes everything the deduction owns, including events outside a window that has since narrowed.
- Idempotent: deleting nothing is a valid outcome (`removed = 0`).

**Transaction Design.** The first write inside the transaction. Other readers keep seeing the old events until commit.

**Notes.** Uses `storeId_deductionId` (V1.3) in principle. At seed scale the planner preferred per-chunk sequential scans (about 130 rows per chunk). With no time predicate, this statement cannot skip chunks.

### 3.2 Insert recomputed events

**Purpose.** Materialise the fee as one `SELL_OUT` expense event per product-sale record.

**Write Strategy.** A plain `INSERT ... SELECT`, with no `ON CONFLICT`, run only when `is_active` is true.

```sql
WITH created AS (
  INSERT INTO vendor.expense_events (
    store_id, source_system_id, expense_date, expense_type, expense_subtype,
    cost, expense_status, created_at, updated_at, deduction_id, product_sku, vendor_code)
  SELECT ps.store_id, p.source_system_id, ps.report_date, 'SELL_OUT', d.deduction_type,
         ROUND(ps.shipped_revenue * d.deduction_value, 2), 'CONFIRMED', now(), now(),
         d.deduction_id, p.product_sku, d.vendor_code
  FROM vendor.product_sales ps
  JOIN vendor.deductions d ON d.deduction_id = $2::bigint
  JOIN generic.product   p ON p.product_id  = ps.product_id
  WHERE ps.store_id = d.store_id
    AND ps.report_date BETWEEN d.effective_date_from AND d.effective_date_to
  RETURNING 1
)
SELECT count(*)::int AS created FROM created;
```

How each column is filled:

| `expense_events` column | Source | In primary key |
|---|---|---|
| `store_id` | `product_sales.store_id` | ✅ |
| `source_system_id` | `product.source_system_id` (assumption 1) | ✅ |
| `expense_date` | `product_sales.report_date` | ✅ |
| `expense_type` | literal `'SELL_OUT'` | ✅ |
| `expense_subtype` | `deductions.deduction_type` | ✅ |
| `cost` | `ROUND(shipped_revenue * deduction_value, 2)` | |
| `expense_status` | literal `'CONFIRMED'` | |
| `deduction_id` | `deductions.deduction_id` | |
| `product_sku` | `product.product_sku` | |
| `vendor_code` | `deductions.vendor_code` | |
| `created_at`, `updated_at` | `now()` | |

The counts feed the response:

```json
{
  "status": "success",
  "message": "Deductions processed successfully",
  "expenseEventsCreated": 1800,
  "expenseEventsRemoved": 0
}
```

**Constraints.**

- The primary key is `(store_id, source_system_id, expense_date, expense_type, expense_subtype)`. It does not include `deduction_id`, and TimescaleDB requires every unique key to include the partition column `expense_date`.
- Inside the transaction, this deduction's own rows were just deleted. A unique violation (SQLSTATE `23505`) can therefore only mean **another deduction owns the row**, and the call returns 409.
- **Why not `ON CONFLICT`?** Consider two deductions, A and B, of the same type with overlapping dates:

| Option | What happens when A and B overlap |
|---|---|
| `ON CONFLICT DO UPDATE` | B overwrites A's rows and takes over `deduction_id`. Cost is replaced, not added. Response is 200. Deactivating B later deletes A's fees. |
| `ON CONFLICT DO NOTHING` | B's rows are silently dropped. The vendor is under-charged. Response is 200. |
| **Plain INSERT (chosen)** | Unique violation, rollback, **409**. Nothing is written. |

Failing loudly beats silently getting money wrong. The real fix is `deduction_id` in the primary key (§8).

**Transaction Design.** Same transaction as §3.1. If the insert fails, the delete is rolled back too.

**Notes.**

- `cost` is calculated as `numeric × numeric` in SQL, so there are no float rounding errors.
- Edge inputs: `effective_date_from > effective_date_to` creates no events (and still deletes the old ones). A `0.00` rate creates zero-cost events, which the seed can produce.
- One cosmetic trade-off: a retry replaces the rows physically, so `created_at` and `updated_at` reset. Business values are identical.

### 3.3 Transaction design and concurrency

The brief's write questions, answered:

| Question | Answer |
|---|---|
| **Upsert strategy** | None. Delete this deduction's rows, then plain `INSERT ... SELECT`. |
| **Batch size** | No batching. Each operation is one set-based statement, so about 5 round trips (setup, lock, delete, insert, commit) whether the window has 1,000 or 1,000,000 rows. |
| **Transaction boundary** | One transaction around lock, delete and insert. Any failure rolls everything back. |
| **Commit strategy** | A single commit at the end. Other readers never see a half-written state. |
| **Isolation level** | `READ COMMITTED` (Postgres default). |
| **Idempotency** | Delete-and-recompute from the same inputs always ends in the same state. |

`SELECT ... FOR UPDATE` on the deduction row makes a second call for the same deduction wait instead of racing:

| Step | Call A | Call B (same deduction) |
|---|---|---|
| 1 | Begin, lock the deduction row | |
| 2 | | Begin, tries to lock, **waits** (up to 5 s) |
| 3 | Delete, then insert | (waiting) |
| 4 | Commit | Lock granted, row re-read |
| 5 | | Delete, then insert (same inputs) |
| 6 | | Commit |
| 7 | Returns 200 | Returns 200, final state identical |

A waiting call holds one of Sequelize's 10 pooled connections, so `lock_timeout = '5s'` bounds the wait. On timeout the call returns a retryable **503**.

### 3.4 Alternatives considered

| Chosen | Rejected | Why |
|---|---|---|
| Delete-and-reinsert | Upsert only | Upsert cannot remove events that no longer follow from the data (narrowed window, corrected sales). Rule 3 needs a delete anyway. |
| Two statements | One data-modifying CTE | Both parts share one snapshot, and re-inserting keys deleted in the same statement is documented as unpredictable. The retry path hits that every time. |
| `FOR UPDATE` | Advisory locks | Same serialisation, simpler to explain. |
| One transaction | Chunked commits | Chunking breaks the all-or-nothing rollback the spec requires. Measured times do not justify it. |
| Raw SQL (`sequelize.query`) | Sequelize models / `bulkCreate` | `models/index.ts` defines no models, and `bulkCreate` needs the rows in Node. |

---

## 4. Performance Considerations

| Recommendation | Why | Expected benefit | Trade-off |
|---|---|---|---|
| One set-based SQL statement per operation | 100k+ rows in Node means memory pressure and thousands of round trips | Flat Node memory, about 5 round trips at any size | SQL lives outside the ORM, so it needs integration tests |
| Calculate cost in SQL `numeric` | JavaScript floats drift by cents | Exact results | None material |
| No new index | The `(store_id, report_date)` experiment showed no gain | No migration, no extra write cost | Re-measure with multi-store data |
| No batching or pagination | Batching needs several transactions | Keeps atomic rollback | One long transaction (13 to 43 s at 1M) |
| Row lock plus `lock_timeout` | Serialise calls for the same deduction | Correct under concurrency | A waiter holds a pooled connection for up to 5 s |
| No parallelism inside one request | It would need several transactions | Keeps atomicity | One request uses one connection |

### Memory Management

Node holds the deduction row and two integers. Peak heap does not depend on the number of sales rows, because Postgres streams the join and writes the result itself. This holds by construction; I did not measure Node's heap.

### Database Optimization

Measured server-side on the challenge's own image (`timescale/timescaledb:latest-pg16`). The load fixture is 1 store × 1,000 products × N days from `generate_series`, with a deduction window covering all rows.

| Sales rows | First call (insert only) | Retry (delete + insert) | Events created |
|---|---|---|---|
| 1,800 (seed scale) | 42 ms | about 110 ms | 1,800 |
| 100,000 | 2.3 s | 4.1 to 4.5 s | 100,000 |
| 1,000,000 | 13.5 s | about 25 s, up to about 43 s when 1M dead tuples from an earlier run exist | 1,000,000 |

Ten times the rows costs about six times the insert time, because the work is per-chunk index scans. Retry cost grows with dead tuples until autovacuum catches up.

**Not measured:**

- **Windows narrower than the data.** Every test window covered all sales, so chunk pruning was not exercised. To check: run `EXPLAIN` with a one-week window.
- **Multi-store selectivity.** The fixture has one store.
- **Production chunk intervals.** I used the image defaults.

### Batch Processing

Not used. Batching would split the work into several transactions and break the spec's rollback rule, and one statement already handles 1M rows in 13.5 s. **Trade-off:** one long transaction, which holds a pooled connection and row locks for its duration. If long windows become routine, the answer is an asynchronous job (§8), not silent chunking.

### Pagination Strategy

Not applicable: the endpoint returns two counts, not rows, and nothing is paged. If the logic ever had to run in Node, the fallback would be keyset pagination on the sales primary key in batches of a few thousand rows. That keeps each batch far below Postgres's bind-parameter limit. I am not proposing it.

### Parallelization Opportunities

- **Within one request: no.** Parallel workers would each need a transaction, which gives up atomicity.
- **Across requests: already happens.** The lock is per deduction, so different deductions run at the same time. The limit is the connection pool (10), so a concurrency cap is recommended (§6).
- **Same deduction: serialised on purpose.**

### Monitoring & Observability

The repo has only winston logging today, so these start as fields in structured logs and can move to a metrics backend later. Thresholds are starting points to tune after a baseline, not measured limits.

| Metric | Why it matters |
|---|---|
| Calls by outcome (200, 400, 404, 409, 503, 500) | Success and failure counts |
| Processing duration (p50, p95) | Measured 2 to 43 s at 100k to 1M rows, so drift is visible |
| Events created and removed per call | Throughput. A retry should report the same numbers as the first call |
| Lock wait time and 503 count | Contention on a deduction |
| Delete and insert latency, separately | Shows which half is slow |

| Alert | Starting threshold | Why |
|---|---|---|
| 500 rate | More than 1% of calls over 5 min | Database or infrastructure trouble |
| p95 duration | More than 30 s | Above the measured 1M first call, and close to common HTTP timeouts |
| Lock timeouts (503) | More than 5 in 5 min | A stuck or unusually long transaction |
| Overlap conflicts (409) | Any (notify, do not page) | Overlapping deductions need a product decision |
| Dead tuples on `expense_events` | Rising across retries | Autovacuum falling behind |

**Dashboard:** one row of panels: calls by outcome, p50 and p95 duration, created versus removed, 409 and 503 counts.

**Audit trail:** the structured log line from §5 (request id, ids, outcome, counts, duration, caller identity if available) answers who, what, when and how many. A separate audit table is not worth it, because the output is fully derivable from `product_sales` plus the deduction row and a rerun rebuilds it.

---

## 5. Error Handling & Recovery

Error bodies follow the spec: `{ "status": "error", "error": "...", "message": "..." }`. The shared `validateRequest` and `errorHandler` middleware return different shapes today, so I would extend both additively (keep existing fields, add `status` and `message`) so nothing that reads the old shape breaks.

### Validation Failures

Checked before the transaction opens (ids) or inside it (existence, basis). None of these write anything.

| Condition | Status |
|---|---|
| `storeId` or `deductionId` missing, non-numeric, zero, or above BIGINT max ¹ | 400 `INVALID_REQUEST` |
| `deduction_basis = 'FIXED_AMOUNT'` | 400 `INVALID_REQUEST` |
| Store or deduction not found, or deduction belongs to another store | 404 `NOT_FOUND` |

¹ Regex `^[1-9]\d{0,18}$` plus a string comparison against `9223372036854775807`. A 25-digit id must return 400, not a Postgres 500.

### Retry Strategy

Every failure rolls back completely and the endpoint is idempotent, so the client can always retry the same request safely. Whether retrying *helps* depends on the cause:

| Failure | Status | Retry? | Guidance |
|---|---|---|---|
| Lock wait exceeded (`55P03`) or deadlock (`40P01`) | **503** | Yes | Exponential backoff with jitter (for example 1 s, 2 s, 4 s, then stop) |
| Transient database error, connection loss | 500 `PROCESSING_FAILED` | Yes | Same backoff |
| Overlap conflict (`23505`) ² | **409** | No | Fails again until the data changes |
| Validation or not found | 400 / 404 | No | The request itself is wrong |

² 409 and 503 extend the spec's three error codes on purpose. After the rollback, a follow-up query finds the owning `deduction_id` so the message can name it.

The server does not retry internally. A blind server-side retry of a 25 s transaction would hide the underlying problem and hold a connection longer.

### Partial Failure Handling

There is no partial state by design. Everything happens in one transaction, so a crash, timeout or connection loss mid-processing rolls back to the previous events. If the response is lost after a successful commit, the client retries, and the recompute converges to the same result.

### Logging

One structured log line per call, through the existing winston logger:

| Log | Content | Level |
|---|---|---|
| Request / audit | Request id, `storeId`, `deductionId`, outcome, removed, created, `duration_ms`, caller identity if available | info |
| Error | SQLSTATE, message, stack. Ids only, no other payload | error |
| Diagnostic | Delete and insert timings, lock wait | debug |

### Recovery Approach

Rerunning the same request is the recovery, because it rebuilds events from the source of truth. Nobody should edit `expense_events` by hand.

- **409:** read the message to find the deduction that owns the row, then decide whether to deactivate or adjust one of them (a product decision). Rerun afterwards.
- **Repeated 503:** look for a long-running transaction in `pg_stat_activity`.
- **Slow calls:** check dead tuples in `pg_stat_user_tables` and run `VACUUM ANALYZE` on `expense_events`.

### Testing

The repo had jest configured but no `tests/` folder and no `test` script, so I added both; `npm test` runs 13 integration tests, all green at submission (see `TESTING.md` for how to run them). Integration tests use supertest against the repo's own TimescaleDB container, because mocks cannot verify SQL on a hypertable. Each test creates its own store and cleans up with one `DELETE FROM generic.store`; every table cascades from it.

| Group | Cases |
|---|---|
| Correctness | Happy path with cost spot-check; rounding (0.07 × odd cents); sales exactly at `effective_date_from` and `effective_date_to` are both included |
| Idempotency | Call twice: second call reports removed = N, created = N. Compare business columns only, since timestamps reset |
| Rule 3 (soft delete) | Inactive with prior events (N removed, 0 created); inactive with none (0 and 0); narrowed window removes events outside it |
| Validation | `FIXED_AMOUNT` gives 400; malformed ids including a 19-digit value above BIGINT max give 400; unknown ids give 404; another store's deduction gives 404 |
| Edge inputs | `from > to` gives 200 with N removed, 0 created; a `0.00` rate creates zero-cost events |
| Failure and concurrency | Two simultaneous calls end in a correct state; an overlap conflict returns 409 and leaves no partial state |

---

## 6. Security Considerations

| Area | Risk | Mitigation |
|---|---|---|
| Authentication | I found no authentication middleware in the codebase | **Assumption:** handled upstream (API gateway or service token). Confirm before production. |
| Authorization | The body carries `storeId`, so any caller could trigger a recompute for any store | Check that the caller may act on that store before the transaction. **Not built here**, since the repo has no identity model. The 404 on a store mismatch stops cross-store *calculation*, not unauthorised *calls*. |
| SQL injection | Raw SQL through `sequelize.query` | Bound parameters only (`$1`, `$2::bigint`), never string concatenation. Ids are also validated as BIGINT-safe numeric strings. |
| Input validation | Malformed or oversized ids | The existing zod schema, tightened with the BIGINT regex and range check from §5. |
| Sensitive data | Fee and revenue figures | Logs carry ids and counts only. The existing request logger prints the body, which is safe today (two ids) but should be revisited if the body grows. |
| Abuse / resource exhaustion | A call can run 13 to 43 s at 1M rows. Different deductions run in parallel, so about 10 calls can use every pooled connection and starve `/health` | Per-store rate limit or concurrency cap. Add `SET LOCAL statement_timeout` above the measured worst case (for example 120 s). Longer term, the asynchronous job in §8. |

---

## 7. Risks & Mitigations

| Decision | Benefit | Risk | Mitigation |
|---|---|---|---|
| Delete-and-recompute | Idempotent, no stale events | Dead tuples, and retries cost about twice a first call | Autovacuum. Upsert design once `deduction_id` is in the primary key (§8) |
| One transaction | Atomic rollback, no torn state | Holds a connection and locks for 13 to 43 s at 1M | `lock_timeout`, `statement_timeout`, asynchronous job later |
| Plain INSERT, 409 on overlap | Money is never silently wrong | Some legitimate overlaps are rejected | Clear 409 message, then the primary key migration |
| Product `source_system_id` as event key (assumption 1) | No schema change | Wrong if the intended key differs | Confirm with the recruiter. Fallback is a migration |
| Raw SQL | Exact maths, no rows in Node | Bypasses a model layer, harder to unit test | Integration tests on the real database |
| No new index | No migration, no extra write cost | Multi-store data may change the picture | Re-measure with realistic data |

---

## 8. Future Considerations

Ideas only, not commitments, and all within the spec's limits.

### Enhancements to the processing model

| Enhancement | Benefit | Trade-off | Trigger |
|---|---|---|---|
| **Incremental Processing:** recompute only the days whose sales changed | Far less work when a small part of a large window changes | Needs change tracking, and a bug leaves stale events. Full recompute is the safe fallback | Full recomputes become slow or frequent |
| **Background Jobs / Queue Processing:** return `202 Accepted` and run the recompute as a job with a status table | Removes the 13 to 43 s request, and a queue can cap concurrency and protect the pool | New table, worker and status endpoint. The client must poll | Large windows become routine |
| **Event-Driven Architecture:** recompute when a deduction changes or new sales land | No manual trigger, so events stay fresh | Bursts of events need de-duplication and ordering. Harder to reason about than a request | Manual triggering becomes a bottleneck. This endpoint stays as the repair path |
| **Horizontal Scaling:** run more Node instances | The service is stateless, and the row lock keeps concurrent instances correct | The database is the real limit. More instances mean more pooled connections, so size pools and add a concurrency cap | CPU or request volume, not database time, becomes the limit |
| **Auditability Improvements:** an append-only run-log table (run id, caller, counts, duration) | Queryable history without digging through logs | An extra write per call and a retention policy | Compliance or support need a history |

### Data model and storage

| Improvement | Benefit | Trade-off |
|---|---|---|
| **`deduction_id` in the `expense_events` primary key** | Overlapping deductions can co-own events, removing the 409 case. It also allows upsert plus delete-stale with an `IS DISTINCT FROM` guard, which avoids rewriting unchanged rows | Needs a hypertable migration (drop and recreate the PK including `expense_date`) and a product decision on whether overlapping fees stack or replace |
| **Compression and retention on `expense_events`** | Lower storage cost | Compressed chunks can make deletes costlier, so re-measure first |
| **Explicit timezone rules for the window** | Predictable day boundaries | A product decision on calendar-day semantics |

Deliberately not proposed: SELL_IN and FIXED_AMOUNT support. Rules 1 and 2 put both out of scope for this endpoint.

---

## 9. Open Questions

1. `expense_events` has no product column in its primary key. My plan uses the product's `source_system_id` to store one event per product per day. Is that the intended key meaning, or should the schema change?
2. Should the success response include `expenseEventsCreated` and `expenseEventsRemoved`? Scenario 2 and acceptance criterion 4 suggest yes; the response block omits them.
3. When two deductions overlap on the same product and day, should the endpoint fail loudly (my choice: 409), or should the events stack or replace?

---

## 10. Summary

| Area | Approach |
|---|---|
| **Core implementation** | Validate, then in one transaction: lock the deduction, delete its own events, recompute them with one `INSERT ... SELECT`. Idempotent by construction. |
| **Database strategy** | Set-based SQL with exact `numeric` maths. Delete scoped by `deduction_id`. Plain `INSERT` so overlapping deductions fail loudly with 409. No new index. |
| **Performance strategy** | Work stays in Postgres. About 5 round trips at any size. Measured: 100k rows in 2.3 s and 1M rows in 13.5 s on the first call. |
| **Reliability and recovery** | Single transaction with rollback, row lock with a 5 s timeout, safe retries with backoff, and a rerun that rebuilds the state. |
| **Scalability** | Sublinear growth up to 1M rows. Limits are one long transaction (13 to 43 s), retry bloat, and the pool of 10. |
| **Future extensibility** | Asynchronous jobs, incremental recompute, and a primary key that includes `deduction_id`, each with a stated trigger. |

---

## Appendix A: Evidence

**Environment note.** A local Windows PostgreSQL service on port 5432 hid the container from the host, so the repo's host-side seed script could not run. I built a SQL mirror of `database/scripts/seed-data.ts` with the same tables and counts (3 stores, 30 products, 6 NET_RECEIPTS deductions on store 1, 5,400 sales, 810 chargebacks). Load fixtures used `generate_series` in a scratch database, dropped afterwards.

### A.1 Correctness at seed scale

Deduction 1: SUBSCRIPTION_FEE, 7%, window covering all sales. Store 1 has 10 products × 180 days = 1,800 in-window sales.

| Check | Result |
|---|---|
| Call 1 | `removed = 0`, `created = 1800` |
| Call 2 (retry) | `removed = 1800`, `created = 1800` |
| Rows after retry | 1,800 rows, 1,800 distinct primary keys (no duplicates) |
| Cost maths | All 1,800 rows satisfy `cost = round(shipped_revenue × 0.07, 2)`, e.g. `1729.83 → 121.09` |
| Other columns | `product_sku` and `vendor_code` populated |

### A.2 Plans at seed scale (`EXPLAIN (ANALYZE, BUFFERS)`)

| Statement | Plan | Time |
|---|---|---|
| DELETE | `ModifyHypertable` over 26 `expense_events` chunks with per-chunk seq scans. The planner prefers them to `storeId_deductionId` at about 130 rows per chunk. | 68 ms |
| INSERT | Nested loop: `deductions_pkey`, then per-chunk `product_sales_report_date_idx` scans with a store filter, then `product_product_id_key` per row. FK-check triggers took about 8 ms. | 42 ms |

### A.3 Load results

| Sales rows | Insert (first call) | Retry total | Created |
|---|---|---|---|
| 100,000 | 2.27 s | 4.46 s, then 4.08 s | 100,000 |
| 1,000,000 | 13.5 s | 25.1 s (12.7 + 12.4); 42.8 s after a prior run left 1M dead tuples | 1,000,000 |

### A.4 Index experiment at 1M rows

I created `(store_id, report_date)` on `product_sales` and ran `ANALYZE`.

- Insert: 12.4 s, then 9.5 s, then 12.1 s (noise).
- Delete: unchanged (about 30.6 s).
- The plan contained **zero** nodes using the new index. The per-chunk time indexes already work well at 1,000 rows per chunk.

**Conclusion:** do not ship it. Re-measure on realistic multi-store data, where the store filter is more selective.
