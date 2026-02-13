// ==========================================
// SECTOR PARTICIPATION API
// ROLE: Expose sector participation (CONTEXT ONLY)
// ==========================================

const express = require("express");
const router = express.Router();

const {
  analyzeSectorParticipation,
} = require("./sectorParticipation.service");

/**
 * POST /sector/participation
 * Body:
 * [
 *   { sector, changePercent, volumeRatio }
 * ]
 */
router.post("/sector/participation", (req, res) => {
  try {
    const sectors = req.body || [];
    const result = analyzeSectorParticipation(sectors);

    return res.json({
      status: "OK",
      data: result,
    });
  } catch (e) {
    return res.status(500).json({
      status: "ERROR",
      message: "Sector participation analysis failed",
    });
  }
});

module.exports = router;
