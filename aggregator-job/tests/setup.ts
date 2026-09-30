import { sequelize } from "../src/config/database";

// Fail fast with a clear error if the database is unreachable.
beforeAll(async () => {
  await sequelize.authenticate();
});

// Close the connection pool, otherwise its open handles keep jest alive.
afterAll(async () => {
  await sequelize.close();
});
