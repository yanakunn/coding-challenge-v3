# Coding Challenge

This coding challenge is designed to assess how you approach and solve a problem that is very similar to the day-to-day way of working at MerchantSpring. It is based off a real requirement to give you a sense of what the work is like; however, it is not real work for our product.

---

## Overview

This repository contains everything you need to run the challenge locally:

- **`database/`** – TimescaleDB/PostgreSQL database with migrations, seed data, and Docker setup.
- **`aggregator-job/`** – Node.js/TypeScript Express API where you will implement the required functionality.

Your task is described in **`aggregator-job/REQUIREMENTS.md`**. Please read that document for the full API specification and business logic.

---

## Prerequisites

- **Docker and Docker Compose** (for the database)
- **Node.js** (version in each project’s `.nvmrc`)
- **npm**
- **nvm**

---

## Getting Started

### 1. Set up the database

The API depends on a running PostgreSQL/TimescaleDB instance. From the repo root:

```bash
cd database
cp .env.example .env
nvm install
npm install
npm run db:setup
```

This will start the database container, run Flyway migrations, seed data, and verify the setup. Default connection: `localhost:5432`, database `marketplace`, user `postgres`, password `postgres`. See [`database/README.md`](database/README.md) for more options (e.g. `db:teardown`, `db:reset`).

### 2. Set up and run the aggregator job

In another terminal, from the repo root:

```bash
cd aggregator-job
cp .env.example .env
nvm install
npm install
npm run dev
```

The API runs at `http://localhost:3000` by default. Adjust `.env` if your database runs elsewhere (see [`aggregator-job/README.md`](aggregator-job/README.md)).

---

## What to do next

1. Read **`aggregator-job/REQUIREMENTS.md`** for the endpoint specification and business rules.
2. Implement the required behaviour in the `aggregator-job` codebase.
3. Use the existing tests and add more as needed: `npm run test` (from `aggregator-job/`).
4. Lint and format: `npm run lint` / `npm run lint:fix` and `npm run format` (from `aggregator-job/`).

For detailed setup, scripts, and tech stack, see:

- [**database/README.md**](database/README.md) – schema, migrations, Docker, and connection details.
- [**aggregator-job/README.md**](aggregator-job/README.md) – API setup, scripts, and environment.
