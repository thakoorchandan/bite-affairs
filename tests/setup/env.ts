// Tests run against an in-process PGlite Postgres (no DATABASE_URL), created fresh per test file.
// The variables are pinned to empty/remote values (not deleted): scripts imported by tests (e.g. scripts/seed.ts → _env.ts)
// load .env.local with dotenv, which only fills variables that are unset. Deleting them would let a developer's
// DB_MODE=local / DATABASE_URL leak in, and resetDatabase() would then truncate that real database.
process.env.DB_MODE = "remote";
process.env.DATABASE_URL = "";
process.env.DIRECT_URL = "";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
