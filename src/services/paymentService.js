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

  // 1. UPDATE PAYMENT
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

  // 2. ONLY PROCESS IF PAID
  if (isPaid && payment) {

    // 3. UPDATE ORDER + GET FULL DATA
    const { data: updatedOrder, error: orderError } = await supabase
      .from('orders')
      .update({
        order_status: 'PAID',
        payment_status: 'PAID'
      })
      .eq('id', payment.order_id)
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
      .maybeSingle();

    if (orderError) throw orderError;

    if (!updatedOrder) {
      console.log("Order already processed or not found");
      return { message: "Already processed" };
    }

    // ===============================
    // 4. BUILD EMAILS
    // ===============================

    const customerEmailMessage = buildEmailTemplate(updatedOrder);
    const ownerEmailMessage = buildEmailTemplate(updatedOrder);

    try {

      // ===============================
      // 5. SEND CUSTOMER EMAIL
      // ===============================
      await axios.post(
        "https://api.emailjs.com/api/v1.0/email/send",
        {
          service_id: process.env.EMAILJS_SERVICE_ID,
          template_id: process.env.EMAILJS_TEMPLATE_ID,
          user_id: process.env.EMAILJS_PUBLIC_KEY,
          accessToken: process.env.EMAILJS_PRIVATE_KEY,


          template_params: {
            email: updatedOrder.guest_email,
            order_id: updatedOrder.id,
            message: customerEmailMessage
          }
        }
      );

      // ===============================
      // 6. SEND OWNER EMAIL
      // ===============================
      await axios.post(
        "https://api.emailjs.com/api/v1.0/email/send",
        {
          service_id: process.env.EMAILJS_SERVICE_ID,
          template_id: process.env.EMAILJS_TEMPLATE_ID,
          user_id: process.env.EMAILJS_PUBLIC_KEY,
          accessToken: process.env.EMAILJS_PRIVATE_KEY,

          template_params: {
            email: "kaibinaidea@gmail.com", //pruanisalimin@gmail.com
            order_id: updatedOrder.id,
            message: ownerEmailMessage
          }
        }
      );

      console.log("Emails sent successfully");

    } catch (err) {
      console.error("Email failed:", err.response?.data || err.message);
    }
  }

  return {
    message: "Webhook processed"
  };
};

// build email template
const buildEmailTemplate = (order) => {

  const safeNumber = (val) => {
    const n = Number(val);
    return Number.isNaN(n) ? 0 : n;
  };

  const items = order.order_items || [];

  // =========================
  // ✅ CALCULATION BLOCK
  // =========================

  const cartAddonTotal = items.reduce((sum, item) => {
    return sum + (item.order_item_addons || []).reduce((a, addon) => {
      const price = safeNumber(addon.unit_price);
      const qty = safeNumber(addon.quantity);
      return a + (price * qty);
    }, 0);
  }, 0);

  const cartTotalWithAddons = safeNumber(order.total_amount) + cartAddonTotal;

  const totalPaidWithFee = safeNumber(order.grand_total) + 1.25;

  // =========================

  // ✅ HANDLE EMPTY ORDER ITEMS
  if (!items.length) {
    return `
AnisManis Order Receipt

Order ID: ${order.id}
Status: ${order.order_status || "PAID"}

Name: ${order.guest_name}
Phone: ${order.guest_phone}
Email: ${order.guest_email}

Delivery Type: ${order.delivery_type}
Address: ${order.delivery_address}

⚠️ No items found in this order.

Delivery Fee: RM ${safeNumber(order.delivery_fee).toFixed(2)}
Total Paid: RM ${safeNumber(order.grand_total).toFixed(2)}
    `;
  }

  const itemLines = items.map((item, index) => {

    // product name
    const itemName = item.products?.name || "Item";

    // pricing
    const price = safeNumber(item.unit_price || item.products?.price);
    const qty = safeNumber(item.quantity || 1);

    const itemTotal = safeNumber(item.subtotal || price * qty);

    // addons
    const addons = item.order_item_addons || [];

    const addonText =
      addons.length > 0
        ? addons.map((addon) => {

            const addonName = addon.addons?.name || "Addon";
            const addonPrice = safeNumber(addon.unit_price);
            const addonQty = safeNumber(addon.quantity);

            const total = safeNumber(addon.subtotal || addonPrice * addonQty);

            return `   + ${addonName} x${addonQty} - RM ${total.toFixed(2)}`;

          }).join("\n")
        : "   No add-ons";

    return `
${index + 1}. ${itemName} x${qty}
Item: RM ${itemTotal.toFixed(2)}
${addonText}
-----------------------------
    `;
  }).join("\n");

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

-----------------------------
Cart Total: RM ${cartTotalWithAddons.toFixed(2)}
Delivery Fee: RM ${safeNumber(order.delivery_fee).toFixed(2)}
Online Processing Fee: RM 1.25
-----------------------------
Total Paid: RM ${totalPaidWithFee.toFixed(2)}
  `;
};


module.exports = {
  createPayment,
  handleWebhook
};