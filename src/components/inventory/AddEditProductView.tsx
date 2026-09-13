import React, { useState, useEffect } from 'react'
import {
  Plus,
  Trash2,
  Search,
  Check,
  Package,
  Tag,
  Boxes,
  ArrowLeft,
  Edit2,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useProductStore, type Product } from '../../store/store'
import { fetchVariantsByProduct } from '../../services/variantService'
import { inventoryService, type CategoryRecord } from '../../services/inventoryService'

export const STANDARD_LETTER_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'Free Size'] as const
export const STANDARD_NUMERIC_SIZES = ['28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48'] as const
export const STANDARD_SPECIAL_SIZES = ['Free Size', 'One Size', 'Semi-Stitched', 'Unstitched', 'XXS', '6XL', 'Kids 2-3Y', 'Kids 4-5Y', 'Kids 6-7Y', 'Kids 8-9Y'] as const

export type SizePartition = 'alpha' | 'numeric' | 'custom'

export interface VariantInputRow {
  id: string
  variantName: string
  sizeLabel?: string
  price: number
  costPrice: number
  stock: number
  customBarcode?: string
}

export const AddEditProductView: React.FC<{
  onStockUpdated?: () => void
  initialProductId?: number | string | null
}> = ({ onStockUpdated, initialProductId }) => {
  const { products, fetchProducts } = useProductStore()
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [search, setSearch] = useState('')
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'form'>('list')
  const [sizePartition, setSizePartition] = useState<SizePartition>('alpha')
  const [customVariantInput, setCustomVariantInput] = useState('')

  // Form State
  const [name, setName] = useState('')
  const [nameTa, setNameTa] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [price, setPrice] = useState<string>('')
  const [purchasePrice, setPurchasePrice] = useState<string>('')
  const [stockQuantity, setStockQuantity] = useState<string>('0')
  const [lowStockAlert, setLowStockAlert] = useState<string>('5')
  const [barcode, setBarcode] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [hasVariants, setHasVariants] = useState<boolean>(false)

  // Variants Rows for dynamic addition
  const [variantRows, setVariantRows] = useState<VariantInputRow[]>([])

  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    void fetchProducts(true)
    inventoryService.fetchCategories().then(setCategories).catch(console.error)
  }, [fetchProducts])

  const resetForm = () => {
    setSelectedProductId(null)
    setName('')
    setNameTa('')
    setCategoryId('')
    setPrice('')
    setPurchasePrice('')
    setStockQuantity('0')
    setLowStockAlert('5')
    setBarcode('')
    setDescription('')
    setHasVariants(false)
    setVariantRows([])
    setStatusMessage(null)
  }

  const startEditProduct = async (p: Product) => {
    setSelectedProductId(Number(p.id))
    setMobileView('form')
    setName(p.name || '')
    setNameTa(p.nameTa || p.tamilName || '')

    // Match category by ID or by category name
    let matchedCatId: number | '' = ''
    if (p.categoryId) {
      matchedCatId = Number(p.categoryId)
    } else if (p.category && categories.length > 0) {
      const found = categories.find(
        (c) => c.name_en.toLowerCase() === p.category.toLowerCase()
      )
      if (found) matchedCatId = Number(found.id)
    }
    setCategoryId(matchedCatId)

    setPrice(String(p.price || ''))
    setPurchasePrice(String(p.purchasePrice || ''))
    setStockQuantity(String(p.stockQuantity ?? p.stock ?? 0))
    setLowStockAlert(p.lowStockAlert ? String(p.lowStockAlert) : '5')
    setBarcode(p.barcode || '')
    setDescription(p.description || '')
    setHasVariants(Boolean(p.hasVariants))
    setStatusMessage(null)

    if (p.hasVariants) {
      try {
        const vars = await fetchVariantsByProduct(String(p.id))
        setVariantRows(
          vars.map((v) => ({
            id: v.id,
            variantName: v.variantName,
            sizeLabel: v.sizeLabel || v.variantName,
            price: v.price,
            costPrice: v.purchasePrice || 0,
            stock: v.stock || 0,
            customBarcode: v.barcode || '',
          }))
        )
      } catch (err) {
        console.error('Failed to load variants for edit:', err)
      }
    } else {
      setVariantRows([])
    }
  }

  // Auto-select product if initialProductId is provided
  useEffect(() => {
    if (initialProductId && products.length > 0) {
      const target = products.find((p) => String(p.id) === String(initialProductId))
      if (target) {
        void startEditProduct(target)
      }
    }
  }, [initialProductId, products, categories])

  const handleAddVariantRow = () => {
    const baseP = parseFloat(price) || 0
    const baseC = parseFloat(purchasePrice) || 0
    setVariantRows((prev) => [
      ...prev,
      {
        id: `var_${Date.now()}_${Math.random()}`,
        variantName: '',
        sizeLabel: '',
        price: baseP,
        costPrice: baseC,
        stock: 0,
        customBarcode: '',
      },
    ])
  }

  const handleRemoveVariantRow = (id: string) => {
    setVariantRows((prev) => prev.filter((r) => r.id !== id))
  }

  const handleUpdateVariantRow = (
    id: string,
    field: keyof VariantInputRow,
    value: string | number
  ) => {
    setVariantRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    )
  }

  const handleAddStandardSize = (size: string) => {
    const trimmed = size.trim()
    if (!trimmed) return

    if (variantRows.some((r) => r.variantName.trim().toUpperCase() === trimmed.toUpperCase())) {
      return
    }
    const baseP = parseFloat(price) || 0
    const baseC = parseFloat(purchasePrice) || 0

    // If there is already a blank row with no size and 0 stock, fill that row instead of adding a new one!
    const blankRowIndex = variantRows.findIndex((r) => !r.variantName.trim() && !r.stock)
    if (blankRowIndex !== -1) {
      setVariantRows((prev) =>
        prev.map((r, idx) =>
          idx === blankRowIndex
            ? { ...r, variantName: trimmed, sizeLabel: trimmed, price: r.price || baseP, costPrice: r.costPrice || baseC }
            : r
        )
      )
      return
    }

    setVariantRows((prev) => [
      ...prev,
      {
        id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        variantName: trimmed,
        sizeLabel: trimmed,
        price: baseP,
        costPrice: baseC,
        stock: 0,
        customBarcode: '',
      },
    ])
  }

  const handleAddCustomNamedVariant = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    handleAddStandardSize(trimmed)
    setCustomVariantInput('')
  }

  const handleAddFullPack = (partition: SizePartition) => {
    const list =
      partition === 'alpha'
        ? ['S', 'M', 'L', 'XL', '2XL']
        : partition === 'numeric'
        ? ['28', '30', '32', '34', '36', '38']
        : ['Free Size', 'One Size', 'Semi-Stitched', 'Unstitched']
    const baseP = parseFloat(price) || 0
    const baseC = parseFloat(purchasePrice) || 0
    setVariantRows((prev) => {
      // Remove any unedited blank row when adding a full pack
      const cleaned = prev.filter((r) => r.variantName.trim() !== '' || r.stock > 0)
      const existing = new Set(cleaned.map((r) => r.variantName.trim().toUpperCase()))
      const toAdd: VariantInputRow[] = []
      for (const s of list) {
        if (!existing.has(s.toUpperCase())) {
          toAdd.push({
            id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${s}`,
            variantName: s,
            sizeLabel: s,
            price: baseP,
            costPrice: baseC,
            stock: 0,
            customBarcode: '',
          })
        }
      }
      return [...cleaned, ...toAdd]
    })
  }

  const handleDeleteProduct = async (id: number, prodName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${prodName}" from catalog & inventory?`)) {
      return
    }

    try {
      setLoading(true)
      await inventoryService.deleteInventoryItem(id)
      await fetchProducts(true)
      resetForm()
      onStockUpdated?.()
      setStatusMessage({ type: 'success', text: `Product "${prodName}" deleted successfully.` })
    } catch (err) {
      console.error('Failed to delete product:', err)
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete product' })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatusMessage(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setStatusMessage({ type: 'error', text: 'Product Name is required' })
      return
    }

    const validVariants = variantRows.filter((v) => v.variantName.trim() !== '')
    const firstVariant = validVariants[0]
    const priceNum = hasVariants && firstVariant ? (Number(firstVariant.price) || 0) : (parseFloat(price) || 0)
    const costNum = hasVariants && firstVariant ? (Number(firstVariant.costPrice) || 0) : (parseFloat(purchasePrice) || 0)

    if (!hasVariants && priceNum <= 0) {
      setStatusMessage({ type: 'error', text: 'Price must be greater than 0' })
      return
    }

    if (hasVariants && validVariants.length === 0) {
      setStatusMessage({ type: 'error', text: 'Please add at least one variant SKU (e.g. Size S, 32, or custom variant)' })
      return
    }

    const selectedCat = categories.find((c) => Number(c.id) === Number(categoryId))
    const categoryName = selectedCat ? selectedCat.name_en : 'General'
    const alertThreshold = Number(lowStockAlert) > 0 ? Number(lowStockAlert) : 5

    setLoading(true)

    try {
      if (selectedProductId) {
        // UPDATE EXISTING PRODUCT
        if (!hasVariants) {
          const inputStock = Math.max(0, parseInt(stockQuantity) || 0)

          // Check previous stock
          const { data: currentProd } = await supabase
            .from('products')
            .select('stock_quantity, stock')
            .eq('id', selectedProductId)
            .single()

          const prevStock = currentProd ? (currentProd.stock_quantity ?? currentProd.stock ?? 0) : 0
          const delta = inputStock - prevStock

          const { error: updErr } = await supabase
            .from('products')
            .update({
              name: trimmedName,
              name_ta: nameTa.trim() || '',
              category: categoryName,
              category_id: categoryId ? Number(categoryId) : 1,
              price: priceNum,
              offer_price: priceNum,
              purchase_price: costNum,
              low_stock_alert: alertThreshold,
              barcode: barcode.trim() || null,
              description: description.trim() || '',
              has_variants: false,
              stock_quantity: inputStock,
              stock: inputStock,
            })
            .eq('id', selectedProductId)

          if (updErr) throw updErr

          if (delta !== 0) {
            await supabase.from('inventory_movements').insert({
              product_id: selectedProductId,
              variant_id: null,
              movement_type: delta > 0 ? 'RESTOCK' : 'CORRECTION',
              quantity_delta: delta,
              quantity_before: prevStock,
              quantity_after: inputStock,
              unit_cost: costNum || null,
              reference_type: 'PRODUCT_UPDATE',
              note: 'Stock updated in product editor',
              created_by_name: 'Admin',
            })
          }

          if (barcode.trim()) {
            await supabase.from('barcode_registry').upsert(
              {
                barcode: barcode.trim(),
                product_id: selectedProductId,
                variant_id: null,
                is_active: true,
              },
              { onConflict: 'barcode' }
            )
          }

          setStatusMessage({
            type: 'success',
            text: `Product "${trimmedName}" updated successfully with ${inputStock} stock units! Ready in POS Catalog.`,
          })
        } else {
          // Multi-variant update
          let totalVariantStock = 0
          for (const v of variantRows) {
            if (!v.variantName.trim()) continue
            const vPrice = Number(v.price) > 0 ? Number(v.price) : priceNum
            const vCost = Number(v.costPrice) > 0 ? Number(v.costPrice) : costNum
            const vStock = Math.max(0, Number(v.stock) || 0)
            totalVariantStock += vStock

            if (v.id.startsWith('var_')) {
              // Insert new variant
              const { data: createdVar, error: vErr } = await supabase
                .from('product_variants')
                .insert({
                  product_id: selectedProductId,
                  variant_name: v.variantName.trim(),
                  size_label: v.sizeLabel?.trim() || v.variantName.trim(),
                  price: vPrice,
                  purchase_price: vCost,
                  stock: vStock,
                  barcode: v.customBarcode?.trim() || null,
                  is_active: true,
                })
                .select()
                .single()

              if (!vErr && createdVar && vStock > 0) {
                await supabase.from('inventory_movements').insert({
                  product_id: selectedProductId,
                  variant_id: createdVar.id,
                  movement_type: 'RESTOCK',
                  quantity_delta: vStock,
                  quantity_before: 0,
                  quantity_after: vStock,
                  unit_cost: vCost || null,
                  reference_type: 'PRODUCT_UPDATE',
                  note: `Added variant ${v.variantName.trim()} with stock`,
                  created_by_name: 'Admin',
                })
              }
            } else {
              // Update existing variant
              const { data: curVar } = await supabase
                .from('product_variants')
                .select('stock')
                .eq('id', v.id)
                .single()

              const prevVarStock = curVar?.stock ?? 0
              const varDelta = vStock - prevVarStock

              await supabase
                .from('product_variants')
                .update({
                  variant_name: v.variantName.trim(),
                  size_label: v.sizeLabel?.trim() || v.variantName.trim(),
                  price: vPrice,
                  purchase_price: vCost,
                  stock: vStock,
                  barcode: v.customBarcode?.trim() || null,
                })
                .eq('id', v.id)

              if (varDelta !== 0) {
                await supabase.from('inventory_movements').insert({
                  product_id: selectedProductId,
                  variant_id: v.id,
                  movement_type: varDelta > 0 ? 'RESTOCK' : 'CORRECTION',
                  quantity_delta: varDelta,
                  quantity_before: prevVarStock,
                  quantity_after: vStock,
                  unit_cost: vCost || null,
                  reference_type: 'PRODUCT_UPDATE',
                  note: `Stock updated for variant ${v.variantName.trim()}`,
                  created_by_name: 'Admin',
                })
              }
            }
          }

          // Update parent product
          await supabase
            .from('products')
            .update({
              name: trimmedName,
              name_ta: nameTa.trim() || '',
              category: categoryName,
              category_id: categoryId ? Number(categoryId) : 1,
              price: priceNum,
              offer_price: priceNum,
              purchase_price: costNum,
              low_stock_alert: alertThreshold,
              barcode: null,
              description: description.trim() || '',
              has_variants: true,
              stock_quantity: totalVariantStock,
              stock: totalVariantStock,
            })
            .eq('id', selectedProductId)

          setStatusMessage({
            type: 'success',
            text: `Product "${trimmedName}" updated with ${totalVariantStock} total variant stock units! Ready in POS Catalog.`,
          })
        }
      } else {
        // CREATE NEW PRODUCT
        if (!hasVariants) {
          const inputStock = Math.max(0, parseInt(stockQuantity) || 0)

          const { data: newProd, error: insErr } = await supabase
            .from('products')
            .insert({
              name: trimmedName,
              name_ta: nameTa.trim() || '',
              category: categoryName,
              category_id: categoryId ? Number(categoryId) : 1,
              price: priceNum,
              offer_price: priceNum,
              purchase_price: costNum,
              low_stock_alert: alertThreshold,
              barcode: barcode.trim() || null,
              description: description.trim() || '',
              has_variants: false,
              stock_quantity: inputStock,
              stock: inputStock,
              is_active: true,
            })
            .select('id, name')
            .single()

          if (insErr || !newProd) throw insErr || new Error('Failed to create product')

          if (barcode.trim()) {
            await supabase.from('barcode_registry').upsert(
              {
                barcode: barcode.trim(),
                product_id: newProd.id,
                variant_id: null,
                is_active: true,
              },
              { onConflict: 'barcode' }
            )
          }

          if (inputStock > 0) {
            await supabase.from('inventory_movements').insert({
              product_id: newProd.id,
              variant_id: null,
              movement_type: 'RESTOCK',
              quantity_delta: inputStock,
              quantity_before: 0,
              quantity_after: inputStock,
              unit_cost: costNum || null,
              reference_type: 'PRODUCT_CREATION',
              note: 'Initial received stock on product creation',
              created_by_name: 'Admin',
            })
          }

          setStatusMessage({
            type: 'success',
            text: `Product "${trimmedName}" created with ${inputStock} stock units! Immediately ready in catalog & billing.`,
          })
          resetForm()
        } else {
          // Multi-variant creation
          let totalVariantStock = 0
          variantRows.forEach((v) => {
            if (v.variantName.trim()) {
              totalVariantStock += Math.max(0, Number(v.stock) || 0)
            }
          })

          const { data: newProd, error: insErr } = await supabase
            .from('products')
            .insert({
              name: trimmedName,
              name_ta: nameTa.trim() || '',
              category: categoryName,
              category_id: categoryId ? Number(categoryId) : 1,
              price: priceNum,
              offer_price: priceNum,
              purchase_price: costNum,
              low_stock_alert: alertThreshold,
              barcode: null,
              description: description.trim() || '',
              has_variants: true,
              stock_quantity: totalVariantStock,
              stock: totalVariantStock,
              is_active: true,
            })
            .select('id, name')
            .single()

          if (insErr || !newProd) throw insErr || new Error('Failed to create product')

          for (const v of variantRows) {
            if (!v.variantName.trim()) continue
            const vPrice = Number(v.price) > 0 ? Number(v.price) : priceNum
            const vCost = Number(v.costPrice) > 0 ? Number(v.costPrice) : costNum
            const vStock = Math.max(0, Number(v.stock) || 0)

            const { data: createdVar } = await supabase
              .from('product_variants')
              .insert({
                product_id: newProd.id,
                variant_name: v.variantName.trim(),
                size_label: v.sizeLabel?.trim() || v.variantName.trim(),
                price: vPrice,
                purchase_price: vCost,
                stock: vStock,
                barcode: v.customBarcode?.trim() || null,
                is_active: true,
              })
              .select('id')
              .single()

            if (createdVar && v.customBarcode?.trim()) {
              await supabase.from('barcode_registry').upsert(
                {
                  barcode: v.customBarcode.trim(),
                  product_id: newProd.id,
                  variant_id: createdVar.id,
                  is_active: true,
                },
                { onConflict: 'barcode' }
              )
            }

            if (createdVar && vStock > 0) {
              await supabase.from('inventory_movements').insert({
                product_id: newProd.id,
                variant_id: createdVar.id,
                movement_type: 'RESTOCK',
                quantity_delta: vStock,
                quantity_before: 0,
                quantity_after: vStock,
                unit_cost: vCost || null,
                reference_type: 'PRODUCT_CREATION',
                note: `Initial stock for variant ${v.variantName.trim()}`,
                created_by_name: 'Admin',
              })
            }
          }

          setStatusMessage({
            type: 'success',
            text: `Multi-variant product "${trimmedName}" created with ${totalVariantStock} total units! Immediately ready in catalog & billing.`,
          })
          resetForm()
        }
      }

      await fetchProducts(true)
      onStockUpdated?.()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred while saving'
      setStatusMessage({ type: 'error', text: msg })
    } finally {
      setLoading(false)
    }
  }

  // Only active products in the authoring catalog
  const activeProducts = products.filter((p) => p.isActive !== false)

  useEffect(() => {
    if (selectedProductId && !activeProducts.some((p) => Number(p.id) === selectedProductId)) {
      resetForm()
    }
  }, [activeProducts, selectedProductId])

  const filteredProducts = activeProducts.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.category && p.category.toLowerCase().includes(search.toLowerCase())) ||
    (p.barcode && p.barcode.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Mobile Switch: Product List vs Add/Edit Form */}
      <div className="lg:hidden flex items-center p-1 bg-white border border-[#E8D399] rounded-2xl shadow-xs shrink-0">
        <button
          type="button"
          onClick={() => setMobileView('list')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
            mobileView === 'list'
              ? 'bg-[#0A0A0A] text-[#D4AF37] shadow-sm'
              : 'text-gray-600 hover:text-black'
          }`}
        >
          <Boxes size={15} /> Catalog ({activeProducts.length})
        </button>
        <button
          type="button"
          onClick={() => {
            if (mobileView === 'form' && selectedProductId) {
              resetForm()
            }
            setMobileView('form')
          }}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
            mobileView === 'form'
              ? 'bg-[#0A0A0A] text-[#D4AF37] shadow-sm'
              : 'text-gray-600 hover:text-black'
          }`}
        >
          <Plus size={15} /> {selectedProductId ? 'Edit Product' : 'Add New Product'}
        </button>
      </div>

      <div className="h-[calc(100vh-250px)] sm:h-[calc(100vh-220px)] min-h-[480px] flex flex-col lg:flex-row gap-5 overflow-hidden">
        {/* LEFT COLUMN: Products Browser List */}
        <div className={`w-full lg:w-80 xl:w-96 flex-col bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm shrink-0 h-full min-h-0 ${
          mobileView === 'list' ? 'flex' : 'hidden lg:flex'
        }`}>
          <div className="p-3.5 border-b border-gray-200 bg-[#FAFAFA] shrink-0">
            <h4 className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
              <Package size={14} className="text-[#D4AF37]" />
              Product Catalog ({activeProducts.length})
            </h4>
            <p className="text-[10px] text-gray-500 font-medium mt-0.5">
              Select any item to view or edit product details
            </p>
          </div>

          <div className="p-3 border-b border-gray-100 bg-[#FBFAF6] shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search products, SKUs, barcode..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-[#0A0A0A]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 min-h-0 hide-scrollbar">
            {filteredProducts.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400 font-bold">
                No products found.
              </div>
            ) : (
              filteredProducts.map((p) => {
                const isSelected = selectedProductId !== null && String(selectedProductId) === String(p.id)
                return (
                  <div
                    key={p.id}
                    onClick={() => void startEditProduct(p)}
                    className={`group p-3 sm:p-3.5 cursor-pointer flex items-center justify-between gap-2.5 transition-all ${
                      isSelected
                        ? 'bg-[#FFF9E6] border-l-4 border-[#D4AF37] ring-1 ring-[#D4AF37]/40 shadow-xs'
                        : 'hover:bg-[#FBFAF6] border-l-4 border-transparent hover:border-l-gray-300'
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-gray-900 truncate" title={p.name}>
                          {p.name}
                        </span>
                        {isSelected && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-[#0A0A0A] text-[#D4AF37] shrink-0">
                            Editing
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-500 font-medium truncate mt-0.5">
                        {p.category || 'General'} {p.hasVariants ? '• Multi-variant' : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <span className="font-black text-xs text-gray-900 tabular-nums">₹{p.price}</span>
                        <span className="block text-[10px] text-emerald-700 font-bold tabular-nums">
                          Stock: {p.stockQuantity ?? p.stock ?? 0}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            void startEditProduct(p)
                          }}
                          className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#0A0A0A] text-[#D4AF37] border-[#D4AF37] shadow-xs'
                              : 'border-gray-200 bg-white text-gray-600 hover:bg-[#0A0A0A] hover:text-[#D4AF37] hover:border-black'
                          }`}
                          title={`Edit "${p.name}"`}
                          aria-label={`Edit ${p.name}`}
                        >
                          <Edit2 size={13} className={isSelected ? 'text-[#D4AF37]' : ''} />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteProduct(Number(p.id), p.name)
                          }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer"
                          title={`Delete "${p.name}"`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Product Authoring Form Workspace */}
        <div className={`flex-1 flex-col bg-[#FBFAF6] border border-gray-200 rounded-2xl shadow-sm overflow-hidden h-full min-h-0 ${
          mobileView === 'form' ? 'flex' : 'hidden lg:flex'
        }`}>
          {/* Pinned Form Header */}
          <div className="px-4 py-3 sm:px-6 sm:py-4 bg-white border-b border-gray-200 flex items-center justify-between shrink-0 gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setMobileView('list')}
                className="lg:hidden p-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition cursor-pointer shrink-0"
                title="Back to Catalog List"
              >
                <ArrowLeft size={16} />
              </button>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-black flex items-center gap-2 truncate">
                  <Package size={16} className="text-[#D4AF37] shrink-0" />
                  <span className="truncate">{selectedProductId ? 'Edit Product & Stock Details' : 'Add New Product to Catalog'}</span>
                  {selectedProductId && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                      Editing
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-gray-500 font-semibold truncate hidden sm:block">
                  {selectedProductId
                    ? `Modifying "${name || 'product'}" — update pricing, barcode, threshold or variants`
                    : 'Receive stock, configure pricing & categories (Barcode is optional)'}
                </p>
              </div>
            </div>
            {selectedProductId ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    resetForm()
                    setMobileView('form')
                  }}
                  className="px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  title="Exit edit mode and add a new product"
                >
                  <Plus size={13} /> <span className="hidden sm:inline">Add New Product</span><span className="sm:hidden">New</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteProduct(selectedProductId, name)}
                  className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                  title="Delete this product"
                >
                  <Trash2 size={13} /> <span className="hidden sm:inline">Delete</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setMobileView('list')}
                className="lg:hidden text-xs font-bold text-gray-500 hover:text-black cursor-pointer px-2 py-1 rounded-lg bg-gray-100"
              >
                Catalog ({activeProducts.length})
              </button>
            )}
          </div>

        {/* Scrollable Form Body with Pinned Bottom Action Bar */}
        <form onSubmit={handleSaveProduct} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 min-h-0 hide-scrollbar">
            {/* Status Message */}
            {statusMessage && (
              <div
                className={`p-3 rounded-xl text-xs font-bold flex items-center justify-between ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                <span>{statusMessage.text}</span>
                <button onClick={() => setStatusMessage(null)} className="font-black">✕</button>
              </div>
            )}

            {/* Name Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1.5 h-4 flex items-center">
                  Product Name (English) <span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Linen Cotton Shirt"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-[#0A0A0A]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1.5 h-4 flex items-center">
                  Tamil Name <span className="text-gray-400 font-normal ml-1">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. காட்டன் சட்டை"
                  value={nameTa}
                  onChange={(e) => setNameTa(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-[#0A0A0A]"
                />
              </div>
            </div>

            {/* Category, Barcode, and Low Stock Alert */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1.5 h-4 flex items-center">
                  Category
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full h-10 px-3 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-[#0A0A0A]"
                >
                  <option value="">-- Select Category --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_en}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1.5 h-4 flex items-center">
                  Barcode <span className="text-gray-400 font-normal ml-1">(Optional)</span>
                </label>
                <input
                  type="text"
                  disabled={hasVariants}
                  placeholder={hasVariants ? 'Defined at variant level' : 'e.g. 8901234567'}
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-[#0A0A0A] disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1.5 h-4 flex items-center">
                  Low Stock Alert Threshold
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="5"
                  value={lowStockAlert}
                  onChange={(e) => setLowStockAlert(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-[#0A0A0A]"
                />
              </div>
            </div>

            {/* Base Pricing & Received Stock (only if no variants) */}
            {!hasVariants && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-white border border-gray-200 rounded-xl items-start">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1.5 h-4 flex items-center">
                    Selling Price (₹) <span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required={!hasVariants}
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-[#0A0A0A]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1.5 h-4 flex items-center">
                    Purchase / Cost Price (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-[#0A0A0A]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-emerald-800 mb-1.5 h-4 flex items-center gap-1">
                    <Boxes size={13} className="text-emerald-600 shrink-0" />
                    <span>Received / Current Stock</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl border border-emerald-300 bg-emerald-50/50 text-xs font-bold text-emerald-950 outline-none focus:border-emerald-600 focus:bg-white"
                  />
                </div>
              </div>
            )}

            {/* Description */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1.5 h-4 flex items-center">
                Description / Notes <span className="text-gray-400 font-normal ml-1">(Optional)</span>
              </label>
              <textarea
                rows={2}
                placeholder="Product material, care instructions, or rack location notes..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-3 rounded-xl border border-gray-300 bg-white text-xs font-medium text-gray-900 outline-none focus:border-[#0A0A0A] resize-none"
              />
            </div>

            {/* Variant Switch & Matrix */}
            <div className="border border-gray-200 rounded-2xl p-4 bg-white space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-black text-black flex items-center gap-1.5">
                    <Tag size={14} className="text-[#D4AF37]" /> Multi-Variant Product (Sizes, Colors, SKUs)
                  </span>
                  <p className="text-[11px] text-gray-500 font-medium">
                    Enable if this product comes in multiple sizes (e.g. S, M, L, XL) or colors
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasVariants}
                    onChange={(e) => {
                      setHasVariants(e.target.checked)
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0A0A0A]" />
                </label>
              </div>

              {hasVariants && (
                <div className="space-y-4 pt-3 border-t border-gray-100">
                  {/* Standardized Partitioned Size Selector & Custom Variant Bar */}
                  <div className="bg-[#FBFAF6] border border-[#E8D399] rounded-xl p-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1 p-0.5 bg-white border border-gray-200 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setSizePartition('alpha')}
                          className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                            sizePartition === 'alpha'
                              ? 'bg-[#0A0A0A] text-[#D4AF37] shadow-xs'
                              : 'text-gray-600 hover:text-black'
                          }`}
                        >
                          Alpha Sizes (S, M, L, XL...)
                        </button>
                        <button
                          type="button"
                          onClick={() => setSizePartition('numeric')}
                          className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                            sizePartition === 'numeric'
                              ? 'bg-[#0A0A0A] text-[#D4AF37] shadow-xs'
                              : 'text-gray-600 hover:text-black'
                          }`}
                        >
                          Numeric Sizes (28, 30, 32...)
                        </button>
                        <button
                          type="button"
                          onClick={() => setSizePartition('custom')}
                          className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                            sizePartition === 'custom'
                              ? 'bg-[#0A0A0A] text-[#D4AF37] shadow-xs'
                              : 'text-gray-600 hover:text-black'
                          }`}
                        >
                          Special & Custom
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddFullPack(sizePartition)}
                        className="px-2.5 py-1 rounded-lg bg-white border border-[#D4AF37] text-[#0A0A0A] text-[11px] font-bold hover:bg-[#FFF9E6] transition-colors cursor-pointer"
                      >
                        + Add Full Size Set ({sizePartition === 'alpha' ? 'S to 2XL' : sizePartition === 'numeric' ? '28 to 38' : 'Standard Specials'})
                      </button>
                    </div>

                    {/* Quick-Add Chips */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider mr-1">
                        Quick Add:
                      </span>
                      {(sizePartition === 'alpha'
                        ? STANDARD_LETTER_SIZES
                        : sizePartition === 'numeric'
                        ? STANDARD_NUMERIC_SIZES
                        : STANDARD_SPECIAL_SIZES
                      ).map((sz) => {
                        const isSelected = variantRows.some(
                          (r) => r.variantName.trim().toUpperCase() === sz.toUpperCase()
                        )
                        return (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => handleAddStandardSize(sz)}
                            disabled={isSelected}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                              isSelected
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 opacity-60 cursor-default'
                                : 'bg-white text-gray-800 border-gray-300 hover:border-[#D4AF37] hover:bg-[#FFF9E6] cursor-pointer'
                            }`}
                          >
                            {isSelected ? `✓ ${sz}` : `+ ${sz}`}
                          </button>
                        )
                      })}
                    </div>

                    {/* Flexible Custom Variant Input Bar */}
                    <div className="pt-2 border-t border-[#E8D399]/60 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          placeholder="Type custom variant (e.g. Free Size, 34-Slim, Kids 5Y, Red-XL, Combo Pack)..."
                          value={customVariantInput}
                          onChange={(e) => setCustomVariantInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleAddCustomNamedVariant(customVariantInput)
                            }
                          }}
                          className="w-full h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-900 placeholder:text-gray-400 focus:border-[#0A0A0A] outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddCustomNamedVariant(customVariantInput)}
                        disabled={!customVariantInput.trim()}
                        className="h-8 px-3.5 rounded-lg bg-[#0A0A0A] text-[#D4AF37] text-xs font-bold hover:bg-[#1A1A1A] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all flex items-center justify-center gap-1.5 shrink-0"
                      >
                        <Plus size={13} /> Add Custom
                      </button>
                    </div>
                  </div>

                  {/* HTML Datalist for Standard and Special Sizes */}
                  <datalist id="standard-clothing-sizes">
                    {STANDARD_LETTER_SIZES.map((s) => (
                      <option key={`alpha-${s}`} value={s}>
                        Standard Alpha Size: {s}
                      </option>
                    ))}
                    {STANDARD_NUMERIC_SIZES.map((s) => (
                      <option key={`num-${s}`} value={s}>
                        Standard Numeric Size: {s}
                      </option>
                    ))}
                    {STANDARD_SPECIAL_SIZES.map((s) => (
                      <option key={`special-${s}`} value={s}>
                        Special Variant / Size: {s}
                      </option>
                    ))}
                  </datalist>

                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-gray-700">
                      Variant SKUs ({variantRows.length})
                    </span>
                    <button
                      type="button"
                      onClick={handleAddVariantRow}
                      className="px-3 py-1 rounded-lg bg-[#0A0A0A] text-[#D4AF37] text-xs font-black flex items-center gap-1 hover:bg-[#1A1A1A] cursor-pointer"
                    >
                      <Plus size={12} /> Add Blank Variant Row
                    </button>
                  </div>

                  {variantRows.length === 0 ? (
                    <div className="p-6 border-2 border-dashed border-gray-200 rounded-xl text-center bg-[#FAFAF8] space-y-1.5">
                      <Boxes size={26} className="mx-auto text-gray-400" />
                      <p className="text-xs font-bold text-gray-700">No Variant SKUs Added Yet</p>
                      <p className="text-[11px] text-gray-500 max-w-md mx-auto">
                        Click quick-add size chips above, type any custom variant name (e.g. Free Size, 34-Slim), or click <span className="font-semibold text-gray-700">+ Add Blank Variant Row</span>.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                    {variantRows.map((v) => (
                      <div
                        key={v.id}
                        className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-3 rounded-xl bg-[#FBFAF6] border border-gray-200 items-center"
                      >
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-bold text-gray-600 mb-0.5">
                            Size / Variant
                          </label>
                          <input
                            type="text"
                            list="standard-clothing-sizes"
                            required
                            placeholder="e.g. M, L, 32, 34"
                            value={v.variantName}
                            onChange={(e) => handleUpdateVariantRow(v.id, 'variantName', e.target.value)}
                            className="w-full h-8 px-2.5 rounded-lg border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-[#0A0A0A]"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-gray-600 mb-0.5">
                            Price (₹)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            required
                            placeholder="0.00"
                            value={v.price || ''}
                            onChange={(e) => handleUpdateVariantRow(v.id, 'price', parseFloat(e.target.value) || 0)}
                            className="w-full h-8 px-2.5 rounded-lg border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-[#0A0A0A]"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-gray-600 mb-0.5">
                            Cost (₹)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={v.costPrice || ''}
                            onChange={(e) => handleUpdateVariantRow(v.id, 'costPrice', parseFloat(e.target.value) || 0)}
                            className="w-full h-8 px-2.5 rounded-lg border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-[#0A0A0A]"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-emerald-800 mb-0.5">
                            Received Stock
                          </label>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={v.stock || ''}
                            onChange={(e) => handleUpdateVariantRow(v.id, 'stock', parseInt(e.target.value) || 0)}
                            className="w-full h-8 px-2.5 rounded-lg border border-emerald-300 bg-emerald-50/40 text-xs font-black text-emerald-950 outline-none focus:border-emerald-600"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-gray-600 mb-0.5">
                            Barcode (Opt)
                          </label>
                          <input
                            type="text"
                            placeholder="Optional"
                            value={v.customBarcode || ''}
                            onChange={(e) => handleUpdateVariantRow(v.id, 'customBarcode', e.target.value)}
                            className="w-full h-8 px-2.5 rounded-lg border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-[#0A0A0A]"
                          />
                        </div>

                        <div className="sm:col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleRemoveVariantRow(v.id)}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Remove variant"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Pinned Bottom Actions */}
          <div className="shrink-0 px-4 py-3 sm:px-6 sm:py-3.5 border-t border-gray-200 bg-white flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 sm:px-6 sm:py-2.5 rounded-xl bg-[#0A0A0A] border border-[#D4AF37] text-[#D4AF37] text-xs font-black uppercase tracking-wider hover:bg-[#1A1A1A] transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin inline-block" />
                  Saving Product...
                </>
              ) : (
                <>
                  <Check size={14} /> {selectedProductId ? 'Update Product' : 'Save & Add Product'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
  )
}
