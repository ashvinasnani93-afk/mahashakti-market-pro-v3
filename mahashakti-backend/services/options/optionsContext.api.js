// ==========================================
// OPTIONS API (PHASE-3)
// Android / Frontend ready
// ==========================================

const { getOptionsContext } = require("../optionsMaster.service.js");

// ------------------------------------------
// GET /options/context
// ------------------------------------------
function getOptionsContextApi(req, res) {
  try {
    const data = req.body || {};

    const result = getOptionsContext(data);

    return res.json({
      status: true,
      data: result,
    });
  } catch (err) {
    console.error("Options API Error:", err.message);

    return res.json({
      status: false,
      message: "Options processing error",
    });
  }
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  getOptionsContextApi,
};
