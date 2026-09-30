import { QueryTypes } from "sequelize";
import request from "supertest";

import app from "../src/app";
import { sequelize } from "../src/config/database";

jest.setTimeout(20000);

// Each test builds its own store + product + sales + deduction and cleans up
// with a single DELETE FROM generic.store, which cascades to every table.
const trackedStores: number[] = [];
let runCounter = 0;

afterEach(async () => {
  for (const id of trackedStores.splice(0)) {
    await sequelize.query(`DELETE FROM generic.store WHERE store_id = ${id}`);
  }
});

interface Fixture {
  storeId: number;
  deductionId: number;
  from: Date;
  to: Date;
  mid: Date;
}

async function createFixture(
  opts: {
    value?: string;
    active?: boolean;
    basis?: "NET_RECEIPTS" | "FIXED_AMOUNT";
    type?: string;
    from?: Date;
    to?: Date;
  } = {},
): Promise<Fixture> {
  const tag = `t${Date.now()}_${++runCounter}`;
  const from = opts.from ?? new Date("2026-01-10T09:00:00Z");
  const to = opts.to ?? new Date("2026-01-20T09:00:00Z");
  const mid = new Date("2026-01-15T09:00:00Z");
  const revenue = "123.45";

  const [store] = (await sequelize.query(
    `INSERT INTO generic.store (
       merchant_id, marketplace_type, marketplace_subtype, marketplace_country,
       source_system_id, is_active, created_at, updated_at)
     VALUES ($1, 'test', 'test', 'US', $1, TRUE, now(), now())
     RETURNING store_id`,
    { bind: [tag], type: QueryTypes.SELECT },
  )) as { store_id: number }[];

  const [product] = (await sequelize.query(
    `INSERT INTO generic.product (
       store_id, marketplace_type, marketplace_subtype, marketplace_country,
       source_system_id, seller_sku, product_sku, title, image_url, link_url,
       price, brand, fulfilled_by, is_active, created_at, updated_at)
     VALUES ($1, 'test', 'test', 'US', $2, 'SKU1', 'PROD1', 'Test product',
             'x', 'x', 10.00, 'B', 'FBA', TRUE, now(), now())
     RETURNING product_id`,
    { bind: [store.store_id, `${tag}_SKU1`], type: QueryTypes.SELECT },
  )) as { product_id: number }[];

  for (const reportDate of [from, mid, to]) {
    await sequelize.query(
      `INSERT INTO vendor.product_sales (
         product_id, store_id, ordered_revenue, ordered_units, shipped_revenue,
         shipped_units, shipped_cogs, customer_returns, shipped_revenue_total,
         shipped_units_total, shipped_cogs_total, customer_returns_total,
         report_date, created_at, updated_at)
       VALUES ($1, $2, $3, 1, $3, 1, 50.00, 0, $3, 1, 50.00, 0, $4, $4, $4)`,
      {
        bind: [product.product_id, store.store_id, revenue, reportDate],
        type: QueryTypes.INSERT,
      },
    );
  }

  const [deduction] = (await sequelize.query(
    `INSERT INTO vendor.deductions (
       store_id, deduction_type, deduction_basis, deduction_value, currency,
       vendor_code, effective_date_from, effective_date_to, is_active,
       created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'USD', 'V_TEST', $5, $6, $7, now(), now())
     RETURNING deduction_id`,
    {
      bind: [
        store.store_id,
        opts.type ?? "TEST_FEE",
        opts.basis ?? "NET_RECEIPTS",
        opts.value ?? "0.10",
        from,
        to,
        opts.active ?? true,
      ],
      type: QueryTypes.SELECT,
    },
  )) as { deduction_id: number }[];

  trackedStores.push(store.store_id);
  return {
    storeId: store.store_id,
    deductionId: deduction.deduction_id,
    from,
    to,
    mid,
  };
}

function postDeduction(storeId: number | string, deductionId: number | string) {
  return request(app)
    .post("/api/vendors/deductions")
    .send({ storeId: String(storeId), deductionId: String(deductionId) });
}

async function sellOutRows(storeId: number) {
  return (await sequelize.query(
    `SELECT source_system_id, expense_date, expense_type, expense_subtype,
            cost, expense_status, deduction_id, product_sku, vendor_code
     FROM vendor.expense_events
     WHERE store_id = ${storeId} AND expense_type = 'SELL_OUT'
     ORDER BY expense_date`,
    { type: QueryTypes.SELECT },
  )) as Record<string, unknown>[];
}

describe("POST /api/vendors/deductions", () => {
  it("processes an active deduction: creates one event per sale with exact cost and boundary dates included", async () => {
    const fx = await createFixture({ value: "0.10" });

    const res = await postDeduction(fx.storeId, fx.deductionId);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "success",
      expenseEventsCreated: 3,
      expenseEventsRemoved: 0,
    });

    const rows = await sellOutRows(fx.storeId);
    expect(rows).toHaveLength(3); // sales at from, mid and to — both boundaries included
    for (const row of rows) {
      expect(row.cost).toBe("12.35"); // round(123.45 * 0.10, 2)
      expect(row).toMatchObject({
        expense_type: "SELL_OUT",
        expense_subtype: "TEST_FEE",
        expense_status: "CONFIRMED",
        deduction_id: fx.deductionId,
        product_sku: "PROD1",
        vendor_code: "V_TEST",
      });
    }
  });

  it("is idempotent: a retry converges to the same business state", async () => {
    const fx = await createFixture();

    await postDeduction(fx.storeId, fx.deductionId);
    const before = await sellOutRows(fx.storeId);

    const res = await postDeduction(fx.storeId, fx.deductionId);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      expenseEventsRemoved: 3,
      expenseEventsCreated: 3,
    });
    const after = await sellOutRows(fx.storeId);
    // created_at/updated_at legitimately reset on rewrite; compare business columns
    expect(after).toEqual(before);
  });

  it("removes a deactivated deduction's events and creates none", async () => {
    const fx = await createFixture();
    await postDeduction(fx.storeId, fx.deductionId);

    await sequelize.query(
      `UPDATE vendor.deductions SET is_active = FALSE WHERE deduction_id = ${fx.deductionId}`,
    );
    const res = await postDeduction(fx.storeId, fx.deductionId);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      expenseEventsRemoved: 3,
      expenseEventsCreated: 0,
    });
    expect(await sellOutRows(fx.storeId)).toHaveLength(0);
  });

  it("reports zero counts for an inactive deduction with no prior events", async () => {
    const fx = await createFixture({ active: false });

    const res = await postDeduction(fx.storeId, fx.deductionId);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      expenseEventsRemoved: 0,
      expenseEventsCreated: 0,
    });
  });

  it("drops events that fall outside a narrowed window on recompute", async () => {
    const fx = await createFixture();
    await postDeduction(fx.storeId, fx.deductionId);

    await sequelize.query(
      `UPDATE vendor.deductions SET effective_date_to = '${fx.mid.toISOString()}' WHERE deduction_id = ${fx.deductionId}`,
    );
    const res = await postDeduction(fx.storeId, fx.deductionId);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      expenseEventsRemoved: 3,
      expenseEventsCreated: 2,
    });
    const dates = (await sellOutRows(fx.storeId)).map((r) => r.expense_date);
    expect(dates).toHaveLength(2);
  });

  it("rejects FIXED_AMOUNT deductions with 400", async () => {
    const fx = await createFixture({ basis: "FIXED_AMOUNT" });

    const res = await postDeduction(fx.storeId, fx.deductionId);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      status: "error",
      error: "INVALID_REQUEST",
    });
  });

  it("returns 404 when the deduction belongs to a different store", async () => {
    const fx = await createFixture();
    const other = await createFixture();

    const res = await postDeduction(other.storeId, fx.deductionId);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ status: "error", error: "NOT_FOUND" });
    expect(await sellOutRows(other.storeId)).toHaveLength(0);
    expect(await sellOutRows(fx.storeId)).toHaveLength(0);
  });

  it("returns 404 for unknown store or deduction", async () => {
    const fx = await createFixture();

    expect((await postDeduction(fx.storeId, 999999999)).status).toBe(404);
    expect((await postDeduction(999999999, fx.deductionId)).status).toBe(404);
  });

  it("returns 400 for malformed ids, including values above the BIGINT max", async () => {
    const fx = await createFixture();

    expect((await postDeduction("abc", fx.deductionId)).status).toBe(400);
    expect((await postDeduction("0", fx.deductionId)).status).toBe(400);
    expect(
      (await postDeduction(fx.storeId, "9223372036854775808")).status,
    ).toBe(400);
    expect(
      (await postDeduction(fx.storeId, "99999999999999999999999")).status,
    ).toBe(400);
    expect((await postDeduction(fx.storeId, fx.deductionId)).status).toBe(200);
  });

  it("creates zero-cost events for a 0.00 rate", async () => {
    const fx = await createFixture({ value: "0.00" });

    const res = await postDeduction(fx.storeId, fx.deductionId);

    expect(res.status).toBe(200);
    expect(res.body.expenseEventsCreated).toBe(3);
    for (const row of await sellOutRows(fx.storeId)) {
      expect(row.cost).toBe("0.00");
    }
  });

  it("processes an inverted window honestly: removes prior events, creates none", async () => {
    const fx = await createFixture({
      from: new Date("2026-02-01T09:00:00Z"),
      to: new Date("2026-01-01T09:00:00Z"),
    });

    const res = await postDeduction(fx.storeId, fx.deductionId);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      expenseEventsRemoved: 0,
      expenseEventsCreated: 0,
    });
  });

  it("serializes concurrent duplicate calls and ends in a correct state", async () => {
    const fx = await createFixture();

    const [a, b] = await Promise.all([
      postDeduction(fx.storeId, fx.deductionId),
      postDeduction(fx.storeId, fx.deductionId),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await sellOutRows(fx.storeId)).toHaveLength(3);
  });

  it("lets two overlapping same-type deductions co-own their events", async () => {
    const fx = await createFixture({ type: "TEST_FEE" });

    // A second deduction of the same type over the same window used to
    // collide with the first deduction's primary keys (409). The
    // deduction-scoped unique key lets both own their own rows.
    const [second] = (await sequelize.query(
      `INSERT INTO vendor.deductions (
         store_id, deduction_type, deduction_basis, deduction_value, currency,
         vendor_code, effective_date_from, effective_date_to, is_active,
         created_at, updated_at)
       VALUES ($1, 'TEST_FEE', 'NET_RECEIPTS', '0.20', 'USD', 'V_TEST2',
               $2, $3, TRUE, now(), now())
       RETURNING deduction_id`,
      { bind: [fx.storeId, fx.from, fx.to], type: QueryTypes.SELECT },
    )) as { deduction_id: number }[];

    const first = await postDeduction(fx.storeId, fx.deductionId);
    const overlap = await postDeduction(fx.storeId, second.deduction_id);

    expect(first.status).toBe(200);
    expect(overlap.status).toBe(200);
    expect(overlap.body).toMatchObject({
      status: "success",
      expenseEventsCreated: 3,
    });
    // Both deductions' events coexist for the same products and dates.
    const rows = await sellOutRows(fx.storeId);
    expect(rows).toHaveLength(6);
    expect(rows.filter((r) => r.deduction_id === fx.deductionId)).toHaveLength(
      3,
    );
    expect(
      rows.filter((r) => r.deduction_id === second.deduction_id),
    ).toHaveLength(3);
  });
});
