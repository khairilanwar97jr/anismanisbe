
console.log("=== BILLPLZ DEBUG ===");
console.log("MODE:", process.env.MODE);

console.log("apiUrl:", billplz.apiUrl);
console.log("apiKey:", billplz.apiKey);
console.log("collectionId:", billplz.collectionId);

console.log("frontendUrl:", billplz.frontendUrl);
console.log("backendUrl:", billplz.backendUrl);

const paymentService = require('../services/paymentService');

const createPayment = async (req, res) => {
  try {
    console.log("=== CREATE PAYMENT ===");
    console.log("Body:", req.body);

    const result = await paymentService.createPayment(req.body);

    console.log("Result:", result);

    res.json(result);

  } catch (err) {
    console.error("=== PAYMENT ERROR ===");
    console.error(err);

    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Data:", err.response.data);
    }

    res.status(500).json({
      error: err.message
    });
  }
};

// webhook from Billplz
const paymentWebhook = async (req, res) => {
  try {
    const result = await paymentService.handleWebhook(req.body);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createPayment,
  paymentWebhook
};