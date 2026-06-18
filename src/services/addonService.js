const supabase = require('../config/supabase');

const getAllAddons = async () => {
  const { data, error } = await supabase
    .from('addons')
    .select('*')
    .eq('is_active', true)
    .order('id', { ascending: true });

  if (error) throw error;

  return data;
};

module.exports = {
  getAllAddons
};