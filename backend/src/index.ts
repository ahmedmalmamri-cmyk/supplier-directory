import { logger } from "./lib/logger";
import path from "node:path";
import { initializeDirectoryStorage, directoryPersistence } from "./lib/directory-persistence";

const rawPort = process.env["PORT"] || "8080";

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    for (const name of ["DATABASE_URL", "SESSION_SECRET", "ADMIN_PASSWORD", "FRONTEND_URL", "PUBLIC_SITE_URL"]) {
      if (!process.env[name]?.trim()) throw new Error(`${name} is required in production.`);
    }
  }
  await initializeDirectoryStorage(path.resolve(process.cwd(), "data/bakery-directory.sqlite"));
  const { default: app } = await import("./app");
  await directoryPersistence.completeStartup();
  app.listen(port, "0.0.0.0", (err) => {
    if (err) {
      logger.error("Error listening on port");
      process.exit(1);
    }
    logger.info({ port, storage: "postgresql" }, "Server listening");
  });
}

void start().catch(() => {
  logger.error("Durable directory startup failed. Check database connectivity and publish the directory_state/directory_records schema before starting.");
  process.exit(1);
});
