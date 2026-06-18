const express = require('express');
const router = express.Router();

const addonController = require('../controllers/addonController');

router.get('/', addonController.getAllAddons);

module.exports = router;