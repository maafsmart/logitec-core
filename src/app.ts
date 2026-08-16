import "express-async-errors";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./config/env.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { catalogRouter } from "./modules/catalog/catalog.routes.js";
import { clientsRouter } from "./modules/clients/clients.routes.js";
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

export const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");

app.use(helmet());
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
app.use("/api/admin", adminRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/users", usersRouter);
app.use("/api/comments", commentsRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/imports", importsRouter);
app.use("/api/exports", exportsRouter);
app.use("/api/picking", pickingRouter);
app.use("/api/requisitions", requisitionsRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/traceability", traceabilityRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/incidents", incidentsRouter);
app.use(express.static("public"));

app.get(/^\/(?!api|health).*/, (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});
