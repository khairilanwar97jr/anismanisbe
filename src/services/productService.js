const supabase = require('../config/supabase');

const getAllProducts = async () => {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      product_images (
        image_url
      )
    `);

  if (error) throw error;

  return data.map(({ product_images, ...product }) => ({
    ...product,
    image_url: product_images[0]?.image_url || null
  }));
};


const getProductById = async (id) => {
  const result = await supabase
    .from('products')
    .select(`
      *,
      product_images (
        image_url
      )
    `)
    .eq('id', id)
    .single();

  if (result.error) throw result.error;

  const { product_images, ...product } = result.data;

  return {
    ...product,
    image_url: product_images[0]?.image_url || null
  };
};    


module.exports = {
  getAllProducts,
  getProductById
};
