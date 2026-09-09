const { createLogger } = require("../utils/logger");
const log = createLogger("routes/offerings");

const express = require("express");
const router = express.Router();
const offeringService = require("../services/offeringService");

function parseNearbyQuery(query) {
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  const radiusKm = query.radiusKm === undefined ? 10 : Number(query.radiusKm);
  const limit = query.limit === undefined ? 20 : Number(query.limit);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error("lat must be a number between -90 and 90");
  }

  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error("lng must be a number between -180 and 180");
  }

  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 500) {
    throw new Error("radiusKm must be a number greater than 0 and at most 500");
  }

  if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
    throw new Error("limit must be an integer between 1 and 100");
  }

  return { lat, lng, radiusKm, limit };
}

router.get("/all", async (req, res) => {
  try {
    const result = await offeringService.getAllOfferings();
    res.status(200).json(result);
  } catch (err) {
    log.error("GET /offerings/all error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/nearby", async (req, res) => {
  try {
    const query = parseNearbyQuery(req.query);
    const result = await offeringService.getNearbyOfferings(query);
    res.status(200).json(result);
  } catch (err) {
    const statusCode = err.message.includes("must be") ? 400 : 500;
    log.error("GET /offerings/nearby error:", err);
    res.status(statusCode).json({ error: err.message });
  }
});

router.get("/raw/all", async (req, res) => {
  res.status(410).json({ error: "This endpoint is deprecated and will be removed in the future." });
  // TODO:
  try {
    const result = await offeringService.getAllRawMessages_deprecated();
    res.status(200).json(result);
  } catch (err) {
    log.error("GET /offerings/raw/all error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
