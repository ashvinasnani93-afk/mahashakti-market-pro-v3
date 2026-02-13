// ==========================================
// MOMENTUM SCANNER API
// ROLE: Expose momentum scanner (NO SIGNAL)
// ==========================================

const express = require("express");
const router = express.Router();

const { scanMomentum } = require("./momentumScanner.service");

/**
 * POST /scanner/momentum
 * Body:
 * - price
 * - currentVolume
 * - avgVolume
 * - rangeHigh
 * - close
 */
router.post("/scanner/momentum", (req, res) => {
  try {
    const result = scanMomentum(req.body || {});
    return res.json({
      status: "OK",
      data: result,
    });
  } catch (err) {
    return res.status(500).json({
      status: "ERROR",
      message: "Momentum scanner failed",
    });
  }
});

module.exports = router;
