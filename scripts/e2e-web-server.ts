import dotenv from "dotenv";

dotenv.config();

process.env.NODE_ENV = "development";
process.env.DATABASE_ENVIRONMENT = "development";

await import("../src/server.ts");
