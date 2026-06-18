const addonService = require('../services/addonService');

const getAllAddons = async (req, res) => {
  try {
    const addons = await addonService.getAllAddons();
    res.json(addons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getAllAddons
};