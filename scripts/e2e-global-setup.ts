import dotenv from "dotenv";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { assertE2eHarnessReady } from "../src/scripts/e2e-safety.js";

dotenv.config();

export default async function globalSetup() {
  assertE2eHarnessReady(process.env);
  mkdirSync(path.resolve("test/e2e/evidence"), { recursive: true });
}
