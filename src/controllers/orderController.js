const orderService = require('../services/orderService');

const createOrder = async (req, res) => {
  try {
    const result = await orderService.createOrder(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 🔥 NEW SUCCESS API
const getOrderSuccess = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await orderService.getOrderSuccess(id);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getPaidOrders = async (req, res) => {
  try {
    const result = await orderService.getPaidOrders();
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
};

module.exports = {
  createOrder,
  getOrderSuccess,
  getPaidOrders
};