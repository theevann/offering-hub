const { createLogger } = require("../utils/logger");
const log = createLogger("routes/ingest");

const express = require("express");
const router = express.Router();
const ingestionService = require("../services/ingestionService");

router.post("/raw", async (req, res) => {
  try {
    const result = await ingestionService.ingestRawMessage(req.body);
    res.status(201).json(result);
  } catch (err) {
    log.error("POST /ingest/raw error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;