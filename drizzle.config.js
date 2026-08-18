import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./server/database/schema.js",
  out: "./server/database/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: "./database/taxpayer.db",
  },
});
