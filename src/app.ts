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
import {
  hugoBufferInboundRouter,
  isHugoBufferInboundEnabled
} from "./modules/hugo-flow/hugo-buffer-inbound.routes.js";
import {
  isHugoOperationsFormEnabled,
  operationsIntakeRouter
} from "./modules/operations-intake/operations-intake.routes.js";
import { demoRouter } from "./modules/demo/demo.routes.js";
import { isLogitecSimplePreviewEnabled } from "./modules/demo/logitec-simple-preview.feature.js";
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

const helmetCspDirectives: Record<string, null | string[]> = {
  "img-src": ["'self'", "data:", "https:"]
};
if (env.NODE_ENV !== "production") {
  // LAN QA uses plain HTTP; upgrade-insecure-requests breaks CSS/JS subresources on phones.
  helmetCspDirectives["upgrade-insecure-requests"] = null;
}

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: helmetCspDirectives
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
app.use("/api/operations-intake", operationsIntakeRouter);
app.use("/api/demo", demoRouter);
app.use("/api/hugo-flow", hugoBufferInboundRouter);
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
app.get("/pda-scanner-lab.html", pdaScannerLabPageGate, (_req, res) => {
  res.sendFile(path.join(publicDir, "pda-scanner-lab.html"));
});
app.get("/hugo-buffer-inbound.html", (_req, res) => {
  if (!isHugoBufferInboundEnabled()) {
    res.status(404).send("Not Found");
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.sendFile(path.join(publicDir, "hugo-buffer-inbound.html"));
});
function logHugoIntakeAsset(req: express.Request, asset: string, status: number) {
  console.info("[hugo-intake-asset]", req.method, req.path, {
    asset,
    status,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get("user-agent") || ""
  });
}

function sendHugoOperationsIntakeAsset(
  req: express.Request,
  res: express.Response,
  filename: "hugo-operations-intake.html" | "hugo-operations-intake.css" | "hugo-operations-intake.js",
  contentType: "text/html" | "text/css" | "application/javascript"
) {
  if (!isHugoOperationsFormEnabled()) {
    logHugoIntakeAsset(req, filename, 404);
    res.status(404).type("text/plain").send("Not Found");
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.type(contentType);
  logHugoIntakeAsset(req, filename, 200);
  res.sendFile(path.join(publicDir, filename));
}

app.get("/hugo-operations-intake.html", (req, res) => {
  sendHugoOperationsIntakeAsset(req, res, "hugo-operations-intake.html", "text/html");
});
app.get("/hugo-operations-intake.css", (req, res) => {
  sendHugoOperationsIntakeAsset(req, res, "hugo-operations-intake.css", "text/css");
});
app.get("/hugo-operations-intake.js", (req, res) => {
  sendHugoOperationsIntakeAsset(req, res, "hugo-operations-intake.js", "application/javascript");
});

function sendLogitecPreviewAsset(
  req: express.Request,
  res: express.Response,
  filename:
    | "logitec-simple-demo.html"
    | "logitec-simple-demo.css"
    | "logitec-simple-demo.js"
    | "logitec-role-demo.html"
    | "logitec-role-demo.css"
    | "logitec-role-demo.js",
  contentType: "text/html" | "text/css" | "application/javascript"
) {
  if (!isLogitecSimplePreviewEnabled()) {
    res.status(404).type("text/plain").send("Not Found");
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.type(contentType);
  res.sendFile(path.join(publicDir, filename));
}

app.get("/logitec-simple-demo.html", (req, res) => {
  sendLogitecPreviewAsset(req, res, "logitec-simple-demo.html", "text/html");
});
app.get("/logitec-simple-demo.css", (req, res) => {
  sendLogitecPreviewAsset(req, res, "logitec-simple-demo.css", "text/css");
});
app.get("/logitec-simple-demo.js", (req, res) => {
  sendLogitecPreviewAsset(req, res, "logitec-simple-demo.js", "application/javascript");
});
app.get("/logitec-role-demo.html", (req, res) => {
  sendLogitecPreviewAsset(req, res, "logitec-role-demo.html", "text/html");
});
app.get("/logitec-role-demo.css", (req, res) => {
  sendLogitecPreviewAsset(req, res, "logitec-role-demo.css", "text/css");
});
app.get("/logitec-role-demo.js", (req, res) => {
  sendLogitecPreviewAsset(req, res, "logitec-role-demo.js", "application/javascript");
});
app.use(express.static(publicDir));

app.get(/^\/(?!api|health)(?!.*\.(?:css|js|html|wasm|png|jpe?g|gif|webp|svg|ico|json|map|txt|pdf|woff2?)).*$/, (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use(errorHandler);
