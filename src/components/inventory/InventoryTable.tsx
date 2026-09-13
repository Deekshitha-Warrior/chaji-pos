import React, { useState, useEffect, useCallback } from 'react'
import {
  Search,
  SlidersHorizontal,
  Printer,
  History,
  AlertTriangle,
  Package,
  Layers,
  RefreshCw,
  BarChart3,
  Tag,
  PackagePlus,
  Box,
  Edit2,
  Trash2,
} from 'lucide-react'
import { inventoryService, type InventoryStockItem } from '../../services/inventoryService'
import { CreateBarcodeModal } from '../barcode/CreateBarcodeModal'
import { BarcodePrintModal } from '../barcode/BarcodePrintModal'
import { AdjustStockModal } from './AdjustStockModal'
import { StockHistoryDrawer } from './StockHistoryDrawer'
import { QuickPriceModal } from './QuickPriceModal'
import { formatCurrency } from '../../lib/retail'
import { useProductStore, useAdminAuthStore } from '../../store/store'
import { useAlarmStore } from '../../store/alarmStore'
import { alarmSound } from '../../lib/alarmAudio'
import { CategoryManagerView } from './CategoryManagerView'
import { InventoryAnalyticsView } from './InventoryAnalyticsView'
import { AddEditProductView } from './AddEditProductView'

type InventoryTab = 'stock' | 'products' | 'categories' | 'analytics'

export const InventoryTable: React.FC = () => {
  const role = useAdminAuthStore((state) => state.role)
  const [activeTab, setActiveTab] = useState<InventoryTab>('stock')
  const { products: storeProducts, fetchProducts } = useProductStore()
  const [items, setItems] = useState<InventoryStockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'in_stock' | 'low' | 'out'>('all')

  // Modals state
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [selectedForReceive, setSelectedForReceive] = useState<{ productId: number; variantId?: string | null } | null>(null)

  const [printModalItem, setPrintModalItem] = useState<InventoryStockItem | null>(null)
  const [adjustModalItem, setAdjustModalItem] = useState<InventoryStockItem | null>(null)
  const [historyDrawerItem, setHistoryDrawerItem] = useState<InventoryStockItem | null>(null)
  const [priceModalItem, setPriceModalItem] = useState<InventoryStockItem | null>(null)
  const [editProductId, setEditProductId] = useState<number | string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      void fetchProducts(true)
      const data = await inventoryService.fetchInventoryItems()
      setItems(data)

      // Alert sound and modal when viewing inventory with low stock
      const lowStockFlagged = data
        .filter((i) => i.stock > 0 && i.stock <= (i.low_stock_threshold || 5))
        .map((i) => ({
          id: i.variant_id ? `v-${i.variant_id}` : `p-${i.product_id}`,
          name: i.name,
          variantName: i.variant_name || undefined,
          stock: i.stock,
          alertThreshold: i.low_stock_threshold || 5,
          barcode: i.barcode || undefined,
          category: i.category || undefined,
        }))

      if (lowStockFlagged.length > 0) {
        useAlarmStore.getState().resetSilencedState()
        useAlarmStore.getState().setLowStockItems(lowStockFlagged)
        alarmSound.startAlert()
      }
    } catch (err) {
      console.error('Failed to load inventory items:', err)
    } finally {
      setLoading(false)
    }
  }, [fetchProducts])

  const handleDeleteItem = async (item: InventoryStockItem) => {
    const itemLabel = item.variant_name ? `${item.name} (${item.variant_name})` : item.name
    if (!window.confirm(`Are you sure you want to delete "${itemLabel}" from catalog & inventory?`)) {
      return
    }

    try {
      setLoading(true)
      await inventoryService.deleteInventoryItem(item.product_id, item.variant_id)
      await fetchProducts(true)
      await loadData()
    } catch (err) {
      console.error('Failed to delete inventory item:', err)
      alert(err instanceof Error ? err.message : 'Failed to delete item')
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Filter items for Stock Management view
  const filtered = items.filter((item) => {
    const q = search.toLowerCase().trim()
    const matchesSearch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      (item.variant_name && item.variant_name.toLowerCase().includes(q)) ||
      (item.barcode && item.barcode.toLowerCase().includes(q)) ||
      (item.sku && item.sku.toLowerCase().includes(q)) ||
      (item.category && item.category.toLowerCase().includes(q))

    if (!matchesSearch) return false

    const threshold = item.low_stock_threshold || 5
    if (filterStatus === 'out') return item.stock <= 0
    if (filterStatus === 'low') return item.stock > 0 && item.stock <= threshold
    if (filterStatus === 'in_stock') return item.stock > threshold

    return true
  })

  // Summary Metrics
  const totalSkus = items.length
  const totalUnits = items.reduce((sum, i) => sum + i.stock, 0)
  const outOfStockCount = items.filter((i) => i.stock <= 0).length
  const lowStockCount = items.filter((i) => i.stock > 0 && i.stock <= (i.low_stock_threshold || 5)).length
  const inStockCount = items.filter((i) => i.stock > (i.low_stock_threshold || 5)).length
  const totalValuation = items.reduce((sum, i) => sum + i.stock * i.price, 0)

  interface ProductOptionType {
    id: number
    name: string
    price: number
    cost_price?: number
    barcode?: string
    stock_quantity?: number
    category?: string
    has_variants?: boolean
  }

  // Combined product options for Barcode Generator intake
  const distinctProducts: ProductOptionType[] = Array.from(
    new Map<number, ProductOptionType>([
      ...storeProducts
        .filter((p) => p.isActive !== false && p.category?.trim().toLowerCase() !== 'unregistered')
        .map(
          (p): [number, ProductOptionType] => [
            Number(p.id),
            {
              id: Number(p.id),
              name: p.name,
              price: p.price,
              cost_price: p.purchasePrice || 0,
              barcode: p.barcode,
              stock_quantity: p.stockQuantity ?? p.stock ?? 0,
              category: p.category,
              has_variants: p.hasVariants,
            },
          ]
        ),
      ...items
        .filter((i) => i.category?.trim().toLowerCase() !== 'unregistered')
        .map(
          (i): [number, ProductOptionType] => [
            i.product_id,
            {
              id: i.product_id,
              name: i.name,
              price: i.price,
              cost_price: 0,
              barcode: i.barcode || undefined,
              stock_quantity: i.stock,
              category: i.category || undefined,
              has_variants: !!i.variant_id,
            },
          ]
        ),
    ]).values()
  )

  return (
    <div className="space-y-6">
      {/* NAVIGATION / HEADER */}
      <div className="bg-white border border-[#E8D399] rounded-2xl p-2 sm:p-2.5 shadow-sm flex items-center justify-between gap-3 overflow-x-auto hide-scrollbar">
        <div className="flex items-center gap-1.5 p-1 bg-[#FBFAF6] border border-gray-200 rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('stock')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'stock'
                ? 'bg-[#0A0A0A] text-[#D4AF37] shadow-sm'
                : 'text-gray-600 hover:text-black hover:bg-gray-100'
            }`}
          >
            <Box size={14} /> Stock Management
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('products')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'products'
                ? 'bg-[#0A0A0A] text-[#D4AF37] shadow-sm'
                : 'text-gray-600 hover:text-black hover:bg-gray-100'
            }`}
          >
            <Package size={14} /> Add / Edit Products
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('categories')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'categories'
                ? 'bg-[#0A0A0A] text-[#D4AF37] shadow-sm'
                : 'text-gray-600 hover:text-black hover:bg-gray-100'
            }`}
          >
            <Tag size={14} /> Categories
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'analytics'
                ? 'bg-[#0A0A0A] text-[#D4AF37] shadow-sm'
                : 'text-gray-600 hover:text-black hover:bg-gray-100'
            }`}
          >
            <BarChart3 size={14} /> Analytics &amp; Reports
          </button>
        </div>

        {/* Global Add Barcode CTA (Admin Only) */}
        {role === 'admin' && (
          <button
            type="button"
            onClick={() => {
              setSelectedForReceive(null)
              setShowReceiveModal(true)
            }}
            className="px-4 py-2.5 rounded-xl bg-[#0A0A0A] border border-[#D4AF37] text-[#D4AF37] text-xs font-black hover:bg-[#1A1A1A] transition-all shadow-md flex items-center gap-2 cursor-pointer shrink-0 whitespace-nowrap"
            title="Generate & print barcodes for items"
          >
            <Printer size={15} /> Add Barcode
          </button>
        )}
      </div>

      {/* TAB 1: STOCK MANAGEMENT VIEW */}
      {activeTab === 'stock' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Top KPI Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white border border-[#E8D399] rounded-2xl p-4 shadow-sm flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#0A0A0A] text-[#D4AF37] flex items-center justify-center font-black">
                <Layers size={20} />
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-500">Total SKUs</div>
                <div className="text-xl font-black text-black">{totalSkus}</div>
              </div>
            </div>

            <div className="bg-white border border-[#E8D399] rounded-2xl p-4 shadow-sm flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-black">
                <Package size={20} />
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-500">Total Stock</div>
                <div className="text-xl font-black text-emerald-700">{totalUnits} Units</div>
              </div>
            </div>

            <div className="bg-white border border-[#E8D399] rounded-2xl p-4 shadow-sm flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center font-black">
                <AlertTriangle size={20} />
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-500">Low Stock Items</div>
                <div className="text-xl font-black text-amber-700">{lowStockCount}</div>
              </div>
            </div>

            <div className="bg-white border border-[#E8D399] rounded-2xl p-4 shadow-sm flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#FBFAF6] text-[#0A0A0A] border border-[#E8D399] flex items-center justify-center font-black text-sm">
                ₹
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-500">Stock Valuation</div>
                <div className="text-lg font-black text-[#0A0A0A]">{formatCurrency(totalValuation)}</div>
              </div>
            </div>
          </div>

          {/* Toolbar & Filter Chips */}
          <div className="bg-white border border-[#E8D399] rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search SKU name, variant, barcode, category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 bg-[#FBFAF6] text-xs font-bold text-gray-900 outline-none focus:border-[#0A0A0A] focus:bg-white"
              />
            </div>

            {/* Filter Chips & Refresh */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setFilterStatus('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filterStatus === 'all'
                    ? 'bg-[#0A0A0A] text-[#D4AF37] shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('in_stock')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filterStatus === 'in_stock'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                In Stock ({inStockCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('low')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filterStatus === 'low'
                    ? 'bg-amber-800 text-white shadow-xs'
                    : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                Low Stock ({lowStockCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('out')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filterStatus === 'out'
                    ? 'bg-red-800 text-white shadow-xs'
                    : 'bg-red-50 text-red-800 border border-red-200 hover:bg-red-100'
                }`}
              >
                Out of Stock ({outOfStockCount})
              </button>
              <button
                type="button"
                onClick={loadData}
                className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                title="Refresh stock list"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Stock Table & Mobile Cards */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            {loading ? (
              <div className="p-16 text-center text-gray-400 font-bold text-xs flex flex-col items-center justify-center">
                <RefreshCw size={24} className="animate-spin text-[#D4AF37] mb-2" />
                Loading inventory items...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-16 text-center text-gray-400 font-bold text-xs">
                No inventory items match your search or filter.
              </div>
            ) : (
              <>
                {/* UNIFIED TABLE VIEW (Preserved on both mobile and laptop with horizontal scroll) */}
                <div className="overflow-x-auto w-full">
                  <table className="w-full min-w-[860px] text-left text-xs border-collapse whitespace-nowrap">
                    <thead className="bg-[#FBFAF6] border-b border-gray-200 text-xs font-bold text-gray-700 select-none">
                      <tr>
                        <th className="py-3.5 px-4 text-left min-w-[220px] whitespace-nowrap">Product &amp; Variant SKU</th>
                        <th className="py-3.5 px-4 text-left w-[140px] whitespace-nowrap">Barcode</th>
                        <th className="py-3.5 px-4 text-left w-[130px] whitespace-nowrap">Category</th>
                        <th className="py-3.5 px-4 text-center w-[130px] whitespace-nowrap">Stock Level</th>
                        <th className="py-3.5 px-4 text-right w-[130px] whitespace-nowrap">Selling Price</th>
                        <th className="py-3.5 px-4 text-right w-[180px] whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtered.map((item) => (
                        <tr key={item.id} className="hover:bg-[#FBFAF6] transition-colors">
                          {/* Name & Variant */}
                          <td className="py-3.5 px-4 text-left align-middle whitespace-nowrap">
                            <div className="font-black text-gray-900 text-xs leading-snug">
                              {item.name}
                            </div>
                            {item.variant_name ? (
                              <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-[#FBFAF6] border border-[#E8D399] text-[#0A0A0A] font-bold text-[10px]">
                                Size: {item.variant_name}
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-400 font-medium">
                                Standard Product
                              </span>
                            )}
                          </td>

                          {/* Barcode */}
                          <td className="py-3.5 px-4 text-left align-middle whitespace-nowrap">
                            {item.barcode ? (
                              <span className="inline-block font-mono text-xs font-bold text-gray-800 bg-gray-100 px-2 py-1 rounded-md">
                                {item.barcode}
                              </span>
                            ) : (
                              <span className="text-gray-400 italic text-[11px]">No Barcode</span>
                            )}
                          </td>

                          {/* Category */}
                          <td className="py-3.5 px-4 text-left align-middle text-gray-600 font-semibold whitespace-nowrap">
                            <span className="inline-block px-2 py-0.5 bg-gray-50 rounded text-gray-700 border border-gray-200 text-[11px]">
                              {item.category || 'General'}
                            </span>
                          </td>

                          {/* Stock */}
                          <td className="py-3.5 px-4 text-center align-middle whitespace-nowrap">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-xs font-black tabular-nums ${
                                item.stock <= 0
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : item.stock <= (item.low_stock_threshold || 5)
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {item.stock} Units
                            </span>
                          </td>

                          {/* Price */}
                          <td className="py-3.5 px-4 text-right align-middle font-black text-xs text-gray-900 tabular-nums whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5 group">
                              <span>{formatCurrency(item.price)}</span>
                              <button
                                type="button"
                                onClick={() => setPriceModalItem(item)}
                                className="p-1 rounded-md text-gray-400 hover:text-amber-800 hover:bg-amber-100/70 transition-all cursor-pointer"
                                title="Quick Edit Price"
                              >
                                <Edit2 size={12} />
                              </button>
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right align-middle whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Adjust Stock */}
                              <button
                                type="button"
                                onClick={() => setAdjustModalItem(item)}
                                className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 text-[11px] font-bold transition-colors cursor-pointer shrink-0"
                                title="Adjust Stock"
                              >
                                <SlidersHorizontal size={13} className="inline mr-1" />
                                Adjust
                              </button>

                              {/* Stock History */}
                              <button
                                type="button"
                                onClick={() => setHistoryDrawerItem(item)}
                                className="p-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
                                title="Stock History"
                              >
                                <History size={14} />
                              </button>

                              {/* Print Barcode (reserves identical spacing when item has no barcode) */}
                              <button
                                type="button"
                                disabled={!item.barcode}
                                onClick={() => item.barcode && setPrintModalItem(item)}
                                className={`p-1.5 rounded-lg border transition-colors shrink-0 ${
                                  item.barcode
                                    ? 'bg-[#0A0A0A] text-[#D4AF37] border-[#D4AF37] hover:bg-[#1A1A1A] cursor-pointer'
                                    : 'invisible pointer-events-none border-transparent'
                                }`}
                                title={item.barcode ? 'Print Barcode Labels' : undefined}
                                aria-hidden={!item.barcode}
                              >
                                <Printer size={14} />
                              </button>

                              {/* Edit in Catalog */}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditProductId(item.product_id)
                                  setActiveTab('products')
                                }}
                                className="p-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-[#0A0A0A] hover:text-[#D4AF37] hover:border-black transition-colors cursor-pointer shrink-0"
                                title={`Edit "${item.name}" in Catalog`}
                              >
                                <Edit2 size={14} />
                              </button>

                              {/* Delete Product / Variant (Admin Only) */}
                              {role === 'admin' && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(item)}
                                  className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer shrink-0"
                                  title={`Delete "${item.variant_name ? `${item.name} (${item.variant_name})` : item.name}"`}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ADD / EDIT PRODUCTS VIEW */}
      {activeTab === 'products' && (
        <div className="animate-in fade-in duration-150">
          <AddEditProductView
            initialProductId={editProductId}
            onStockUpdated={loadData}
          />
        </div>
      )}

      {/* TAB 3: CATEGORIES MANAGEMENT VIEW */}
      {activeTab === 'categories' && (
        <div className="animate-in fade-in duration-150">
          <CategoryManagerView />
        </div>
      )}

      {/* TAB 4: ANALYTICS & REPORTS VIEW */}
      {activeTab === 'analytics' && (
        <div className="animate-in fade-in duration-150">
          <InventoryAnalyticsView />
        </div>
      )}

      {/* Modal: Vyapar Barcode Generator Workspace */}
      {showReceiveModal && (
        <CreateBarcodeModal
          isOpen={showReceiveModal}
          onClose={() => setShowReceiveModal(false)}
          products={distinctProducts}
          preselectedProductId={selectedForReceive?.productId}
          preselectedVariantId={selectedForReceive?.variantId}
          onSuccess={loadData}
        />
      )}

      {/* Modal: Print Barcode Labels */}
      {printModalItem && (
        <BarcodePrintModal
          isOpen={!!printModalItem}
          onClose={() => setPrintModalItem(null)}
          productName={printModalItem.name}
          variantName={printModalItem.variant_name}
          barcodeValue={printModalItem.barcode || ''}
          price={printModalItem.price}
          mrp={printModalItem.offer_price}
          defaultQuantity={Math.max(1, printModalItem.stock)}
        />
      )}

      {/* Modal: Adjust Stock */}
      {adjustModalItem && (
        <AdjustStockModal
          isOpen={!!adjustModalItem}
          onClose={() => setAdjustModalItem(null)}
          item={adjustModalItem}
          onSuccess={loadData}
        />
      )}

      {/* Drawer: Stock History */}
      {historyDrawerItem && (
        <StockHistoryDrawer
          isOpen={!!historyDrawerItem}
          onClose={() => setHistoryDrawerItem(null)}
          item={historyDrawerItem}
        />
      )}

      {/* Modal: Quick Edit Price */}
      {priceModalItem && (
        <QuickPriceModal
          isOpen={!!priceModalItem}
          item={priceModalItem}
          onClose={() => setPriceModalItem(null)}
          onSuccess={(updated) => {
            setItems((prev) =>
              prev.map((it) =>
                it.id === updated.id
                  ? {
                      ...it,
                      price: updated.price,
                      purchase_price: updated.cost_price ?? it.purchase_price,
                    }
                  : it
              )
            )
            void fetchProducts()
          }}
        />
      )}
    </div>
  )
}
