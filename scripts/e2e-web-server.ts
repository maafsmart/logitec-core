import dotenv from "dotenv";
import { startE2eWebServer } from "../src/scripts/e2e-safety.js";

dotenv.config();

await startE2eWebServer({
  env: process.env,
  loadServer: () => import("../src/server.ts")
});
