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

    const { data: updatedOrder, error: orderError } = await supabase
      .from('orders')
      .update({
        order_status: 'PAID',
        payment_status: 'PAID'
      })
      .eq('id', payment.order_id)
      .neq('payment_status', 'PAID')
      .select(`
  *,
  order_items (
    *,
    products (
      name,
      price
    ),
    order_item_addons (
      quantity,
      unit_price,
      addons (
        name,
        price
      )
    )
  )
`)
      .single();

    if (orderError) throw orderError;

    // STOP if already processed
    if (!updatedOrder) {
      console.log("Order already processed, skipping email");
      return { message: "Already processed" };
    }

    // ✅ NOW safe to build email
    const emailMessage = buildEmailTemplate(updatedOrder);
    try {
      await axios.post(
        "https://api.emailjs.com/api/v1.0/email/send",
        {
          service_id: process.env.EMAILJS_SERVICE_ID,
          template_id: process.env.EMAILJS_TEMPLATE_ID,
          user_id: process.env.EMAILJS_PUBLIC_KEY,
          accessToken: process.env.EMAILJS_PRIVATE_KEY,

          template_params: {
            order_id: updatedOrder.id,
            message: emailMessage
          }
        }
      );

      console.log("Email sent successfully");
    } catch (err) {
      console.error("Email failed:", err.response?.data || err.message);
    }
  }

  return {
    message: "Webhook processed"
  };
};


const buildEmailTemplate = (order) => {

  const items = order.order_items || [];

  const itemLines = items.map((item, index) => {

    // product name (from join)
    const itemName = item.products?.name || "Item";

    // pricing (from DB schema)
    const price = Number(item.unit_price || item.products?.price || 0);
    const qty = Number(item.quantity || 1);

    const itemTotal = Number(item.subtotal || price * qty);

    // addons (JOIN table)
    const addons = item.order_item_addons || [];

    const addonText =
      addons.length > 0
        ? addons.map((addon) => {
            const addonName = addon.addons?.name || "Addon";
            const addonPrice = Number(addon.unit_price || 0);
            const addonQty = Number(addon.quantity || 1);

            const total = addonPrice * addonQty;

            return `   + ${addonName} x${addonQty} - RM ${total.toFixed(2)}`;
          }).join("\n")
        : "   No add-ons";

    return `
${index + 1}. ${itemName} x${qty}
Item: RM ${itemTotal.toFixed(2)}
${addonText}
    `;
  }).join("\n\n");

  return `
AnisManis Order Receipt

Order ID: ${order.id}
Status: ${order.order_status || "PAID"}

Name: ${order.guest_name}
Phone: ${order.guest_phone}
Email: ${order.guest_email}

Delivery Type: ${order.delivery_type}
Address: ${order.delivery_address}

Items:

${itemLines}

Cart Total: RM ${Number(order.total_amount || 0).toFixed(2)}
Delivery Fee: RM ${Number(order.delivery_fee || 0).toFixed(2)}
Total Paid: RM ${Number(order.grand_total || 0).toFixed(2)}
  `;
};


module.exports = {
  createPayment,
  handleWebhook
};