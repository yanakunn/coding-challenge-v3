import { QueryTypes } from "sequelize";

import { sequelize } from "../config/database";
import { logger } from "../utils/logger";

/** Error carrying an HTTP status and the spec's machine-readable error code. */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string) {
    super(404, "NOT_FOUND", message);
  }
}

export class InvalidRequestError extends ApiError {
  constructor(message: string) {
    super(400, "INVALID_REQUEST", message);
  }
}

const ID_PATTERN = /^[1-9]\d{0,18}$/;
const BIGINT_MAX = "9223372036854775807";

/**
 * Parse a BIGINT id from a request string. Rejects non-numeric input, zero,
 * and values above the BIGINT max, so an oversized string becomes a 400
 * instead of a Postgres error surfaced as a 500.
 */
function parseId(raw: string, field: string): number {
  if (!ID_PATTERN.test(raw) || (raw.length === 19 && raw > BIGINT_MAX)) {
    throw new InvalidRequestError(`${field} must be a positive integer`);
  }
  return Number(raw);
}

interface DeductionRow {
  deduction_id: number;
  store_id: string | number;
  deduction_basis: string;
  deduction_type: string;
  deduction_value: string;
  is_active: boolean;
}

interface ProcessResult {
  removed: number;
  created: number;
}

/**
 * Recompute one NET_RECEIPTS deduction into SELL_OUT expense events.
 *
 * One transaction: lock the deduction row, delete this deduction's own
 * events, and if it is active, re-insert them set-based from product_sales.
 * A unique violation can then only come from another deduction's event,
 * which is reported as a 409 instead of being silently overwritten.
 */
export async function processDeduction(
  storeId: string,
  deductionId: string,
): Promise<ProcessResult> {
  const storeIdNum = parseId(storeId, "storeId");
  const deductionIdNum = parseId(deductionId, "deductionId");

  const [storeRow] = await sequelize.query(
    "SELECT store_id FROM generic.store WHERE store_id = $1",
    { bind: [storeIdNum], type: QueryTypes.SELECT },
  );
  if (!storeRow) {
    throw new NotFoundError("Store not found");
  }

  try {
    return await sequelize.transaction(async (t) => {
      // A waiter holds one of Sequelize's pooled connections; bound the wait.
      await sequelize.query("SET LOCAL lock_timeout = '5s'", {
        transaction: t,
      });

      const [deduction] = await sequelize.query<DeductionRow>(
        `SELECT deduction_id, store_id, deduction_basis, deduction_value,
                deduction_type, effective_date_from, effective_date_to,
                is_active, vendor_code
         FROM vendor.deductions
         WHERE deduction_id = $1::bigint
         FOR UPDATE`,
        { bind: [deductionIdNum], type: QueryTypes.SELECT, transaction: t },
      );
      if (!deduction) {
        throw new NotFoundError("Deduction not found");
      }
      if (Number(deduction.store_id) !== storeIdNum) {
        throw new NotFoundError("Deduction not found for this store");
      }
      if (deduction.deduction_basis !== "NET_RECEIPTS") {
        throw new InvalidRequestError(
          "Only NET_RECEIPTS deductions are supported",
        );
      }

      const [removedRow] = await sequelize.query<{ removed: number }>(
        `WITH removed AS (
           DELETE FROM vendor.expense_events
           WHERE store_id = $1 AND deduction_id = $2::bigint
           RETURNING 1
         )
         SELECT count(*)::int AS removed FROM removed`,
        {
          bind: [storeIdNum, deductionIdNum],
          type: QueryTypes.SELECT,
          transaction: t,
        },
      );

      let created = 0;
      if (deduction.is_active) {
        // Values come from the locked row via the join, not from Node params.
        const [createdRow] = await sequelize.query<{ created: number }>(
          `WITH created AS (
             INSERT INTO vendor.expense_events (
               store_id, source_system_id, expense_date, expense_type,
               expense_subtype, cost, expense_status, created_at, updated_at,
               deduction_id, product_sku, vendor_code)
             SELECT ps.store_id, p.source_system_id, ps.report_date,
                    'SELL_OUT', d.deduction_type,
                    ROUND(ps.shipped_revenue * d.deduction_value, 2),
                    'CONFIRMED', now(), now(),
                    d.deduction_id, p.product_sku, d.vendor_code
             FROM vendor.product_sales ps
             JOIN vendor.deductions d ON d.deduction_id = $1::bigint
             JOIN generic.product p ON p.product_id = ps.product_id
             WHERE ps.store_id = d.store_id
               AND ps.report_date
                     BETWEEN d.effective_date_from AND d.effective_date_to
             RETURNING 1
           )
           SELECT count(*)::int AS created FROM created`,
          { bind: [deductionIdNum], type: QueryTypes.SELECT, transaction: t },
        );
        created = createdRow.created;
      }

      const removed = removedRow.removed;
      logger.info("Deduction processed", {
        storeId: storeIdNum,
        deductionId: deductionIdNum,
        removed,
        created,
      });
      return { removed, created };
    });
  } catch (err) {
    const pgCode = (err as { original?: { code?: string } })?.original?.code;
    if (pgCode === "23505") {
      throw new ApiError(
        409,
        "EXPENSE_CONFLICT",
        "An expense event for this store, product and date already belongs to another deduction",
      );
    }
    if (pgCode === "55P03") {
      throw new ApiError(
        503,
        "PROCESSING_BUSY",
        "Deduction is being processed by another request; safe to retry",
      );
    }
    throw err;
  }
}
