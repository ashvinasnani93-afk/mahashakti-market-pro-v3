// ================================================  
// STRIKE SERVICE — FINAL (A2.10) - FIXED  
// ANGEL SOURCE OF TRUTH  
// LIVE ATM RANGE + ANGEL TOKEN VALIDATION  
// ================================================  
  
const { isMonthlyExpiry, formatOptionSymbol } = require("./symbol.service");  
const { getOptionToken, getSpotLTP } = require("./token.service");  
  
// ================================================  
// EXTRACT STRIKE FROM ANGEL SYMBOL (UTILITY SAFE)  
// Example:  
// NIFTY03FEB2625200CE -> 25200  
// BANKNIFTY03FEB2659100PE -> 59100  
// ================================================  
function extractStrikeFromSymbol(symbol, index) {  
  try {  
    if (!symbol || !index) return null;  
    if (!symbol.startsWith(index)) return null;  
  
    const match = symbol.match(/(\d+)(CE|PE)$/);  
    return match ? Number(match[1]) : null;  
  } catch {  
    return null;  
  }  
}  
  
// ================================================  
// GET VALID STRIKES (LIVE + ANGEL VERIFIED)  
// ================================================  
async function getValidStrikes({  
  index,  // "NIFTY" / "BANKNIFTY" / "FINNIFTY"  
  expiryDate // JS Date  
}) {  
  // --------------------------------  
  // HARD VALIDATION  
  // --------------------------------  
  if (!index) return [];  
  
  if (typeof expiryDate === "string") {  
    expiryDate = new Date(expiryDate);  
  }  
  
  if (!(expiryDate instanceof Date) || isNaN(expiryDate)) {  
    console.log("❌ INVALID EXPIRY DATE:", expiryDate);  
    return [];  
  }  
  
  const strikesSet = new Set();  
  
  // --------------------------------  
  // EXPIRY TYPE DETECTION  
  // --------------------------------  
  const expiryType = isMonthlyExpiry(expiryDate)  
    ? "MONTHLY"  
    : "WEEKLY";  
  
  // --------------------------------  
  // STRIKE STEP BASED ON INDEX  
  // --------------------------------  
  const STEP =  
    index === "BANKNIFTY"  
      ? 100  
      : index === "FINNIFTY"  
      ? 50  
      : 50; // NIFTY  
  
  // --------------------------------  
  // LIVE SPOT FROM ANGEL  
  // --------------------------------  
  let spot;  
  try {  
    spot = await getSpotLTP(index);  
  } catch (e) {  
    console.log("❌ SPOT LTP FAILED:", index, e);  
    return [];  
  }  
  
  if (!spot || isNaN(spot)) {  
    console.log("❌ INVALID SPOT VALUE:", spot);  
    return [];  
  }  
  
  // --------------------------------  
  // ATM RANGE CALCULATION  
  // --------------------------------  
  const ATM = Math.round(spot / STEP) * STEP;  
  const RANGE = {  
    start: ATM - STEP * 10, // 10 strikes below  
    end: ATM + STEP * 10    // 10 strikes above  
  };  
  
  console.log("🧠 ATM RANGE:", {  
    index,  
    spot,  
    ATM,  
    step: STEP,  
    range: RANGE,  
    expiryType  
  });  
  
  // --------------------------------  
  // ANGEL VALIDATION LOOP  
  // --------------------------------  
  for (let strike = RANGE.start; strike <= RANGE.end; strike += STEP) {  
    // -------------------------------  
    // BUILD CE SYMBOL  
    // -------------------------------  
    const ceSymbol = formatOptionSymbol({  
      index,  
      expiryDate,  
      strike,  
      type: "CE",  
      expiryType  
    });  
  
    // -------------------------------  
    // BUILD PE SYMBOL  
    // -------------------------------  
    const peSymbol = formatOptionSymbol({  
      index,  
      expiryDate,  
      strike,  
      type: "PE",  
      expiryType  
    });  
  
    // -------------------------------  
    // FORMAT FAIL SAFE  
    // -------------------------------  
    if (!ceSymbol && !peSymbol) {  
      console.log("⚠️ SYMBOL FORMAT FAIL:", {  
        index,  
        strike,  
        expiryDate,  
        expiryType  
      });  
      continue;  
    }  
  
    // -------------------------------  
    // ANGEL TOKEN CHECK  
    // -------------------------------  
    let ceToken = null;  
    let peToken = null;  
  
    try {  
      ceToken = ceSymbol ? await getOptionToken(ceSymbol) : null;  
      peToken = peSymbol ? await getOptionToken(peSymbol) : null;  
    } catch (e) {  
      console.log("❌ TOKEN LOOKUP ERROR:", strike, e);  
      continue;  
    }  
  
    // -------------------------------  
    // DEBUG LOGS (LIVE TRACE)  
    // -------------------------------  
    console.log("TEST CE:", ceSymbol, "=>", ceToken);  
    console.log("TEST PE:", peSymbol, "=>", peToken);  
  
    // -------------------------------  
    // ANGEL IS FINAL AUTHORITY  
    // -------------------------------  
    if (ceToken || peToken) {  
      strikesSet.add(strike);  
    }  
  }  
  
  // --------------------------------  
  // FINAL SORTED STRIKE LIST  
  // --------------------------------  
  return Array.from(strikesSet).sort((a, b) => a - b);  
}  
  
// ================================================  
// EXPORTS  
// ================================================  
module.exports = {  
  getValidStrikes,  
  extractStrikeFromSymbol // utility only (future safe)  
};
