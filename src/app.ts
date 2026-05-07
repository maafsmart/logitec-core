import "express-async-errors";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import { authRouter } from "./modules/auth/auth.routes.js";
import { catalogRouter } from "./modules/catalog/catalog.routes.js";
import { commentsRouter } from "./modules/comments/comments.routes.js";
import { pickingRouter } from "./modules/picking/picking.routes.js";
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
  res.json({ ok: true, service: "logitec-wms-api" });
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/comments", commentsRouter);
app.use("/api/picking", pickingRouter);
app.use("/api/catalog", catalogRouter);
app.use(express.static("public"));

app.get(/^\/(?!api|health).*/, (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});
