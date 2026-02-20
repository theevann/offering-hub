const express = require("express");
const router = express.Router();
const ingestionService = require("../services/ingestionService");

router.post("/raw", async (req, res) => {
  try {
    const result = await ingestionService.ingestRawMessage(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.error("POST /ingest/raw error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;