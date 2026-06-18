const supabase = require('../config/supabase');
const billplz = require('../config/billplz');
const axios = require('axios');

if (!billplz.frontendUrl) throw new Error('FRONTEND_URL must be set in .env');
if (!billplz.backendUrl) throw new Error('BACKEND_URL must be set in .env');

const createPayment = async ({ order_id }) => {

  // 1. Get order
  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', order_id)
    .single();

  if (error || !order) throw new Error("Order not found");

  const redirectUrl = `${billplz.frontendUrl}/payment/success?order_id=${order_id}`;

  // 2. Create Billplz bill (REAL PAYMENT LINK)
  const response = await axios.post(
    `${billplz.apiUrl}/bills`,
    {
      collection_id: billplz.collectionId,
      email: order.guest_email || "customer@email.com", // later replace with real user email
      name: order.guest_name || "Customer",
      amount: (order.grand_total + 1.25) * 100, // Billplz uses cents
      callback_url: `${billplz.backendUrl}/api/payments/webhook`,
      redirect_url: redirectUrl,
      description: `Order ${order_id}`
    },
    {
      auth: {
        username: billplz.apiKey,
        password: ""
      }
    }
  );

  const bill = response.data;

  // 3. Save payment record in DB
  const { data: payment, error: payError } = await supabase
    .from('payments')
    .insert([
      {
        order_id,
        amount: order.grand_total,
        payment_method: 'BILLPLZ',
        payment_status: 'PENDING',
        transaction_id: bill.id
      }
    ])
    .select()
    .single();

  if (payError) throw payError;

  // 4. Return REAL Billplz payment URL
  return {
    message: "Payment created",
    payment_url: bill.url || bill.redirect_url,
    payment_id: payment.id
  };
};

const handleWebhook = async (payload) => {

  console.log("Webhook received:", payload);

  const { id, paid } = payload;

  const isPaid = paid === "true";

  // update payment table
  const { data: payment, error } = await supabase
    .from('payments')
    .update({
      payment_status: isPaid ? 'SUCCESS' : 'FAILED',
      paid_at: isPaid ? new Date() : null
    })
    .eq('transaction_id', id)
    .select()
    .single();

  if (error) throw error;

  // update order table
  if (isPaid && payment) {

    await supabase
      .from('orders')
      .update({
        order_status: 'PAID',
        payment_status: 'PAID'
      })
      .eq('id', payment.order_id);

  }

  return {
    message: "Webhook processed"
  };
};

module.exports = {
  createPayment,
  handleWebhook
};