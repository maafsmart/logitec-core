import "express-async-errors";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./config/env.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import {
  createPdaScannerLabGate,
  isPdaScannerLabEnabled
} from "./modules/admin/pda-scanner-lab.feature.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { catalogRouter } from "./modules/catalog/catalog.routes.js";
import { clientsRouter } from "./modules/clients/clients.routes.js";
import { warehousesRouter } from "./modules/master-data/warehouses.routes.js";
import { commentsRouter } from "./modules/comments/comments.routes.js";
import { incidentsRouter } from "./modules/incidents/incidents.routes.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import { importsRouter } from "./modules/imports/imports.routes.js";
import { exportsRouter } from "./modules/exports/exports.routes.js";
import { pickingRouter } from "./modules/picking/picking.routes.js";
import { requisitionsRouter } from "./modules/requisitions/requisitions.routes.js";
import { tasksRouter } from "./modules/tasks/tasks.routes.js";
import { traceabilityRouter } from "./modules/traceability/traceability.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { pdaRouter } from "./modules/pda/pda.routes.js";
import { errorHandler } from "./middlewares/error.middleware.js";

export const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");
const barcodeDetectorPolyfill = path.resolve(
  __dirname,
  "../node_modules/barcode-detector/dist/iife/polyfill.js"
);
const barcodeDetectorWasm = path.resolve(
  __dirname,
  "../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm"
);
const barcodeWriterScript = path.resolve(
  __dirname,
  "../node_modules/zxing-wasm/dist/iife/writer/index.js"
);
const barcodeWriterWasm = path.resolve(
  __dirname,
  "../node_modules/zxing-wasm/dist/writer/zxing_writer.wasm"
);
const pdaScannerLabPageGate = createPdaScannerLabGate(
  isPdaScannerLabEnabled(env.ENABLE_PDA_SCANNER_LAB)
);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "img-src": ["'self'", "data:", "https:"]
      }
    }
  })
);
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "logitec-wms-api",
    environment: env.DATABASE_ENVIRONMENT
  });
});

app.use("/api/auth", authRouter);
app.use("/api/pda", pdaRouter);
app.use("/api/admin", adminRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/warehouses", warehousesRouter);
app.use("/api/users", usersRouter);
app.use("/api/comments", commentsRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/v1/inventory", inventoryRouter);
app.use("/api/imports", importsRouter);
app.use("/api/exports", exportsRouter);
app.use("/api/picking", pickingRouter);
app.use("/api/requisitions", requisitionsRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/traceability", traceabilityRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/incidents", incidentsRouter);
app.get("/vendor/barcode-detector/3.2.2/polyfill.js", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(barcodeDetectorPolyfill);
});
app.get("/vendor/zxing-wasm/3.1.3/zxing_reader.wasm", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.type("application/wasm").sendFile(barcodeDetectorWasm);
});
app.get("/vendor/zxing-wasm/3.1.3/writer.js", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(barcodeWriterScript);
});
app.get("/vendor/zxing-wasm/3.1.3/zxing_writer.wasm", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.type("application/wasm").sendFile(barcodeWriterWasm);
});
function sendPdaPage(fileName: string) {
  return (_req: express.Request, res: express.Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.sendFile(path.join(publicDir, fileName));
  };
}

app.get("/pda-pair.html", pdaScannerLabPageGate, sendPdaPage("pda-pair.html"));
app.get("/pda-scanner-lab.html", pdaScannerLabPageGate, sendPdaPage("pda-scanner-lab.html"));
app.get("/pda-test-evidence.html", pdaScannerLabPageGate, (_req, res) => {
  res.sendFile(path.join(publicDir, "pda-test-evidence.html"));
});
app.use(express.static("public"));

app.get(/^\/(?!api|health).*/, (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use(errorHandler);
