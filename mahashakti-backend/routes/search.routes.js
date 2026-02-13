// ==========================================
// SEARCH ROUTES - ANGEL SCRIPMASTER
// MAHASHAKTI MARKET PRO
// Endpoint: GET /api/search
// Uses Angel OpenAPI ScripMaster (dynamic, cached)
// ==========================================

const express = require('express');
const router = express.Router();
const axios = require('axios');

// ==========================================
// INSTRUMENT CACHE
// ==========================================
const instrumentCache = {
  data: [],
  lastUpdated: null,
  isLoading: false,
  ttl: 24 * 60 * 60 * 1000, // 24 hours
};

const SCRIPMASTER_URL = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';

// ==========================================
// LOAD SCRIPMASTER
// ==========================================
async function loadScripMaster() {
  if (instrumentCache.isLoading) {
    console.log('[Search] ScripMaster load in progress...');
    return;
  }
  
  instrumentCache.isLoading = true;
  const startTime = Date.now();
  
  try {
    console.log('[Search] Loading Angel ScripMaster...');
    
    const response = await axios.get(SCRIPMASTER_URL, {
      timeout: 60000,
      headers: { 'Accept-Encoding': 'gzip, deflate' },
    });
    
    const rawData = response.data;
    if (!Array.isArray(rawData)) throw new Error('Invalid ScripMaster format');
    
    const processed = [];
    const seen = new Set();
    
    for (const item of rawData) {
      const key = `${item.symbol}_${item.exch_seg}`;
      if (seen.has(key)) continue;
      seen.add(key);
      
      // Categorize
      let type = 'STOCK';
      if (item.instrumenttype === 'OPTIDX' || item.instrumenttype === 'OPTSTK') continue; // Skip individual options
      if (item.instrumenttype === 'FUTIDX' || item.instrumenttype === 'FUTSTK') continue; // Skip futures
      if (['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'].includes(item.symbol)) type = 'INDEX';
      else if (item.exch_seg === 'MCX') type = 'COMMODITY';
      
      processed.push({
        token: item.token,
        symbol: item.symbol,
        name: item.name || item.symbol,
        exchange: item.exch_seg,
        type,
        lotSize: parseInt(item.lotsize) || 1,
        _searchSymbol: item.symbol.toUpperCase(),
        _searchName: (item.name || item.symbol).toUpperCase(),
      });
    }
    
    // Sort: INDEX > STOCK > COMMODITY
    const priority = { INDEX: 0, STOCK: 1, COMMODITY: 2 };
    processed.sort((a, b) => (priority[a.type] ?? 3) - (priority[b.type] ?? 3) || a.symbol.length - b.symbol.length);
    
    instrumentCache.data = processed;
    instrumentCache.lastUpdated = Date.now();
    
    console.log(`[Search] ScripMaster loaded: ${processed.length} instruments in ${Date.now() - startTime}ms`);
    
  } catch (error) {
    console.error('[Search] ScripMaster load error:', error.message);
  } finally {
    instrumentCache.isLoading = false;
  }
}

function isCacheStale() {
  if (!instrumentCache.lastUpdated) return true;
  return (Date.now() - instrumentCache.lastUpdated) > instrumentCache.ttl;
}

// ==========================================
// GET /api/search
// ==========================================
router.get('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { q, exchange, type, limit = 20 } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ status: false, error: "Query 'q' required (min 2 chars)" });
    }
    
    // Refresh if stale (async)
    if (isCacheStale()) loadScripMaster();
    
    // Wait for initial load
    if (instrumentCache.data.length === 0) await loadScripMaster();
    
    const query = q.toUpperCase();
    const maxLimit = Math.min(parseInt(limit) || 20, 50);
    
    let results = instrumentCache.data.filter(inst => {
      if (exchange && inst.exchange !== exchange.toUpperCase()) return false;
      if (type && inst.type !== type.toUpperCase()) return false;
      return inst._searchSymbol.includes(query) || inst._searchName.includes(query);
    });
    
    // Sort: exact matches first
    results.sort((a, b) => {
      if (a._searchSymbol === query && b._searchSymbol !== query) return -1;
      if (b._searchSymbol === query && a._searchSymbol !== query) return 1;
      if (a._searchSymbol.startsWith(query) && !b._searchSymbol.startsWith(query)) return -1;
      if (b._searchSymbol.startsWith(query) && !a._searchSymbol.startsWith(query)) return 1;
      return a.symbol.length - b.symbol.length;
    });
    
    const cleaned = results.slice(0, maxLimit).map(r => ({
      token: r.token, symbol: r.symbol, name: r.name, exchange: r.exchange, type: r.type, lotSize: r.lotSize,
    }));
    
    res.json({
      status: true,
      query: q,
      count: cleaned.length,
      results: cleaned,
      meta: {
        source: 'ANGEL_SCRIPMASTER',
        cacheAge: instrumentCache.lastUpdated ? Math.round((Date.now() - instrumentCache.lastUpdated) / 1000) + 's' : 'fresh',
        totalInstruments: instrumentCache.data.length,
        execTime: (Date.now() - startTime) + 'ms',
      }
    });
    
  } catch (error) {
    console.error('[Search] Error:', error.message);
    res.status(500).json({ status: false, error: error.message });
  }
});

// GET /api/search/refresh - Force refresh
router.get('/refresh', async (req, res) => {
  await loadScripMaster();
  res.json({ status: true, message: 'Refreshed', count: instrumentCache.data.length });
});

// GET /api/search/stats
router.get('/stats', (req, res) => {
  const byType = {}, byExchange = {};
  for (const inst of instrumentCache.data) {
    byType[inst.type] = (byType[inst.type] || 0) + 1;
    byExchange[inst.exchange] = (byExchange[inst.exchange] || 0) + 1;
  }
  res.json({
    status: true,
    totalInstruments: instrumentCache.data.length,
    lastUpdated: instrumentCache.lastUpdated ? new Date(instrumentCache.lastUpdated).toISOString() : null,
    isStale: isCacheStale(),
    byType, byExchange,
  });
});

// Load on startup
loadScripMaster();

module.exports = router;
