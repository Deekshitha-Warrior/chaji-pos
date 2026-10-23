import { supabase } from '../lib/supabase'

/**
 * Explicit column list — avoids transferring large unused columns (description,
 * benefits, images) on every fetch while keeping all fields the app actually reads.
 */
const PRODUCT_COLUMNS = [
  'id', 'name', 'name_ta', 'tamil_name', 'category', 'category_id',
  'remedy', 'price', 'offer_price', 'cost_price',
  'low_stock_alert', 'unit_type', 'unit_label',
  'base_quantity', 'stock_quantity', 'stock_unit', 'allow_decimal_quantity',
  'predefined_options', 'is_active', 'sort_order', 'unit', 'rating',
  'description', 'description_ta', 'benefits', 'benefits_ta',
  'image_url', 'image', 'has_variants', 'barcode', 'sku',
].join(', ')

export function fetchAllCategories() {
  return supabase
    .from('categories')
    .select('id, name_en')
}

export function fetchAllProducts() {
  return supabase
    .from('products')
    .select(PRODUCT_COLUMNS)
    .order('sort_order', { ascending: true })
}

export async function updateItemPrice(params: {
  entityType: 'product' | 'variant'
  id: number | string
  newPrice: number
  newCostPrice?: number
}): Promise<void> {
  if (params.newPrice < 0) throw new Error('Price cannot be negative')

  if (params.entityType === 'variant') {
    const updatePayload: Record<string, unknown> = {
      price: params.newPrice,
      updated_at: new Date().toISOString(),
    }
    if (params.newCostPrice !== undefined && params.newCostPrice >= 0) {
      updatePayload.cost_price = params.newCostPrice
    }
    const { error } = await supabase
      .from('product_variants')
      .update(updatePayload)
      .eq('id', params.id)
    if (error) throw error
  } else {
    const updatePayload: Record<string, unknown> = {
      price: params.newPrice,
      updated_at: new Date().toISOString(),
    }
    if (params.newCostPrice !== undefined && params.newCostPrice >= 0) {
      updatePayload.cost_price = params.newCostPrice
    }
    const { error } = await supabase
      .from('products')
      .update(updatePayload)
      .eq('id', params.id)
    if (error) throw error
  }
}

export async function getOrCreateUnregisteredProduct(
  name: string,
  price: number
): Promise<{ id: number; name: string; price: number; category: string }> {
  const trimmedName = name.trim()

  // 1. Resolve or create 'Unregistered' category
  let { data: cat } = await supabase
    .from('categories')
    .select('id, name_en')
    .ilike('name_en', 'Unregistered')
    .maybeSingle()

  if (!cat) {
    const { data: newCat, error: catErr } = await supabase
      .from('categories')
      .insert({
        name_en: 'Unregistered',
        name_ta: 'பதிவுசெய்யப்படாதது',
        is_active: true,
        sort_order: 999,
      })
      .select('id, name_en')
      .single()

    if (catErr) throw catErr
    cat = newCat
  }

  const categoryId = Number(cat.id)

  // 2. Check if product already exists under Unregistered category
  const { data: existingProd } = await supabase
    .from('products')
    .select('id, name, price, category')
    .ilike('name', trimmedName)
    .eq('category_id', categoryId)
    .maybeSingle()

  if (existingProd) {
    // Update price if changed so Catalog displays the latest rate
    if (Number(existingProd.price) !== Number(price)) {
      await supabase
        .from('products')
        .update({ price: Number(price), updated_at: new Date().toISOString() })
        .eq('id', existingProd.id)
    }
    return {
      id: Number(existingProd.id),
      name: existingProd.name,
      price: Number(price),
      category: 'Unregistered',
    }
  }

  // 3. Create ad-hoc product row (stock 0, non-inventory)
  const { data: newProd, error: prodErr } = await supabase
    .from('products')
    .insert({
      name: trimmedName,
      category: 'Unregistered',
      category_id: categoryId,
      price: Number(price),
      offer_price: null,
      stock_quantity: 0,
      stock: 0,
      unit_type: 'unit',
      unit_label: 'piece',
      unit: 'piece',
      base_quantity: 1,
      has_variants: false,
      is_active: true,
      sort_order: 999,
    })
    .select('id, name, price, category')
    .single()

  if (prodErr) throw prodErr

  return {
    id: Number(newProd.id),
    name: newProd.name,
    price: Number(newProd.price),
    category: 'Unregistered',
  }
}

