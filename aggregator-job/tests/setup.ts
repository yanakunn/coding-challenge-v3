import { sequelize } from '../src/models';

beforeAll(async () => {
  try {
    await sequelize.authenticate();
  } catch (error) {
    console.error('Unable to connect to the database for tests:', error);
  }
});

afterAll(async () => {
  await sequelize.close();
});
