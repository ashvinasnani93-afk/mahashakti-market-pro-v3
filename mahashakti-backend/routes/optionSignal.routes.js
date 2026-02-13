// ==========================================
// OPTION SIGNAL ROUTES
// MAHASHAKTI MARKET PRO
// Endpoint: POST /api/option-signal
// Uses internal StrikeIntelligenceService
// ==========================================

const express = require('express');
const router = express.Router();
const { StrikeIntelligenceService } = require('../services/strikeIntel.service');

const strikeIntelService = new StrikeIntelligenceService();

// POST /api/option-signal
router.post('/', async (req, res) => {
  try {
    const { symbol, strike, optionType, expiry } = req.body;
    
    if (!symbol || !strike || !optionType) {
      return res.json({ status: false, error: 'Required: symbol, strike, optionType' });
    }
    
    if (!['CE', 'PE'].includes(optionType.toUpperCase())) {
      return res.json({ status: false, error: 'optionType must be CE or PE' });
    }
    
    const result = await strikeIntelService.getStrikeIntel(
      symbol.toUpperCase(),
      parseInt(strike),
      optionType.toUpperCase(),
      expiry
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('[OptionSignal] Error:', error.message);
    res.status(500).json({ status: false, error: error.message });
  }
});

// GET /api/option-signal/health
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Option Signal Intelligence' });
});

module.exports = router;
