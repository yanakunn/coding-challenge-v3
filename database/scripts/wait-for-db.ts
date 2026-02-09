#!/usr/bin/env node

import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const maxRetries = 30;
const retryDelay = 1000;

const config = {
  host: 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'marketplace',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
};

async function waitForDatabase(): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const client = new Client(config);

    try {
      console.log(`[${attempt}/${maxRetries}] Attempting to connect to database...`);
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      console.log('✓ Database is ready!');
      process.exit(0);
    } catch (error) {
      await client.end().catch(() => {});

      if (attempt === maxRetries) {
        console.error('✗ Failed to connect to database after', maxRetries, 'attempts');
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }

      console.log(`  Connection failed, retrying in ${retryDelay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
}

waitForDatabase();
