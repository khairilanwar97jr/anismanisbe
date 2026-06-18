require('dotenv').config();

const MODE = process.env.MODE;

if (!MODE) {
  throw new Error("MODE is missing in .env (must be 'sandbox' or 'live')");
}

const config = {
  sandbox: {
    apiKey: process.env.BILLPLZ_SANDBOX_KEY,
    collectionId: process.env.BILLPLZ_SANDBOX_COLLECTION,
    apiUrl: process.env.BILLPLZ_SANDBOX_BASE_URL || "https://www.billplz-sandbox.com/api/v3",
    backendUrl: process.env.BACKEND_URL,
    frontendUrl: process.env.FRONTEND_URL
  },

  live: {
    apiKey: process.env.BILLPLZ_LIVE_KEY,
    collectionId: process.env.BILLPLZ_LIVE_COLLECTION,
    apiUrl: process.env.BILLPLZ_LIVE_BASE_URL || "https://www.billplz.com/api/v3",
    backendUrl: process.env.BACKEND_URL,
    frontendUrl: process.env.FRONTEND_URL
  }
};

if (!config[MODE]) {
  throw new Error(`Invalid MODE in .env: ${MODE}`);
}

module.exports = config[MODE];