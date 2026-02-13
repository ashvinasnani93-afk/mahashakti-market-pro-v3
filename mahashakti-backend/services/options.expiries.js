async function getOptionExpiries(req, res) {
  try {
    const symbol = req.query.symbol;

    if (!symbol) {
      return res.json({
        status: false,
        message: "Symbol required"
      });
    }

    // TEMP STATIC — later Angel / NSE auto-sync
    const EXPIRY_MAP = {
      NIFTY: ["2026-02-01", "2026-02-08", "2026-02-15"],
      BANKNIFTY: ["2026-02-01", "2026-02-08"],
      FINNIFTY: ["2026-02-04", "2026-02-11"]
    };

    const expiries = EXPIRY_MAP[symbol.toUpperCase()] || [];

    return res.json({
      status: true,
      expiries
    });

  } catch (e) {
    console.error("❌ Expiry API Error:", e);
    return res.json({
      status: false,
      message: "Expiry fetch failed"
    });
  }
}

module.exports = {
  getOptionExpiries
};
