#!/usr/bin/env node

import * as dotenv from "dotenv";

import { Client } from "pg";
import { faker } from "@faker-js/faker";

dotenv.config();

const DAYS_TO_GENERATE = 180;
const EXPENSE_DAYS_TO_GENERATE = 90;
const BATCH_SIZE = 100;

const dbConfig = {
  host: "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
  database: process.env.POSTGRES_DB || "marketplace",
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "postgres",
};

interface StoreRow {
  store_id: number;
  marketplace_type: string;
  marketplace_subtype: string;
  marketplace_country: string;
  source_system_id: string;
  merchant_id: string;
}

interface ProductRow {
  product_id: number;
  store_id: number;
}

const STORE_CONFIGS = [
  {
    marketplace_type: "amazon",
    marketplace_subtype: "amazon",
    marketplace_country: "US",
    source_system_id: "MERCH001",
    merchant_id: "MERCH001",
  },
  {
    marketplace_type: "walmart",
    marketplace_subtype: "walmart",
    marketplace_country: "US",
    source_system_id: "MERCH002",
    merchant_id: "MERCH002",
  },
  {
    marketplace_type: "amazon",
    marketplace_subtype: "amazon",
    marketplace_country: "UK",
    source_system_id: "MERCH003",
    merchant_id: "MERCH003",
  },
] as const;

const DEDUCTION_TYPES = [
  "SUBSCRIPTION_FEE",
  "FULFILLMENT_FEE",
  "STORAGE_FEE",
  "ADVERTISING_FEE",
  "REFERRAL_FEE",
  "SERVICE_FEE",
] as const;

const EXPENSE_SUBTYPES = ["warehousing", "storage", "transport"] as const;

async function seedBaseData(client: Client): Promise<void> {
  console.log("Seeding base data (stores, products, deductions)...");

  faker.seed(42);

  // Insert stores
  for (let i = 0; i < STORE_CONFIGS.length; i++) {
    const cfg = STORE_CONFIGS[i];
    const createdAt = faker.date.past({ years: 0.5 });
    const updatedAt = faker.date.between({ from: createdAt, to: new Date() });

    await client.query(
      `INSERT INTO generic.store (
        marketplace_type, marketplace_subtype, marketplace_country, source_system_id,
        merchant_id, is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7)`,
      [
        cfg.marketplace_type,
        cfg.marketplace_subtype,
        cfg.marketplace_country,
        cfg.source_system_id,
        cfg.merchant_id,
        createdAt,
        updatedAt,
      ],
    );
  }

  const storesResult = await client.query<StoreRow>(
    `SELECT 
      store_id, 
      marketplace_type, 
      marketplace_subtype, 
      marketplace_country, 
      source_system_id, 
      merchant_id 
    FROM generic.store 
    ORDER BY store_id`,
  );
  const stores = storesResult.rows;

  // Insert 10 products per store (30 total)
  const productCategories = [
    [
      "Wireless Earbuds",
      "Smart Watch",
      "Portable Charger",
      "USB-C Hub",
      "Screen Protector",
      "Phone Stand",
      "Tablet Case",
      "Cable Organizer",
      "Webcam",
      "Desk Lamp",
    ],
    [
      "Coffee Maker",
      "Air Fryer",
      "Blender",
      "Toaster",
      "Kettle",
      "Food Container Set",
      "Cutting Board",
      "Knife Set",
      "Cookware Set",
      "Kitchen Scale",
    ],
    [
      "Yoga Mat",
      "Resistance Bands",
      "Water Bottle",
      "Dumbbells",
      "Jump Rope",
      "Foam Roller",
      "Running Belt",
      "Fitness Tracker",
      "Gym Bag",
      "Hand Grip",
    ],
  ];

  for (const store of stores) {
    const categoryIndex = (store.store_id - 1) % 3;
    const categoryProducts = productCategories[categoryIndex];

    for (let num = 1; num <= 10; num++) {
      const sellerSku = `SKU-${store.store_id}-${String(num).padStart(3, "0")}`;
      const productSku = `PROD-${store.store_id}-${String(num).padStart(3, "0")}`;
      const sourceSystemId = `${store.source_system_id}_${sellerSku}`;
      const title = `${faker.commerce.department()} - ${categoryProducts[num - 1]} ${faker.commerce.productAdjective()}`;
      const imageUrl = faker.image.urlLoremFlickr({ category: "product" });
      const linkUrl = faker.internet.url();
      const price = faker.commerce.price({ min: 19.99, max: 269.99, dec: 2 });
      const brand = faker.helpers.arrayElement([
        "BrandA",
        "BrandB",
        faker.company.name(),
      ]);
      const fulfilledBy = faker.helpers.arrayElement(["FBA", "FBM"]);
      const createdAt = faker.date.past({ years: 0.25 });
      const updatedAt = faker.date.between({ from: createdAt, to: new Date() });

      await client.query(
        `INSERT INTO generic.product (
          store_id, marketplace_type, marketplace_subtype, marketplace_country, source_system_id,
          seller_sku, product_sku, title, image_url, link_url, 
          price, brand, fulfilled_by, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE, $14, $15)`,
        [
          store.store_id,
          store.marketplace_type,
          store.marketplace_subtype,
          store.marketplace_country,
          sourceSystemId,
          sellerSku,
          productSku,
          title,
          imageUrl,
          linkUrl,
          price,
          brand,
          fulfilledBy,
          createdAt,
          updatedAt,
        ],
      );
    }
  }

  // Insert 6 deductions for store_id 1
  const effectiveFrom = faker.date.past({ years: 0.25 });
  const effectiveTo = faker.date.future({ years: 1 });

  for (let i = 0; i < DEDUCTION_TYPES.length; i++) {
    const deductionType = DEDUCTION_TYPES[i];
    const deductionValue = faker.number.float({ min: 0, max: 0.1, fractionDigits: 2 }).toFixed(2);
    const vendorCode = `VENDOR_${String(i + 1).padStart(3, "0")}`;
    const createdAt = faker.date.past({ years: 0.25 });
    const updatedAt = faker.date.between({ from: createdAt, to: new Date() });

    await client.query(
      `INSERT INTO vendor.deductions (
        store_id, deduction_type, deduction_basis, deduction_value, currency,
        vendor_code, effective_date_from, effective_date_to, is_active, created_at, updated_at
      ) VALUES (1, $1, 'NET_RECEIPTS', $2, 'USD', $3, $4, $5, TRUE, $6, $7)`,
      [
        deductionType,
        deductionValue,
        vendorCode,
        effectiveFrom,
        effectiveTo,
        createdAt,
        updatedAt,
      ],
    );
  }

  console.log(
    `  ✓ ${stores.length} stores, ${stores.length * 10} products, ${DEDUCTION_TYPES.length} deductions`,
  );
}

async function seedTimeseriesData(client: Client): Promise<void> {
  const productsResult = await client.query<ProductRow>(
    "SELECT product_id, store_id FROM generic.product ORDER BY product_id",
  );
  const products = productsResult.rows;
  console.log(`\nSeeding timeseries data for ${products.length} products...`);

  let totalSalesInserted = 0;
  let salesBatch: Record<string, unknown>[] = [];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - DAYS_TO_GENERATE);

  for (const product of products) {
    for (let day = 0; day < DAYS_TO_GENERATE; day++) {
      const saleDate = new Date(startDate);
      saleDate.setDate(saleDate.getDate() + day);

      const dayOfWeek = saleDate.getDay();
      const weekendBoost = dayOfWeek === 0 || dayOfWeek === 6 ? 1.3 : 1.0;
      const randomVariation =
        0.8 + faker.number.float({ min: 0, max: 0.4, fractionDigits: 4 });
      const growthFactor = 1 + (day / DAYS_TO_GENERATE) * 0.2;
      const baseQuantity = faker.number.int({ min: 3, max: 8 });
      const quantity = Math.max(
        1,
        Math.round(
          baseQuantity * weekendBoost * randomVariation * growthFactor,
        ),
      );

      const baseRevenue = faker.number.float({
        min: 80,
        max: 280,
        fractionDigits: 2,
      });
      const revenue = parseFloat((baseRevenue * quantity).toFixed(2));
      const updatedAt = faker.date.between({
        from: saleDate,
        to: new Date(saleDate.getTime() + 48 * 60 * 60 * 1000),
      });

      const orderedUnits = quantity;
      const shippedUnits = Math.floor(quantity * 0.95);
      const customerReturns = Math.floor(quantity * 0.05);
      const orderedRevenue = revenue;
      const shippedRevenue = parseFloat((orderedRevenue * 0.95).toFixed(2));
      const shippedCogs = parseFloat((shippedRevenue * 0.6).toFixed(2));

      salesBatch.push({
        product_id: product.product_id,
        store_id: product.store_id,
        ordered_revenue: orderedRevenue,
        ordered_units: orderedUnits,
        shipped_revenue: shippedRevenue,
        shipped_units: shippedUnits,
        shipped_cogs: shippedCogs,
        customer_returns: customerReturns,
        shipped_revenue_total: shippedRevenue,
        shipped_units_total: shippedUnits,
        shipped_cogs_total: shippedCogs,
        customer_returns_total: customerReturns,
        report_date: saleDate,
        created_at: saleDate,
        updated_at: updatedAt,
      });

      if (salesBatch.length >= BATCH_SIZE) {
        await insertSalesBatch(client, salesBatch);
        totalSalesInserted += salesBatch.length;
        process.stdout.write(`\r  Sales: ${totalSalesInserted} records...`);
        salesBatch = [];
      }
    }
  }

  if (salesBatch.length > 0) {
    await insertSalesBatch(client, salesBatch);
    totalSalesInserted += salesBatch.length;
  }
  console.log(`\n  ✓ ${totalSalesInserted} sales records`);

  await seedExpenseEvents(client);
}

async function insertSalesBatch(
  client: Client,
  records: Record<string, unknown>[],
): Promise<void> {
  const values: unknown[] = [];
  const placeholders: string[] = [];

  records.forEach((record, index) => {
    const offset = index * 15;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15})`,
    );
    values.push(
      record.product_id,
      record.store_id,
      record.ordered_revenue,
      record.ordered_units,
      record.shipped_revenue,
      record.shipped_units,
      record.shipped_cogs,
      record.customer_returns,
      record.shipped_revenue_total,
      record.shipped_units_total,
      record.shipped_cogs_total,
      record.customer_returns_total,
      record.report_date,
      record.created_at,
      record.updated_at,
    );
  });

  await client.query(
    `INSERT INTO vendor.product_sales (
      product_id, store_id, ordered_revenue, ordered_units, shipped_revenue, shipped_units,
      shipped_cogs, customer_returns, shipped_revenue_total, shipped_units_total,
      shipped_cogs_total, customer_returns_total, report_date, created_at, updated_at
    ) VALUES ${placeholders.join(", ")}`,
    values,
  );
}

async function seedExpenseEvents(client: Client): Promise<void> {
  const storesResult = await client.query<{ store_id: number }>(
    "SELECT store_id FROM generic.store ORDER BY store_id",
  );
  const stores = storesResult.rows;

  let totalExpenseInserted = 0;
  let batch: Record<string, unknown>[] = [];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - EXPENSE_DAYS_TO_GENERATE);

  for (const store of stores) {
    const sourceSystemId = `SYS${String(store.store_id).padStart(3, "0")}`;

    for (let day = 0; day < EXPENSE_DAYS_TO_GENERATE; day++) {
      const expenseDate = new Date(startDate);
      expenseDate.setDate(expenseDate.getDate() + day);

      // One event per subtype per day to avoid PK violation (store_id, source_system_id, expense_date, expense_type, expense_subtype)
      for (const subtype of EXPENSE_SUBTYPES) {
        const cost = faker.commerce.price({ min: 50, max: 500, dec: 2 });
        const updatedAt = faker.date.between({
          from: expenseDate,
          to: new Date(expenseDate.getTime() + 24 * 60 * 60 * 1000),
        });

        batch.push({
          store_id: store.store_id,
          source_system_id: sourceSystemId,
          expense_date: expenseDate,
          expense_type: "chargebacks",
          expense_subtype: subtype,
          cost,
          expense_status: "CONFIRMED",
          created_at: expenseDate,
          updated_at: updatedAt,
        });

        if (batch.length >= BATCH_SIZE) {
          await insertExpenseBatch(client, batch);
          totalExpenseInserted += batch.length;
          process.stdout.write(
            `\r  Expense events: ${totalExpenseInserted}...`,
          );
          batch = [];
        }
      }
    }
  }

  if (batch.length > 0) {
    await insertExpenseBatch(client, batch);
    totalExpenseInserted += batch.length;
  }
  console.log(`\n  ✓ ${totalExpenseInserted} expense events`);
}

async function insertExpenseBatch(
  client: Client,
  records: Record<string, unknown>[],
): Promise<void> {
  const values: unknown[] = [];
  const placeholders: string[] = [];

  records.forEach((record, index) => {
    const offset = index * 10;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`,
    );
    values.push(
      record.store_id,
      record.source_system_id,
      record.expense_date,
      record.expense_type,
      record.expense_subtype,
      record.cost,
      record.expense_status,
      record.created_at,
      record.updated_at,
      // No deduction owns these generic expense lines; 0 is the
      // "un-owned" sentinel reserved by V1.5 (the API rejects 0 as an id).
      0,
    );
  });

  await client.query(
    `INSERT INTO vendor.expense_events (
      store_id, source_system_id, expense_date, expense_type, expense_subtype, cost, expense_status, created_at, updated_at, deduction_id
    ) VALUES ${placeholders.join(", ")}`,
    values,
  );
}

async function main(): Promise<void> {
  const client = new Client(dbConfig);

  try {
    await client.connect();
    console.log("Connected to database");

    await seedBaseData(client);
    await seedTimeseriesData(client);

    await client.end();
    console.log("\n✓ Seed complete");
  } catch (error) {
    console.error(
      "✗ Error seeding data:",
      error instanceof Error ? error.message : error,
    );
    console.error(error instanceof Error ? error.stack : "");
    await client.end().catch(() => {});
    process.exit(1);
  }
}

main();
