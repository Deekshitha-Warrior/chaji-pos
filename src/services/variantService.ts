import { isSupabaseConfigured, supabase } from '../lib/supabase'

export type ProductVariant = {
  id: string
  productId: string
  variantName: string
  sizeLabel: string | null   // display label: "25g", "250ml", "Cycle Brand"
  weightValue: number | null // numeric for filtering
  weightUnit: string | null  // "g", "ml", "kg", "L"
  sku: string | null
  barcode: string | null
  purchasePrice: number | null
  costPrice?: number | null
  mrp: number | null
  price: number
  stock: number
  isDefault: boolean
  isActive: boolean
  sortOrder: number
  imageUrl: string | null
  groupName: string | null   // Brand name for Type D (Brand+Weight) products e.g. "Sithanathan"
}

export type VariantInput = {
  productId: string
  variantName: string
  sizeLabel?: string | null
  weightValue?: number | null
  weightUnit?: string | null
  sku?: string | null
  barcode?: string | null
  purchasePrice?: number | null
  costPrice?: number | null
  mrp?: number | null
  price: number
  stock: number
  isDefault?: boolean
  sortOrder?: number
  imageUrl?: string | null
}

const VARIANT_COLS =
  'id, product_id, variant_name, size_label, weight_value, weight_unit, sku, barcode, cost_price, mrp, price, stock, is_default, is_active, sort_order, image_url, group_name'

function mapVariant(r: Record<string, unknown>): ProductVariant {
  const cCost = r.cost_price != null ? Number(r.cost_price) : (r.purchase_price != null ? Number(r.purchase_price) : null)

  return {
    id:          String(r.id || ''),
    productId:   String(r.product_id || ''),
    variantName: String(r.variant_name || ''),
    sizeLabel:   r.size_label ? String(r.size_label) : null,
    weightValue: r.weight_value != null ? Number(r.weight_value) : null,
    weightUnit:  r.weight_unit ? String(r.weight_unit) : null,
    sku:         r.sku ? String(r.sku) : null,
    barcode:     r.barcode ? String(r.barcode) : null,
    purchasePrice: cCost,
    costPrice:   cCost,
    mrp:         r.mrp != null ? Number(r.mrp) : null,
    price:       Number(r.price ?? 0),
    stock:       Number(r.stock ?? 0),
    isDefault:   r.is_default === true,
    isActive:    r.is_active !== false,
    sortOrder:   Number(r.sort_order ?? 0),
    imageUrl:    r.image_url ? String(r.image_url) : null,
    groupName:   r.group_name ? String(r.group_name) : null,
  }
}

// ── Read ──────────────────────────────────────────────────────────

export async function fetchAllVariants(): Promise<{ data: ProductVariant[]; error: string | null }> {
  if (!isSupabaseConfigured) return { data: [], error: null }

  const { data, error } = await supabase
    .from('product_variants')
    .select(VARIANT_COLS)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) return { data: [], error: error.message }
  return {
    data: (data || []).map(r => mapVariant(r as Record<string, unknown>)),
    error: null,
  }
}

export async function fetchVariantsByProduct(productId: string): Promise<ProductVariant[]> {
  if (!isSupabaseConfigured) return []

  const { data } = await supabase
    .from('product_variants')
    .select(VARIANT_COLS)
    .eq('product_id', productId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  return (data || []).map(r => mapVariant(r as Record<string, unknown>))
}

// ── Write (admin only) ────────────────────────────────────────────

export async function createVariant(input: VariantInput): Promise<{ data: ProductVariant | null; error: string | null }> {
  if (!isSupabaseConfigured) return { data: null, error: 'Not configured' }

  const costVal = input.costPrice !== undefined ? input.costPrice : (input.purchasePrice ?? null)

  const { data, error } = await supabase
    .from('product_variants')
    .insert({
      product_id:   input.productId,
      variant_name: input.variantName,
      size_label:   input.sizeLabel ?? null,
      weight_value: input.weightValue ?? null,
      weight_unit:  input.weightUnit ?? null,
      sku:          input.sku ?? null,
      barcode:      input.barcode ?? null,
      cost_price:   costVal,
      mrp:          input.mrp ?? null,
      price:        input.price,
      stock:        input.stock ?? 0,
      is_default:   input.isDefault ?? false,
      sort_order:   input.sortOrder ?? 0,
      image_url:    input.imageUrl ?? null,
      is_active:    true,
    })
    .select(VARIANT_COLS)
    .single()

  if (error) return { data: null, error: error.message }
  return { data: mapVariant(data as Record<string, unknown>), error: null }
}

export async function updateVariant(
  id: string,
  updates: Partial<VariantInput>,
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: 'Not configured' }

  const payload: Record<string, unknown> = {}
  if (updates.variantName !== undefined) payload.variant_name = updates.variantName
  if (updates.sizeLabel   !== undefined) payload.size_label   = updates.sizeLabel
  if (updates.weightValue !== undefined) payload.weight_value = updates.weightValue
  if (updates.weightUnit  !== undefined) payload.weight_unit  = updates.weightUnit
  if (updates.sku           !== undefined) payload.sku            = updates.sku
  if (updates.barcode       !== undefined) payload.barcode        = updates.barcode
  if (updates.costPrice !== undefined || updates.purchasePrice !== undefined) {
    const costVal = updates.costPrice !== undefined ? updates.costPrice : updates.purchasePrice
    payload.cost_price = costVal ?? null
  }
  if (updates.mrp           !== undefined) payload.mrp            = updates.mrp
  if (updates.price         !== undefined) payload.price          = updates.price
  if (updates.stock         !== undefined) payload.stock          = updates.stock
  if (updates.isDefault     !== undefined) payload.is_default     = updates.isDefault
  if (updates.sortOrder     !== undefined) payload.sort_order     = updates.sortOrder
  if (updates.imageUrl      !== undefined) payload.image_url      = updates.imageUrl

  const { error } = await supabase
    .from('product_variants')
    .update(payload)
    .eq('id', id)

  return { error: error?.message ?? null }
}

export async function deleteVariant(id: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: 'Not configured' }

  const { error } = await supabase
    .from('product_variants')
    .update({ is_active: false })
    .eq('id', id)

  return { error: error?.message ?? null }
}

export async function setDefaultVariant(
  variantId: string,
  productId: string,
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: 'Not configured' }

  // Clear current defaults
  await supabase
    .from('product_variants')
    .update({ is_default: false })
    .eq('product_id', productId)

  const { error } = await supabase
    .from('product_variants')
    .update({ is_default: true })
    .eq('id', variantId)

  return { error: error?.message ?? null }
}
