if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({
    path: require("node:path").join(__dirname, "../.env"),
    quiet: true
  });
}

const { createLogger } = require("./utils/logger");
const log = createLogger("api");


const express = require("express");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const corsOriginEnv = process.env.CORS_ORIGIN || "http://localhost:3001";
const allowedOrigins = corsOriginEnv
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  const requestOrigin = req.headers.origin;
  const allowAnyOrigin = allowedOrigins.includes("*");
  const allowListedOrigin = requestOrigin && allowedOrigins.includes(requestOrigin);

  if (allowAnyOrigin) {
    res.header("Access-Control-Allow-Origin", "*");
  } else if (allowListedOrigin) {
    res.header("Access-Control-Allow-Origin", requestOrigin);
    res.header("Vary", "Origin");
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());

const ingestRouter = require("./routes/ingest");
app.use("/ingest", ingestRouter);

const groupsRouter = require("./routes/groups");
app.use("/groups", groupsRouter);

const offeringsRouter = require("./routes/offerings");
app.use("/offerings", offeringsRouter);

app.get("/", (req, res) => {
  res.send("API running");
});

app.get("/healthz", (req, res) => {
  res.status(200).json({ ok: true });
});

const server = app.listen(PORT, HOST, () => {
  const address = server.address();

  if (!address) {
    log.error(`Server failed to bind on ${HOST}:${PORT}`);
    process.exitCode = 1;
    return;
  }

  log.info(`Server running on http://${address.address}:${address.port}`);
});

server.on("error", (error) => {
  log.error(`Failed to start server on ${HOST}:${PORT}:`, error.message);
  process.exit(1);
});
