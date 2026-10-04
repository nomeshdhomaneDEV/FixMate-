// FixHub server entry point (Phase 1: skeleton only).
// Later phases add routes under /api and mount them here.
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { sendSuccess } from "./utils/response.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

// __dirname does not exist in ES modules, so we rebuild it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const app = express();
const PORT = process.env.PORT || 5000;

// --- Global middleware ---
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5000" }));
app.use(express.json({ limit: "2mb" })); // read JSON request bodies

// --- Static files: the website itself ---
app.use(express.static(path.join(ROOT, "client")));
app.use("/shared", express.static(path.join(ROOT, "shared"))); // logic shared with the browser
app.use("/uploads", express.static(path.join(ROOT, "uploads")));

// --- API ---
app.get("/api/health", (req, res) =>
  sendSuccess(res, { app: "FixHub", time: new Date().toISOString() }, "FixHub API is running")
);
// Phase 11 will add: app.use("/api/auth", authRoutes) ... etc.

// --- Errors (must be LAST) ---
app.use("/api", notFound);
app.use(errorHandler);

app.listen(PORT, () => console.log(`FixHub running at http://localhost:${PORT}`));
