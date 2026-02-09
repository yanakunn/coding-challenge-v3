import app from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { sequelize } from "./models";
import { testConnection } from "./config/database";

const startServer = async () => {
  try {
    // Test database connection on startup
    logger.info("Testing database connection...");
    await testConnection();

    // Start server
    const server = app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received, closing server gracefully...`);

      server.close(async () => {
        logger.info("HTTP server closed");

        try {
          await sequelize.close();
          logger.info("Database connections closed");
          process.exit(0);
        } catch (error) {
          logger.error("Error closing database connections:", error);
          process.exit(1);
        }
      });
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (error) {
    logger.error("Failed to start server:", error);
    logger.error(
      "Unable to connect to database. Please ensure the database exists and credentials are correct.",
    );
    process.exit(1);
  }
};

startServer();
