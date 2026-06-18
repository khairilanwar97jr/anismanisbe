const supabase = require('../config/supabase');

const createOrder = async (payload) => {
  const {
    user_id,
    guest_name,
    guest_email,
    guest_phone,
    delivery_type,
    delivery_address,
    delivery_lat,
    delivery_lng,
    items
  } = payload;

  let itemsTotal = 0;
  const orderItems = [];
  let addonsTotal = 0;

  // 1. CALCULATE ITEMS + ADDONS
  for (const item of items) {

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('price')
      .eq('id', item.product_id)
      .single();

    if (productError || !product) {
      throw new Error(`Product not found: ${item.product_id}`);
    }

    const productSubtotal = product.price * item.quantity;
    itemsTotal += productSubtotal;

    // ADDONS
    if (item.addons && item.addons.length > 0) {

      for (const addon of item.addons) {

        const { data: addonData, error: addonError } = await supabase
          .from('addons')
          .select('price')
          .eq('id', addon.addon_id)
          .single();

        if (addonError || !addonData) {
          throw new Error(`Addon not found: ${addon.addon_id}`);
        }

        const addonSubtotal = addonData.price * addon.quantity;
        addonsTotal += addonSubtotal;
      }
    }

    // ✅ INCLUDE MESSAGE HERE
    orderItems.push({
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: product.price,
      subtotal: productSubtotal,
      message: item.message || null   // 🔥 THIS IS THE FIX
    });
  }

  // 2. DELIVERY
  let distance = 0;
  let deliveryFee = 0;

  const bakeryLat = 3.1761739896247194;
  const bakeryLng = 101.54584049504571;

  if (delivery_type === 'DELIVERY') {

    if (!delivery_lat || !delivery_lng) {
      throw new Error("Delivery location required");
    }

    distance = calculateDistance(
      bakeryLat,
      bakeryLng,
      delivery_lat,
      delivery_lng
    );

    deliveryFee = getDeliveryFee(distance);
  }

  // 3. GRAND TOTAL
  const grandTotal = itemsTotal + addonsTotal + deliveryFee;

  // 4. CREATE ORDER
  const { data: order, error } = await supabase
    .from('orders')
    .insert([
      {
        user_id,
        guest_name,
        guest_email,
        guest_phone,
        order_status: 'PENDING',
        payment_status: 'UNPAID',
        total_amount: itemsTotal,
        delivery_fee: deliveryFee,
        grand_total: grandTotal,
        delivery_type,
        delivery_address,
        delivery_lat,
        delivery_lng,
        delivery_distance_km: distance
      }
    ])
    .select()
    .single();

  if (error) throw error;

  // 5. INSERT ORDER ITEMS (WITH MESSAGE)
  const { data: insertedItems, error: itemError } = await supabase
    .from('order_items')
    .insert(
      orderItems.map(item => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        message: item.message   // 🔥 SAVE MESSAGE INTO DB
      }))
    )
    .select();

  if (itemError) throw itemError;

  // 6. INSERT ADDONS
  for (let i = 0; i < insertedItems.length; i++) {

    const orderItem = insertedItems[i];
    const originalItem = items.find(
      x => x.product_id === orderItem.product_id
    );

    if (!originalItem?.addons) continue;

    for (const addon of originalItem.addons) {

      const { data: addonData, error: addonError } = await supabase
        .from('addons')
        .select('price')
        .eq('id', addon.addon_id)
        .single();

      if (addonError || !addonData) {
        throw new Error(`Addon not found: ${addon.addon_id}`);
      }

      const addonPrice = addonData.price;

      await supabase
        .from('order_item_addons')
        .insert([
          {
            order_item_id: orderItem.id,
            addon_id: addon.addon_id,
            quantity: addon.quantity,
            unit_price: addonPrice,
            subtotal: addonPrice * addon.quantity
          }
        ]);
    }
  }

  return {
    order_id: order.id,
    items_total: itemsTotal,
    addon_total: addonsTotal,
    delivery_fee: deliveryFee,
    grand_total: grandTotal
  };
};

// HELPERS
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function toRad(value) {
  return value * Math.PI / 180;
}

function getDeliveryFee(distance) {
  if (distance <= 3) return 5;
  if (distance <= 8) return 10;
  if (distance <= 15) return 15;
  return 20;
}

const getOrderSuccess = async (orderId) => {

  // 1. GET ORDER
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    throw new Error('Order not found');
  }

  // 2. CHECK PAYMENT
  if (order.payment_status !== 'PAID') {
    throw new Error('Order not paid yet');
  }

  // 3. GET ORDER ITEMS + PRODUCT + IMAGES
  const { data: items, error: itemError } = await supabase
    .from('order_items')
    .select(`
      id,
      quantity,
      unit_price,
      subtotal,
      message,
      product_id,
      products (
        id,
        name,
        product_images (
          image_url
        )
      )
    `)
    .eq('order_id', orderId);

  if (itemError) throw itemError;

  // 4. FORMAT ITEMS + ADDONS
  const formattedItems = await Promise.all(
    items.map(async (item) => {

      // GET ADDONS
      const { data: additions, error: addonError } = await supabase
        .from('order_item_addons')
        .select(`
          quantity,
          unit_price,
          addon_id
        `)
        .eq('order_item_id', item.id);

      if (addonError) throw addonError;

      // MAP ADDON NAMES
      const addons = await Promise.all(
        (additions || []).map(async (a) => {

          const { data: addonData } = await supabase
            .from('addons')
            .select('name')
            .eq('id', a.addon_id)
            .single();

          return {
            name: addonData?.name || null,
            price: a.unit_price,
            quantity: a.quantity
          };
        })
      );

      return {
        product_name: item.products?.name || null,
        image_url: item.products?.product_images?.[0]?.image_url || null,
        quantity: item.quantity,
        price: item.unit_price,
        subtotal: item.subtotal,
        message: item.message,
        addons
      };
    })
  );

  // 5. FINAL RESPONSE
  return {
    id: order.id,
    status: order.payment_status,
    guest_name: order.guest_name,
    guest_email: order.guest_email,
    guest_phone: order.guest_phone,
    delivery_type: order.delivery_type,
    delivery_address: order.delivery_address,
    delivery_fee: order.delivery_fee,
    grand_total: order.grand_total,
    items: formattedItems
  };
};

const getPaidOrders = async () => {

  // Latest 5 paid orders
  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      id,
      guest_name,
      payment_status,
      created_at
    `)
    .eq('payment_status', 'PAID')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) throw error;

  const result = await Promise.all(
    orders.map(async (order) => {

      const { data: items, error: itemError } = await supabase
        .from('order_items')
        .select(`
          id,
          quantity,
          products (
            name
          )
        `)
        .eq('order_id', order.id);

      if (itemError) throw itemError;

      const formattedItems = await Promise.all(
        items.map(async (item) => {

          // Get addon rows
          const { data: additions, error: additionError } = await supabase
            .from('order_item_addons')
            .select(`
              quantity,
              addon_id
            `)
            .eq('order_item_id', item.id);

          if (additionError) throw additionError;

          // Get addon names
          const addons = await Promise.all(
            (additions || []).map(async (addition) => {

              const { data: addonData, error: addonError } = await supabase
                .from('addons')
                .select('name')
                .eq('id', addition.addon_id)
                .single();

              if (addonError) throw addonError;

              return {
                name: addonData?.name,
                quantity: addition.quantity
              };
            })
          );

          return {
            product_name: item.products?.name,
            quantity: item.quantity,
            addons
          };
        })
      );

      return {
        id: order.id,
        customer_name: order.guest_name,
        order_date: order.created_at,
        payment_status: order.payment_status,
        items: formattedItems
      };
    })
  );

  return result;
};

module.exports = {
  createOrder,
  getOrderSuccess,
  getPaidOrders
};