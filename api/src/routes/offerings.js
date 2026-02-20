const express = require("express");
const router = express.Router();
const offeringService = require("../services/offeringService");

router.get("/all", async (req, res) => {
  try {
    const result = await offeringService.getAllOfferings();
    res.status(200).json(result);
  } catch (err) {
    console.error("GET /offerings/all error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/raw/all", async (req, res) => {
  try {
    const result = await offeringService.getAllRawMessages();
    res.status(200).json(result);
  } catch (err) {
    console.error("GET /offerings/raw/all error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
