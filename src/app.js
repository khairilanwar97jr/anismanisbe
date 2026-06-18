const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

app.use(express.urlencoded({
  extended: true
}));

// TEST ROUTE (important)
app.get('/', (req, res) => {
  res.json({ message: "Backend is working 🚀" });
});


// PRODUCT ROUTE
app.use('/api/products', require('./routes/productRoutes'));

app.use('/api/payments', require('./routes/paymentRoutes'));

app.use('/api/orders', require('./routes/orderRoutes'));

app.use('/api/addons', require('./routes/addonRoutes'));

module.exports = app;