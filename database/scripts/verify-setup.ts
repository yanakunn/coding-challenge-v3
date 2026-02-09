#!/usr/bin/env node

import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

function checkMark(actual: string | number, expected: number): string {
  return String(actual) === String(expected) ? '✓' : '✗';
}

async function verifySetup(): Promise<void> {
  const client = new Client({
    host: 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'marketplace',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
  });

  try {
    await client.connect();
    console.log('\n=== Database Setup Verification ===\n');

    const storeCount = await client.query('SELECT COUNT(*) FROM generic.store');
    const productCount = await client.query('SELECT COUNT(*) FROM generic.product');
    const salesCount = await client.query('SELECT COUNT(*) FROM vendor.product_sales');
    const deductionsCount = await client.query('SELECT COUNT(*) FROM vendor.deductions');
    const expenseEventsCount = await client.query('SELECT COUNT(*) FROM vendor.expense_events');

    const storesExpected = 3;
    const productsExpected = 30;
    const deductionsExpected = 6;
    const salesExpected = 30 * 180; // 30 products × 180 days each = 5400

    console.log('Record Counts:');
    console.log(`  ${checkMark(storeCount.rows[0].count, storesExpected)} Stores: ${storeCount.rows[0].count} (expected: ${storesExpected})`);
    console.log(`  ${checkMark(productCount.rows[0].count, productsExpected)} Products: ${productCount.rows[0].count} (expected: ${productsExpected})`);
    console.log(`  ${checkMark(salesCount.rows[0].count, salesExpected)} Sales Records: ${salesCount.rows[0].count} (expected: ${salesExpected})`);
    console.log(`  ${checkMark(deductionsCount.rows[0].count, deductionsExpected)} Deductions: ${deductionsCount.rows[0].count} (expected: ${deductionsExpected})`);
    console.log(`  ✓ Expense Events: ${expenseEventsCount.rows[0].count} (variable count expected)`);

    const extensionCheck = await client.query(
      "SELECT COUNT(*) FROM pg_extension WHERE extname = 'timescaledb'"
    );
    console.log(`  ${checkMark(extensionCheck.rows[0].count, 1)} TimescaleDB Extension: ${extensionCheck.rows[0].count} (expected: 1)`);

    console.log('\nSample Data:');

    const stores = await client.query('SELECT * FROM generic.store LIMIT 3');
    console.log('\n  Stores:');
    for (const store of stores.rows as { marketplace_type: string; marketplace_subtype: string; marketplace_country: string; merchant_id: string }[]) {
      console.log(`    - ${store.marketplace_type} ${store.marketplace_subtype} (${store.marketplace_country}) - ${store.merchant_id}`);
    }

    const products = await client.query('SELECT * FROM generic.product LIMIT 5');
    console.log('\n  Products (first 5):');
    for (const product of products.rows as { product_id: number; title: string; price: string }[]) {
      console.log(`    - ${product.product_id}: ${product.title} ($${product.price})`);
    }

    const deductions = await client.query(`
      SELECT deduction_type, deduction_basis, deduction_value
      FROM vendor.deductions
      WHERE store_id = 1
      ORDER BY deduction_id
      LIMIT 3
    `);
    console.log('\n  Deductions (first 3 for Store 1):');
    for (const ded of deductions.rows as { deduction_type: string; deduction_basis: string; deduction_value: string }[]) {
      console.log(`    - ${ded.deduction_type}: ${ded.deduction_value} (${ded.deduction_basis})`);
    }

    const salesSummary = await client.query(`
      SELECT
        MIN(report_date) as earliest_sale,
        MAX(report_date) as latest_sale,
        SUM(ordered_units) as total_quantity,
        SUM(ordered_revenue) as total_revenue
      FROM vendor.product_sales
    `);
    console.log('\n  Sales Summary:');
    const summary = (salesSummary.rows[0] as { earliest_sale: Date; latest_sale: Date; total_quantity: string; total_revenue: string }) || {};
    console.log(`    - Date Range: ${summary.earliest_sale} to ${summary.latest_sale}`);
    console.log(`    - Total Quantity Sold: ${summary.total_quantity}`);
    console.log(`    - Total Revenue: $${parseFloat(summary.total_revenue || '0').toFixed(2)}`);

    const expenseSummary = await client.query(`
      SELECT
        MIN(expense_date) as earliest_expense,
        MAX(expense_date) as latest_expense,
        COUNT(DISTINCT expense_subtype) as unique_subtypes,
        SUM(cost) as total_cost
      FROM vendor.expense_events
    `);
    console.log('\n  Expense Events Summary:');
    const expSummary = (expenseSummary.rows[0] as { earliest_expense: Date; latest_expense: Date; unique_subtypes: string; total_cost: string }) || {};
    const earliestStr = expSummary.earliest_expense instanceof Date ? expSummary.earliest_expense.toISOString().split('T')[0] : '';
    const latestStr = expSummary.latest_expense instanceof Date ? expSummary.latest_expense.toISOString().split('T')[0] : '';
    console.log(`    - Date Range: ${earliestStr} to ${latestStr}`);
    console.log(`    - Unique Subtypes: ${expSummary.unique_subtypes} (warehousing, storage, transport)`);
    console.log(`    - Total Cost: $${parseFloat(expSummary.total_cost || '0').toFixed(2)}`);

    console.log('\n=== Verification Complete ===\n');

    await client.end();

    const allChecksPass =
      Number(storeCount.rows[0].count) === storesExpected &&
      Number(productCount.rows[0].count) === productsExpected &&
      Number(salesCount.rows[0].count) === salesExpected &&
      Number(deductionsCount.rows[0].count) === deductionsExpected &&
      Number(expenseEventsCount.rows[0].count) > 0 &&
      Number(extensionCheck.rows[0].count) === 1;

    process.exit(allChecksPass ? 0 : 1);
  } catch (error) {
    console.error('✗ Error verifying setup:', error instanceof Error ? error.message : error);
    await client.end().catch(() => {});
    process.exit(1);
  }
}

verifySetup();
