# Requirements Document: Process Deduction API Endpoint (SELL_OUT Net Receipts Only)

## Executive Summary

Create a REST API endpoint that processes updated deductions and generates expense events. This endpoint is specifically scoped to handle **Net Receipts** (percentage-based) deductions for **SELL_OUT** scenarios only, where deductions are calculated as a percentage of product sales revenue.

---

## User Story

**As a** vendor profitability system
**I want** an API endpoint to process the updated Net Receipts deductions and generate SELL_OUT expense events on demand
**So that** I can trigger deduction calculations programmatically when deductions are updated

---

## API Specification

### Endpoint

```
POST /api/vendors/deductions
```

### Request Body

```json
{
  "storeId": 12345,
  "updatedAfter": "2025-07-01",
  "updatedBefore": "2025-07-02"
}
```

**Parameters:**

- `storeId` (number, required): The store identifier
- `updatedAfter` (string, required): ISO date – process deductions updated after this date
- `updatedBefore` (string, required): ISO date – process deductions updated before this date

### Response

**Success (200 OK):**

```json
{
  "status": "success",
  "message": "Deductions processed succesfully",
  "deductionsProcessed": 10
}
```

**Error Responses:**

```json
// 400 Bad Request - Invalid input
{
  "status": "error",
  "error": "INVALID_REQUEST",
  "message": "Invalid updatedAfter"
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
   - Ensure deductionId, updatedAfter and updatedBefore are provided
   - Fetch store from database
   - Fetch deductions from database which match the filters

2. **Update New Expense Events (SELL_OUT only)**
   - **Only if deduction is active** (deduction.isActive === true)
   - Fetch product sales data for the deduction's effective date range
   - For each product sale (shipped unit):
     - Calculate deduction amount as percentage of shipped COGS
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

- Data source: Product sales (shipped units and COGS)
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

1. [ ] Endpoint accepts POST requests with storeId, updatedAfter and updatedBefore
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
- Product sales: 500 sales records with total shipped COGS of $100,000

**Expected Output:**

- 500 expense events created (one per product sale)
- Total deduction amount: $10,000 (10% of $100,000)
- Each event: cost = product's shipped_cogs × 0.10

### Scenario 2: Inactive Deduction

**Input:**

- Deduction: 15% Fee, **inactive**
- Previously had 200 expense events in database

**Expected Output:**

- 200 expense events removed
- 0 expense events created
- Response: expenseEventsRemoved: 200, expenseEventsCreated: 0
