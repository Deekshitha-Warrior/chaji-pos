import { useEffect, useRef } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { useAlarmStore, type LowStockItem } from '../store/alarmStore'

export function useLowStockMonitor(enabled: boolean = true, role?: string | null) {
  const setLowStockItems = useAlarmStore((state) => state.setLowStockItems)
  const isCheckingRef = useRef(false)

  const checkStockLevels = async (force: boolean = false) => {
    if (!enabled || (isCheckingRef.current && !force)) return
    isCheckingRef.current = true

    try {
      // 1. Fetch non-variant active products (exclude Unregistered)
      const { data: prods, error: prodErr } = await supabase
        .from('products')
        .select('id, name, stock_quantity, low_stock_alert, barcode, has_variants, category, category_id')
        .eq('is_active', true)
        .eq('has_variants', false)

      if (prodErr) {
        console.warn('Low stock product check warning:', prodErr)
      }

      // 2. Fetch active variants
      const { data: variants, error: varErr } = await supabase
        .from('product_variants')
        .select('id, variant_name, stock, barcode, product_id, is_active, products(name, category, category_id, is_active)')
        .eq('is_active', true)

      if (varErr) {
        console.warn('Low stock variant check warning:', varErr)
      }

      const flagged: LowStockItem[] = []

      // Check standard products (Only alert for actual inventory running low: 0 < stock <= threshold)
      for (const p of prods || []) {
        if (
          (p.category && p.category.trim().toLowerCase() === 'unregistered') ||
          p.category_id === 4
        ) {
          continue
        }
        const threshold = Number(p.low_stock_alert) > 0 ? Number(p.low_stock_alert) : 5
        const currentStock = Number(p.stock_quantity) || 0

        // Only flag products that have active inventory running low (exclude 0 stock / empty inventory)
        if (currentStock > 0 && currentStock <= threshold) {
          flagged.push({
            id: `p-${p.id}`,
            name: p.name,
            stock: currentStock,
            alertThreshold: threshold,
            barcode: p.barcode,
            category: p.category,
          })
        }
      }

      // Check product variants (Only alert for actual variant inventory running low: 0 < stock <= threshold)
      for (const v of variants || []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parentProd = v.products as any
        if (parentProd && parentProd.is_active === false) {
          continue
        }
        if (
          (parentProd?.category && parentProd.category.trim().toLowerCase() === 'unregistered') ||
          parentProd?.category_id === 4
        ) {
          continue
        }

        const threshold = 5
        const currentStock = Number(v.stock) || 0

        if (currentStock > 0 && currentStock <= threshold) {
          flagged.push({
            id: `v-${v.id}`,
            name: parentProd?.name ? `${parentProd.name}` : 'Product Variant',
            variantName: v.variant_name,
            stock: currentStock,
            alertThreshold: threshold,
            barcode: v.barcode,
            category: parentProd?.category,
          })
        }
      }

      setLowStockItems(flagged)
    } catch (err) {
      console.warn('Stock monitor error:', err)
    } finally {
      isCheckingRef.current = false
    }
  }

  useEffect(() => {
    if (!enabled) return

    // Immediately unblock and run fresh stock check on login or role switch
    isCheckingRef.current = false
    void checkStockLevels(true)

    // 15-second interval continuous stock monitor
    const interval = setInterval(() => {
      void checkStockLevels()
    }, 15000)

    if (!isSupabaseConfigured) {
      return () => clearInterval(interval)
    }

    // Realtime channel to immediately trigger alarm on stock updates across both Admin and Staff panels
    const realtimeChannel = supabase
      .channel('low-stock-realtime-monitor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        void checkStockLevels(true)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variants' }, () => {
        void checkStockLevels(true)
      })
      .subscribe()

    return () => {
      clearInterval(interval)
      void supabase.removeChannel(realtimeChannel)
    }
  }, [enabled, role])

  // Re-check stock levels when enabled changes from false to true (e.g., on login)
  useEffect(() => {
    if (enabled && !isCheckingRef.current) {
      isCheckingRef.current = false
      void checkStockLevels(true)
    }
  }, [enabled])
}
