import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Tag, IndianRupee, AlertCircle, Barcode, Check } from 'lucide-react'
import { updateItemPrice } from '../../services/productService'
import type { InventoryStockItem } from '../../services/inventoryService'

interface Props {
  isOpen: boolean
  item: InventoryStockItem | null
  onClose: () => void
  onSuccess: (updated: { id: string; price: number; cost_price?: number }) => void
}

export const QuickPriceModal: React.FC<Props> = ({ isOpen, item, onClose, onSuccess }) => {
  const [sellingPrice, setSellingPrice] = useState<string>(item ? String(item.price ?? '') : '')
  const initialCost = item ? (item.cost_price !== undefined ? item.cost_price : item.purchase_price) : undefined
  const [costPrice, setCostPrice] = useState<string>(
    initialCost !== undefined ? String(initialCost) : ''
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Sync state when item changes
  useEffect(() => {
    if (item) {
      setSellingPrice(String(item.price ?? ''))
      const effCost = item.cost_price !== undefined ? item.cost_price : item.purchase_price
      setCostPrice(effCost !== undefined ? String(effCost) : '')
      setError('')
    }
  }, [item])

  // Close on Escape key & lock body scrolling when open
  useEffect(() => {
    if (!isOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen || !item) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const numPrice = Number(sellingPrice)
    if (isNaN(numPrice) || numPrice < 0) {
      setError('Please enter a valid selling price.')
      return
    }

    const numCost = costPrice.trim() !== '' ? Number(costPrice) : undefined
    if (numCost !== undefined && (isNaN(numCost) || numCost < 0)) {
      setError('Please enter a valid cost price.')
      return
    }

    try {
      setLoading(true)
      const entityId = item.entity_type === 'variant' ? (item.variant_id ?? item.id) : item.product_id

      await updateItemPrice({
        entityType: item.entity_type,
        id: entityId,
        newPrice: numPrice,
        newCostPrice: numCost,
      })

      onSuccess({
        id: item.id,
        price: numPrice,
        cost_price: numCost,
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update price')
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen h-[100dvh] z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4 overflow-hidden animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-none sm:rounded-2xl w-full max-w-md h-screen h-[100dvh] sm:h-auto sm:max-h-[92vh] shadow-2xl overflow-hidden border-0 sm:border border-[#E8D399]/50 animate-in fade-in zoom-in-95 flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-gray-100 flex items-center justify-between bg-[#FBFAF6] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-700">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#111111]">Quick Edit Price</h3>
              <p className="text-[11px] text-gray-500 font-medium">
                Barcode is linked — changing price updates live POS instantly
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Item Summary Box */}
        <div className="px-5 pt-4">
          <div className="p-3 bg-[#FBFAF6] border border-gray-200 rounded-xl space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-900 text-sm">{item.name}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                {item.entity_type}
              </span>
            </div>
            {item.variant_name && (
              <p className="text-gray-600 font-medium">Variant: <span className="font-bold text-gray-900">{item.variant_name}</span></p>
            )}
            {item.barcode && (
              <div className="flex items-center gap-1.5 text-gray-500 text-[11px] pt-1 border-t border-gray-200/60 font-mono">
                <Barcode className="w-3.5 h-3.5 text-gray-400" />
                <span>Barcode: <strong className="text-gray-800">{item.barcode}</strong></span>
              </div>
            )}
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[11px] font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block font-bold text-[#374151] mb-1.5">
              Selling Price (₹) *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 font-bold">
                <IndianRupee className="w-4 h-4" />
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                autoFocus
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="0.00"
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-black text-gray-900 focus:outline-none focus:border-[#0A0A0A] transition-colors"
              />
            </div>
            <p className="text-[10px] text-gray-400 font-medium mt-1">
              Reflected immediately in POS scanning &amp; digital invoice
            </p>
          </div>

          <div>
            <label className="block font-bold text-[#374151] mb-1.5">
              Cost Price (₹) <span className="text-gray-400 font-normal">(Optional)</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 font-bold">
                <IndianRupee className="w-4 h-4" />
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="0.00"
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:border-[#0A0A0A] transition-colors"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-xs font-bold rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="h-9 px-4 text-xs font-bold rounded-xl bg-[#0A0A0A] text-[#D4AF37] border border-[#D4AF37] hover:bg-[#1A1A1A] transition-all shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin inline-block" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>Update Price</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
