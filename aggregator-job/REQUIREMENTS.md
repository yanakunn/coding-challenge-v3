# Requirements Document: Process Deduction API Endpoint (SELL_OUT Net Receipts Only)

## Coding Challenge Instructions

**You are not expected to write working code for this challenge.**

Instead, produce a detailed **implementation plan** that demonstrates how you would build the endpoint described below. Your plan should cover:

1. **Database reads** — The exact queries (or ORM calls) you would use to fetch stores, deductions, and product sales data, including any indexes, joins, or filtering strategies you would apply
2. **Database writes** — How you would create or update expense events, including upsert strategy, batch sizes, and transaction boundaries
3. **Performance considerations** — How your design handles 100,000+ product sales records without exhausting memory or overwhelming the database
4. **Future considerations** — Any improvements or additions you would propose beyond the current scope, while staying within the limitations described in this document

Submit your plan as a written document (markdown preferred). Code snippets are welcome to illustrate specific points but are not required.

---

## Executive Summary

Create a REST API endpoint that processes updated deductions and generates expense events. This endpoint is specifically scoped to handle **Net Receipts** (percentage-based) deductions for **SELL_OUT** scenarios only, where deductions are calculated as a percentage of product sales revenue.

---

## Key Concepts

### Vendor Profitability System

A system that tracks and calculates the profitability of vendors selling products through marketplace stores. It monitors product sales, deducts marketplace fees and expenses, and helps vendors understand their net profitability by processing deductions and generating expense events from sales data.

### Deduction

A marketplace fee or cost applied to vendor sales, stored in the `vendor.deductions` table. Deductions have:

- A **type** (e.g., "Marketing Fee", "Commission")
- A **basis**: either `NET_RECEIPTS` (percentage of revenue) or `FIXED_AMOUNT`
- A **value**: the percentage or fixed amount
- An **effective date range**: when the deduction applies
- An **active status**: whether it's currently being applied

For example: a 10% marketing fee deduction on all sales from January 1-31, 2026.

### Expense Event

A calculated cost record generated from applying deductions to actual product sales, stored in the `vendor.expense_events` table. Each expense event represents:

- A specific cost amount calculated from a deduction
- The date when the expense occurred
- The product and store it applies to
- The expense type (e.g., "SELL_OUT" for costs based on shipped sales)

For example: if a product had $10,000 in shipped revenue and a 10% deduction applies, an expense event is created with a cost of $1,000.

---

## User Story

**As a** vendor profitability system
**I want** an API endpoint to process a specific deduction and generate SELL_OUT expense events on demand
**So that** I can trigger deduction calculations programmatically for individual deductions

---

## API Specification

### Endpoint

```
POST /api/vendors/deductions
```

### Request Body

```json
{
  "storeId": "store123",
  "deductionId": "deduction456"
}
```

**Parameters:**

- `storeId` (string, required): The store identifier
- `deductionId` (string, required): The deduction identifier to process

### Response

**Success (200 OK):**

```json
{
  "status": "success",
  "message": "Deductions processed succesfully"
}
```

**Error Responses:**

```json
// 400 Bad Request - Invalid input
{
  "status": "error",
  "error": "INVALID_REQUEST",
  "message": "Invalid deductionId"
}

// 404 Not Found - Store or deduction doesn't exist
{
  "status": "error",
  "error": "NOT_FOUND",
  "message": "Store not found"
}

// 500 Internal Server Error
{
  "status": "error",
  "error": "PROCESSING_FAILED",
  "message": "Failed to process deduction: <details>"
}
```

---

## Business Logic

### High-Level Flow

1. **Validate Request**
   - Ensure storeId and deductionId are provided
   - Fetch store from database
   - Fetch deduction from database using deductionId

2. **Update New Expense Events (SELL_OUT only)**
   - **Only if deduction is active** (deduction.isActive === true)
   - Fetch product sales data for the deduction's effective date range
   - For each product sale record:
     - Calculate deduction amount as percentage of shipped revenue
     - Create/Update expense event record

3. **Return Response**
   - Return summary of processing (number of deductions processed)

---

## Business Rules

### Rule 1: NET_RECEIPTS Only

**Only deductions with `deductionBasis = "NET_RECEIPTS"` are supported.**

- NET_RECEIPTS means the deduction is calculated as a percentage of revenue

### Rule 2: SELL_OUT Only

**Only SELL_OUT expense events are generated.**

- Data source: Product sales (shipped revenue)
- SELL_IN (purchase order based) is NOT processed by this endpoint

### Rule 3: Active Deductions Only Generate Events

- If `deduction.isActive === false`, existing events are removed but no new events are created
- This allows for "soft deleting" deductions

### Rule 4: Idempotency

- Calling the endpoint multiple times with the same deduction should produce the same result

### Rule 5: Date Range Filtering

- Only product sales where `reportDate` is between `effectiveDateFrom` and `effectiveDateTo` are included
- Date range is inclusive on both ends

---

## Performance Requirements

### Scalability

- Support deductions covering 100,000+ product sales records

## Error Handling

### Graceful Failures

- If database connection is lost mid-processing, rollback transaction

### Retry Strategy

- Endpoint should be idempotent and safe to retry
- If processing fails, client can safely retry the same request

## Acceptance Criteria

1. [ ] Endpoint accepts POST requests with storeId and deductionId
2. [ ] Only process deduction which are of type NET_RECEIPTS
3. [ ] Generates SELL_OUT expense events only (not SELL_IN)
4. [ ] Returns summary response with counts
5. [ ] Is idempotent (safe to call multiple times)
6. [ ] Handles errors gracefully with appropriate status codes
7. [ ] Logs all processing steps

---

## Example Scenarios

### Scenario 1: Simple Net Receipts Deduction

**Input:**

- Deduction: 10% Marketing Fee, active
- Effective dates: 2026-01-01 to 2026-01-31
- Product sales: 500 sales records, each with a shipped revenue of $10,000

**Expected Output:**

- 500 expense events created (one per product sale record)
- Deduction amount for each expense event: $1,000 (10% of $10,000)
- Each event: cost = product's shipped_revenue × 0.10

### Scenario 2: Inactive Deduction

**Input:**

- Deduction: 15% Fee, **inactive**
- Previously had 200 expense events in database

**Expected Output:**

- 200 expense events removed
- 0 expense events created
- Response: expenseEventsRemoved: 200, expenseEventsCreated: 0
