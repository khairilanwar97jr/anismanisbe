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