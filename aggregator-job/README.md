# Aggregator Job

Node.js/TypeScript Express API with Sequelize ORM for marketplace aggregator operations.

## Database Setup

To get the database running quickly, use the [`database/`](../database/) project in this repo:

```bash
cd ../database
cp .env.example .env
npm run db:setup
```

That will start PostgreSQL/TimescaleDB, run migrations, and seed data. The aggregator-job expects the same connection (localhost, port 5432, database `marketplace`, user `postgres`).

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment**
   ```bash
   cp .env.example .env
   ```
   Adjust `.env` if your database runs elsewhere (see [database README](../database/README.md) for default values).

## Scripts

- `npm run dev` – Start development server with hot reload
- `npm run build` – Compile TypeScript
- `npm run start` – Run compiled app (`node dist/server.js`)
- `npm run test` – Run tests with coverage
- `npm run lint` / `npm run lint:fix` – ESLint
- `npm run format` – Prettier

## Running

With the database up and `.env` set:

```bash
npm run dev
```

API runs at `http://localhost:3000` by default (configurable via `PORT` in `.env`).
