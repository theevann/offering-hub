const express = require("express");
const router = express.Router();
const groupService = require("../services/groupService");

router.get("/active", async (req, res) => {
  try {
    const result = await groupService.getActiveGroups();
    res.status(200).json(result);
  } catch (err) {
    console.error("GET /groups/active error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;