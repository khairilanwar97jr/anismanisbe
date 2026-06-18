const express = require('express');
const router = express.Router();

const orderController = require('../controllers/orderController');

router.post('/', orderController.createOrder);

router.get('/:id/success', orderController.getOrderSuccess);

router.get('/paid-orders', orderController.getPaidOrders);

module.exports = router;