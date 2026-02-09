# Marketplace Database

A TimescaleDB-powered database setup for marketplace analytics, featuring automated migrations with Flyway and containerized deployment with Docker.

## Overview

This project provides a complete database infrastructure for tracking marketplace operations including stores, products, sales data, deductions, and expense events. It leverages TimescaleDB's time-series capabilities for efficient handling of sales and expense data.

## Features

- **TimescaleDB/PostgreSQL** for robust relational and time-series data storage
- **Flyway** for version-controlled database migrations
- **Docker Compose** for easy local development setup
- **TypeScript scripts** for database seeding and verification
- **Multi-schema organization** (generic, vendor, public)

## Database Schema

### Generic Schema
- `store` - Marketplace store information
- `product` - Product catalog with store relationships

### Vendor Schema
- `product_sales` - Time-series sales data per product (hypertable)
- `deductions` - Marketplace fee deductions
- `expense_events` - Time-series expense tracking (hypertable)

## Prerequisites

- Docker and Docker Compose
- Node.js (version specified in `.nvmrc`)
- npm

## Setup

1. **Copy environment file**
   ```bash
   cp .env.example .env
   ```

2. **Start the database**
   ```bash
   npm run db:setup
   ```
   This command will:
   - Start PostgreSQL/TimescaleDB container
   - Run Flyway migrations
   - Wait for database readiness
   - Seed initial data
   - Verify the setup

## Available Scripts

### Database Management
- `npm run db:setup` - Complete setup (start DB, migrate, seed, verify)
- `npm run db:teardown` - Stop and remove all containers and volumes
- `npm run db:reset` - Teardown and setup from scratch

### Database Operations
- `npm run db:migrate` - Run Flyway migrations
- `npm run db:seed` - Populate database with seed data
- `npm run db:verify` - Verify database setup
- `npm run db:wait` - Wait for database to be ready
- `npm run db:logs` - View PostgreSQL logs

## Configuration

Environment variables (see `.env.example`):
- `POSTGRES_USER` - Database user (default: postgres)
- `POSTGRES_PASSWORD` - Database password (default: postgres)
- `POSTGRES_DB` - Database name (default: marketplace)
- `POSTGRES_PORT` - Port mapping (default: 5432)

## Migrations

Flyway migration files are located in `./flyway/` directory:
- `V1__initial_version.sql` - Initial schema with hypertables
- `V1.1__add_product_indexes.sql` - Product indexes
- `V1.2__add_vendor_indexes.sql` - Vendor indexes
- `V1.3__add_deduction_id.sql` - Deduction ID field

## Connecting to the Database

```bash
docker exec -it marketplace_db psql -U postgres -d marketplace
```

Or use your preferred PostgreSQL client:
```
Host: localhost
Port: 5432
Database: marketplace
User: postgres
Password: postgres
```

## Development

The project includes TypeScript utilities in the `scripts/` directory:
- `seed-data.ts` - Generates and inserts sample data
- `verify-setup.ts` - Validates database schema and data
- `wait-for-db.ts` - Health check utility

## Tech Stack

- **TimescaleDB** (PostgreSQL 16)
- **Flyway** for migrations
- **Docker/Docker Compose** for containerization
- **TypeScript** for scripting
- **node-postgres (pg)** for database connectivity
- **Faker.js** for generating seed data
