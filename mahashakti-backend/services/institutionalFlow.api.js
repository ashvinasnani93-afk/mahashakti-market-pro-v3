// ==========================================
// INSTITUTIONAL FLOW API (FII / DII)
// ROLE: Context / Confidence Tag ONLY
// ==========================================

const express = require("express");
const router = express.Router();

const { analyzeInstitutionalFlow } = require("./institutionalFlow.service");

// ✅ ONLY /flow
router.post("/flow", (req, res) => {
  try {
    const result = analyzeInstitutionalFlow(req.body || {});
    return res.json({
      status: "OK",
      data: result,
    });
  } catch (e) {
    return res.status(500).json({
      status: "ERROR",
      message: "Institutional flow analysis failed",
    });
  }
});

module.exports = router;
