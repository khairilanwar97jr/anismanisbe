const paymentService = require('../services/paymentService');

const createPayment = async (req, res) => {
  try {
    const result = await paymentService.createPayment(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
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