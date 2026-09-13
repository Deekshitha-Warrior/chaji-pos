import { useEffect, useMemo, useRef, useState, useCallback, type FormEvent } from 'react'
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Link, useNavigate } from 'react-router-dom'
import {
  Search, Trash2, Plus, Receipt, Printer,
  RefreshCw, ShoppingBag, MessageCircle,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Wifi, WifiOff, Layers, X, ChevronDown, Power,
  Edit2, AlertCircle, Check
} from 'lucide-react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { useProductStore, useVariantStore, useAdminAuthStore, type Product } from '../store/store'
import { useNavigationStore } from '../store/navigationStore'
import { barcodeService } from '../services/barcodeService'
import { Invoice } from '../components/Invoice'
import CatalogModal from '../components/CatalogModal'
import { invoicePdfFile } from '../lib/invoicePdf'
import { uploadInvoicePdf } from '../lib/storage'
import { createOrderWithStock } from '../services/orderService'
import { createAdvanceOrder, type AdvanceOrder, type AdvancePaymentMethod } from '../services/advanceOrderService'
import { printAdvanceReceipt } from '../lib/advanceReceipt'
import { printThermalReceipt } from '../lib/thermalPrint'
import {
  buildStructuredOrderItem,
  calculateLineTotal,
  formatCurrency,
  formatQuantityDisplay,
  formatInvoiceNo,
} from '../lib/retail'
import { buildProfessionalWhatsAppMessage, buildAdvanceDepositWhatsAppMessage, publicInvoiceUrl } from '../lib/whatsappMessage'
import { normalizePhone, toWhatsAppUrl } from '../lib/phone'
import { useLangStore } from '../store/langStore'
import { fetchVariantsByProduct, type ProductVariant } from '../services/variantService'
import { BarcodeScannerInput, type ScannedItemPayload } from '../components/pos/BarcodeScannerInput'
import { AddUnregisteredItemModal } from '../components/pos/AddUnregisteredItemModal'
import { getOrCreateUnregisteredProduct } from '../services/productService'

// ── Types ──────────────────────────────────────────────────────────────────
type PosItem = Product & {
  qty: number
  selectedUnit: string
  basePrice: number | string
  lineTotal: number
  source?: 'catalogue' | 'manual'
  note?: string | null
  variantId?: string         // product_variants.id
  variantName?: string       // snapshot
  parentProductId?: string   // products.id (before synthetic override)
}

type InvoiceSnap = {
  id: string
  invoiceNo: string
  orderType: 'online_request' | 'pos_sale' | 'manual_sale'
  date: string
  items: PosItem[]
  subtotal: number
  shipping: number
  couponCode?: string
  couponDiscount: number
  manualDiscountAmount: number
  manualDiscountType: 'flat' | 'percent'
  manualDiscountValue: number
  gstAmount: number
  total: number
  customerName: string
  phone: string
  address: string
  amountReceived: number
  balanceReturned: number
  paymentMode: string
  paymentMethod?: string
  invoicePdfUrl?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────
// Returns the product ID if it looks like a real DB identifier (UUID or numeric),
// or null for synthetic/manual IDs like "manual-<timestamp>".
const toProductId = (v: string | number): string | null => {
  const s = String(v ?? '').trim()
  if (!s) return null
  // Accept pure-numeric strings (BIGINT products.id)
  if (/^\d+$/.test(s)) return s
  // Accept UUID format (product_variants.id and UUID-keyed products)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) return s
  // Anything else (e.g. "manual-1786182383886") is a client-side synthetic ID — not a real DB row
  return null
}

const makePosItem = (p: Product, qty?: number): PosItem => {
  const basePrice = p.offerPrice || p.price
  const q = Math.max(1, Math.round(qty ?? 1))
  const packLabel = p.predefinedOptions[0]?.label ?? p.unitLabel
  const isUnregistered = p.category === 'Unregistered'
  return {
    ...p,
    qty: q,
    selectedUnit: packLabel,
    basePrice,
    lineTotal: calculateLineTotal(q, p.unitType, p.baseQuantity, basePrice),
    source: isUnregistered ? 'manual' : (p.barcode ? 'catalogue' : 'catalogue'),
    stock: isUnregistered ? 999999 : p.stock,
    stockQuantity: isUnregistered ? 999999 : p.stockQuantity,
  }
}

const recalc = (item: PosItem, nextQty: number): PosItem => {
  const q = Math.max(1, Math.round(nextQty))
  return { ...item, qty: q, lineTotal: calculateLineTotal(q, item.unitType, item.baseQuantity, item.basePrice) }
}


// ── Category colours ───────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
const CAT_COLOR: Record<string, string> = {
  'Bridal Shawl': '#7C3AED', 'Shawl': '#D97706', 'Dress': '#0D9488',
  'Saree': '#DC2626', 'Tops': '#92400E',
  'Bottoms': '#B45309', 'Accessories': '#1D4ED8',
}

// ══════════════════════════════════════════════════════════════════════════
type PosProps = {
  isEmbedded?: boolean
  externalScannedCode?: string | null
  onCodeProcessed?: () => void
}

export default function Pos(props: PosProps = {}) {
  const embeddedMode = Boolean(props.isEmbedded)
  const { products, fetchProducts } = useProductStore()
  const { getVariants, fetchVariants } = useVariantStore()
  const { lang } = useLangStore()
  const l = (en: string, ta: string) => lang === 'ta' ? ta : en
  const navigate = useNavigate()
  const { logout, role } = useAdminAuthStore()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [billingAdjOpen, setBillingAdjOpen] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [search, setSearch] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [activeCategory, setActiveCategory] = useState('All')
  const [items, setItems] = useState<PosItem[]>([])
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '' })
  const [remarks, setRemarks] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [billingDate, setBillingDate] = useState('') // '' = use current date/time
  const [paymentType, setPaymentType] = useState<'cash' | 'qr' | 'card'>('cash')
  const [saving, setSaving] = useState(false)
  const [shipping, setShipping] = useState<string>('0')
  const [couponInput, setCouponInput] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponError, setCouponError] = useState('')
  const [availableCoupons, setAvailableCoupons] = useState<{code: string}[]>([])
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; percentage: number; minOrderValue: number; discount?: number } | null>(null)
  const [manualDiscountType, setManualDiscountType] = useState<'flat' | 'percent'>('flat')
  const [manualDiscountValue, setManualDiscountValue] = useState('')
  const [error, setError] = useState('')
  const [invoice, setInvoice] = useState<InvoiceSnap | null>(null)
  const [cashReceived, setCashReceived] = useState<string>('')
  const [mobilePanelView, setMobilePanelView] = useState<'catalogue' | 'bill'>('catalogue')
  const [ordermode, setOrdermode] = useState<'online' | 'offline'>('offline')
  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null)
  const [availableVariants, setAvailableVariants] = useState<ProductVariant[]>([])
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null)
  const [variantPickerQty, setVariantPickerQty] = useState(1)
  const [billGstEnabled, setBillGstEnabled] = useState(false)
  const [gstInput, setGstInput] = useState('')
  const [gstType, setGstType] = useState<'percent' | 'flat'>('percent')
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [addUnregisteredOpen, setAddUnregisteredOpen] = useState(false)
  const [depositOpen, setDepositOpen] = useState(false)
  const [depositCreated, setDepositCreated] = useState<AdvanceOrder | null>(null)
  const [depositForm, setDepositForm] = useState({ amount: '', expectedDeliveryDate: '', paymentMethod: 'cash' as AdvancePaymentMethod, address: '', remarks: '', referenceNumber: '' })
  const [dbCategories, setDbCategories] = useState<string[]>([])
  const [priceEditModal, setPriceEditModal] = useState<{
    isOpen: boolean
    item: PosItem | null
    newPrice: string
    isSubmitting: boolean
    error: string
  }>({
    isOpen: false,
    item: null,
    newPrice: '',
    isSubmitting: false,
    error: '',
  })
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void fetchProducts()
    void fetchVariants()
    if (!isSupabaseConfigured) return

    supabase.from('coupons').select('code').eq('is_active', true).order('created_at', { ascending: false }).limit(20)
      .then(({ data, error }) => {
        if (error) console.error('Failed to fetch coupons', error)
        else if (data) setAvailableCoupons(data)
      })

    const productChannel = supabase.channel('pos-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => void fetchProducts())
      .subscribe()

    // Load active categories in sort_order
    supabase.from('categories').select('name_en').eq('is_active', true).order('sort_order')
      .then(({ data }) => {
        if (data) setDbCategories(data.map(c => c.name_en as string))
      })

    return () => { void supabase.removeChannel(productChannel) }
  }, [fetchProducts, fetchVariants])

  // ── Derived data ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const categories = useMemo(() => {
    // Use DB active categories in sort_order; fall back to product categories if DB returns nothing
    if (dbCategories.length > 0) return ['All', ...dbCategories]
    const cats = Array.from(new Set(products.filter(p => p.isActive).map(p => p.category))).filter(Boolean)
    return ['All', ...cats]
  }, [dbCategories, products])

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let src = products.filter(p => p.isActive)
    if (activeCategory !== 'All') src = src.filter(p => p.category === activeCategory)
    if (q) src = src.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.nameTa || '').toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    )
    return src.slice(0, 120)
  }, [products, search, activeCategory])

  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0)
  const isValidCoupon = appliedCoupon && subtotal >= (appliedCoupon.minOrderValue || 0)
  const couponDiscount = isValidCoupon
    ? ((appliedCoupon.percentage || 0) > 0
        ? Math.round((subtotal * (appliedCoupon.percentage || 0) / 100) * 100) / 100
        : (appliedCoupon.discount || 0))
    : 0
  const manualDiscountNumeric = Math.max(0, Number(manualDiscountValue) || 0)
  const manualDiscountAmount = manualDiscountType === 'percent'
    ? Math.max(0, Math.round((subtotal * manualDiscountNumeric / 100) * 100) / 100)
    : manualDiscountNumeric

  const discountedSubtotal = Math.max(0, subtotal - couponDiscount - manualDiscountAmount)

  const totalGst = billGstEnabled
    ? (gstType === 'percent'
      ? Math.max(0, Math.round((discountedSubtotal * (Math.max(0, Number(gstInput) || 0) / 100)) * 100) / 100)
      : Math.max(0, Number(gstInput) || 0))
    : 0
  const total = Math.max(0, discountedSubtotal + (Number(shipping || 0) || 0) + totalGst)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const itemQtyMap = useMemo(() => {
    const m: Record<string | number, number> = {}
    items.forEach(i => { m[i.id] = i.qty })
    return m
  }, [items])

  // ── Cart actions ──────────────────────────────────────────────────────
  const addItem = async (product: Product, specificVariant?: ProductVariant) => {
    setError('')
    setMobilePanelView('catalogue')

    if (specificVariant) {
      const variantProduct: Product = {
        ...product,
        id: specificVariant.id,
        name: `${product.name} - ${specificVariant.variantName}`,
        price: specificVariant.price,
        offerPrice: null,
        stock: specificVariant.stock,
        stockQuantity: specificVariant.stock,
        hasVariants: false,
        unitType: 'unit',
        baseQuantity: 1,
        unitLabel: specificVariant.sizeLabel || specificVariant.variantName || 'piece',
      }
      setItems(cur => {
        const ex = cur.find(i => (i.variantId === specificVariant.id || String(i.id) === String(specificVariant.id)))
        if (!ex) {
          const item = makePosItem(variantProduct, 1)
          item.variantId = specificVariant.id
          item.variantName = specificVariant.variantName
          item.parentProductId = String(product.id)
          return [item, ...cur]
        }
        return cur.map(i => (i.variantId === specificVariant.id || String(i.id) === String(specificVariant.id)) ? recalc(i, i.qty + 1) : i)
      })
      return
    }

    // If product has variants, check its variants from DB or store
    if (product.hasVariants) {
      try {
        let vars = getVariants(String(product.id))
        if (!vars || vars.length === 0) {
          vars = await fetchVariantsByProduct(String(product.id))
        }

        if (vars && vars.length > 1) {
          // Multiple variants: open variant picker
          setAvailableVariants(vars)
          setVariantPickerProduct(product)
          setSelectedVariant(vars[0])
          setVariantPickerQty(1)
          return
        } else if (vars && vars.length === 1) {
          // Only 1 variant: add it directly
          void addItem(product, vars[0])
          return
        }
      } catch (err) {
        console.warn('Failed to load variants for product:', err)
      }
    }

    // Standard non-variant product
    setItems(cur => {
      const ex = cur.find(i => String(i.id) === String(product.id))
      if (!ex) return [makePosItem(product), ...cur]
      return cur.map(i => String(i.id) === String(product.id) ? recalc(i, i.qty + 1) : i)
    })
  }

  const addVariantToItems = () => {
    if (!variantPickerProduct || !selectedVariant) return
    setError('')
    const variantProduct: Product = {
      ...variantPickerProduct,
      id: selectedVariant.id,
      name: `${variantPickerProduct.name} - ${selectedVariant.variantName}`,
      price: selectedVariant.price,
      offerPrice: null,
      stock: selectedVariant.stock,
      stockQuantity: selectedVariant.stock,
      hasVariants: false,
      unitType: 'unit',
      baseQuantity: 1,
      unitLabel: selectedVariant.sizeLabel || variantPickerProduct.unitLabel || 'piece',
    }
    const addQty = Math.max(1, variantPickerQty)
    setItems(cur => {
      const ex = cur.find(i => (i.variantId === selectedVariant.id || String(i.id) === String(selectedVariant.id)))
      if (!ex) {
        const item = makePosItem(variantProduct, addQty)
        item.variantId = selectedVariant.id
        item.variantName = selectedVariant.variantName
        item.parentProductId = String(variantPickerProduct.id)
        return [item, ...cur]
      }
      return cur.map(i => (i.variantId === selectedVariant.id || String(i.id) === String(selectedVariant.id)) ? recalc(i, i.qty + addQty) : i)
    })
    setVariantPickerProduct(null)
    setSelectedVariant(null)
    setVariantPickerQty(1)
    setAvailableVariants([])
    setMobilePanelView('catalogue')
  }

  // Barcode scanner item handler (Consecutive scan increments cart quantity)
  const handleScannedItem = (scanned: ScannedItemPayload) => {
    setError('')
    const targetId = scanned.variant_id ? scanned.variant_id : scanned.product_id

    setItems(cur => {
      const ex = cur.find(i => (scanned.variant_id ? i.variantId === scanned.variant_id : i.id === scanned.product_id))
      if (!ex) {
        const item = makePosItem({
          id: targetId,
          name: scanned.product_name,
          nameTa: scanned.name_ta || undefined,
          tamilName: scanned.name_ta || undefined,
          category: scanned.category || 'Apparel',
          remedy: [],
          price: scanned.price,
          offerPrice: scanned.offer_price || null,
          stock: scanned.stock,
          stockQuantity: scanned.stock,
          hasVariants: false,
          unitType: 'unit',
          unitLabel: scanned.variant_name || 'piece',
          baseQuantity: 1,
          stockUnit: 'piece',
          allowDecimalQuantity: false,
          predefinedOptions: [],
          isActive: true,
          sortOrder: 0,
          unit: '1pc',
          rating: 5,
          description: '',
          benefits: '',
          image: scanned.image_url || '/product-placeholder.svg',
          imageUrl: scanned.image_url || '/product-placeholder.svg',
          barcode: scanned.barcode,
        }, 1)
        item.variantId = scanned.variant_id || undefined
        item.variantName = scanned.variant_name || undefined
        item.parentProductId = String(scanned.product_id)
        return [...cur, item]
      }

      // Existing item: increment quantity by 1
      return cur.map(i => {
        if ((scanned.variant_id && i.variantId === scanned.variant_id) || (!scanned.variant_id && i.id === scanned.product_id)) {
          return recalc(i, i.qty + 1)
        }
        return i
      })
    })
  }

  const externalCodeFromStore = useNavigationStore((s) => s.externalScannedCode)
  const setExternalScannedCode = useNavigationStore((s) => s.setExternalScannedCode)

  const processIncomingCode = useCallback(async (codeToProcess: string) => {
    const clean = codeToProcess.trim()
    if (!clean) return
    try {
      const record = await barcodeService.lookupBarcode(clean)
      if (!record || !record.product) {
        setError(`Barcode "${clean}" not recognized in catalog`)
        return
      }
      const prod = record.product
      const varnt = record.variant
      const effectiveStock = varnt ? (Number(varnt.stock) || 0) : 999
      const price = varnt?.price ? Number(varnt.price) : Number(prod.price)

      const payload: ScannedItemPayload = {
        product_id: record.product_id,
        variant_id: record.variant_id || null,
        product_name: prod.name,
        name_ta: prod.name_ta,
        variant_name: varnt?.variant_name,
        price: price,
        offer_price: prod.offer_price ? Number(prod.offer_price) : undefined,
        stock: effectiveStock,
        barcode: clean,
        image_url: prod.image_url,
        category: prod.category,
      }
      handleScannedItem(payload)
    } catch (err) {
      console.error('Failed to process incoming barcode:', err)
      setError('Failed to scan barcode')
    }
  }, [])

  useEffect(() => {
    const code = props.externalScannedCode || externalCodeFromStore
    if (code) {
      void processIncomingCode(code)
      setExternalScannedCode(null)
      props.onCodeProcessed?.()
    }
  }, [props.externalScannedCode, externalCodeFromStore, processIncomingCode, setExternalScannedCode, props])



  const handleAddUnregisteredItem = async (input: {
    name: string
    price: number
    quantity: number
    note?: string
  }) => {
    try {
      const product = await getOrCreateUnregisteredProduct(input.name, input.price)
      const newItem: PosItem = {
        id: product.id,
        name: input.name,
        nameTa: undefined,
        tamilName: undefined,
        category: 'Unregistered',
        categoryId: '4',
        remedy: [],
        price: input.price,
        offerPrice: null,
        stock: 999999,
        stockQuantity: 999999,
        hasVariants: false,
        unitType: 'unit',
        unitLabel: 'piece',
        baseQuantity: 1,
        stockUnit: 'piece',
        allowDecimalQuantity: false,
        predefinedOptions: [],
        isActive: true,
        sortOrder: 999,
        unit: 'piece',
        rating: 5,
        description: '',
        benefits: '',
        image: '/product-placeholder.svg',
        imageUrl: '/product-placeholder.svg',
        qty: input.quantity,
        selectedUnit: 'piece',
        basePrice: input.price,
        lineTotal: calculateLineTotal(input.quantity, 'unit', 1, input.price),
        source: 'manual',
        note: input.note || null,
      }

      setItems((cur) => {
        const ex = cur.find((i) => i.id === product.id && (i.source === 'manual' || i.category === 'Unregistered'))
        if (!ex) return [newItem, ...cur]
        return cur.map((i) => {
          if (i.id === product.id && (i.source === 'manual' || i.category === 'Unregistered')) {
            const updatedQty = i.qty + input.quantity
            return {
              ...i,
              qty: updatedQty,
              basePrice: input.price,
              lineTotal: calculateLineTotal(updatedQty, 'unit', 1, input.price),
              note: input.note || i.note,
            }
          }
          return i
        })
      })
    } catch (err: unknown) {
      console.error('Failed to add unregistered item:', err)
      throw err
    }
  }

  const removeItem = (id: string | number) => setItems(cur => cur.filter(i => i.id !== id))

  const updateItem = (id: string | number, field: 'name' | 'basePrice' | 'qty', value: string | number) => {
    setItems(cur => cur.map((item) => {
      if (item.id !== id) return item
      let safeVal = value
      if (field === 'basePrice') {
        safeVal = Math.max(0, Number(value) || 0)
      } else if (field === 'qty') {
        safeVal = Math.max(1, Number(value) || 1)
      }
      const nextItem = { ...item, [field]: safeVal } as PosItem
      return field === 'basePrice' || field === 'qty' ? recalc(nextItem, nextItem.qty) : nextItem
    }))
  }

  const bumpQty = (id: string | number, delta: number) => {
    setItems(cur => {
      const ex = cur.find(i => i.id === id)
      if (!ex) return cur
      const next = ex.qty + delta
      if (next <= 0) return cur.filter(i => i.id !== id)
      return cur.map(i => i.id === id ? recalc(i, next) : i)
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setQty = (id: string | number, val: number) => {
    if (val <= 0) { removeItem(id); return }
    setItems(cur => cur.map(i => i.id === id ? recalc(i, val) : i))
  }

  const handleOpenPriceEdit = (item: PosItem) => {
    setPriceEditModal({
      isOpen: true,
      item,
      newPrice: String(item.basePrice ?? 0),
      isSubmitting: false,
      error: '',
    })
  }

  const handleClosePriceEdit = () => {
    setPriceEditModal({
      isOpen: false,
      item: null,
      newPrice: '',
      isSubmitting: false,
      error: '',
    })
  }

  const handleSavePrice = async (updateInventory: boolean) => {
    const { item, newPrice } = priceEditModal
    if (!item) return

    const parsedPrice = parseFloat(newPrice)
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setPriceEditModal(prev => ({ ...prev, error: 'Please enter a valid price (0 or greater).' }))
      return
    }

    if (updateInventory) {
      setPriceEditModal(prev => ({ ...prev, isSubmitting: true, error: '' }))
      try {
        if (!isSupabaseConfigured) {
          throw new Error('Database is not configured')
        }

        // 1. If item has a variant ID, update product_variants table
        if (item.variantId) {
          const { error: variantErr } = await supabase
            .from('product_variants')
            .update({ price: parsedPrice })
            .eq('id', item.variantId)
          if (variantErr) throw variantErr
        } else {
          // 2. Otherwise update standard products table
          const realDbId = toProductId(item.parentProductId || item.id)
          if (realDbId) {
            const { error: prodErr } = await supabase
              .from('products')
              .update({ price: parsedPrice })
              .eq('id', realDbId)
            if (prodErr) throw prodErr
          }
        }

        // Refresh product stores so catalog reflects new price
        void fetchProducts(true)
        void fetchVariants()
      } catch (err: unknown) {
        console.error('Failed to update price in inventory:', err)
        setPriceEditModal(prev => ({
          ...prev,
          isSubmitting: false,
          error: err instanceof Error ? err.message : 'Failed to update price in inventory'
        }))
        return
      }
    }

    // Update the item price in the active billing cart
    updateItem(item.id, 'basePrice', parsedPrice)
    handleClosePriceEdit()
  }

  const clearAll = () => {
    setItems([])
    setCustomer({ name: '', phone: '', address: '' })
    setInvoice(null)
    setCashReceived('')
    setCouponInput('')
    setAppliedCoupon(null)
    setCouponError('')
    setManualDiscountValue('')
    setManualDiscountType('flat')
    setError('')
    setShipping('0')
    setRemarks('')
    setReferenceNumber('')
    setBillingDate('')
    setBillGstEnabled(false)
    setGstInput('')
    setGstType('percent')
    setOrdermode('offline')
    setMobilePanelView('catalogue')
    searchRef.current?.focus()
  }

  const applyCoupon = async (overrideCode?: string) => {
    const code = (typeof overrideCode === 'string' ? overrideCode : couponInput).trim().toUpperCase()
    if (!code) { setCouponError('Enter a coupon code'); return }

    setCouponLoading(true)
    setCouponError('')
    setAppliedCoupon(null)

    try {
      if (!isSupabaseConfigured) {
        setCouponError('Coupon validation requires a live connection')
        return
      }

      const { data, error: dbErr } = await supabase
        .from('coupons')
        .select('*')
        .eq('is_active', true)
        .ilike('code', code)
        .single()

      if (dbErr || !data) {
        setCouponError('Invalid or expired coupon code')
        return
      }

      if (data.expiry_date && new Date(data.expiry_date) < new Date()) {
        setCouponError('This coupon has expired')
        return
      }

      if (data.usage_limit && data.usage_count >= data.usage_limit) {
        setCouponError('Coupon usage limit has been reached')
        return
      }

      if (data.min_order_value && subtotal < Number(data.min_order_value)) {
        setCouponError(`Minimum order of ${formatCurrency(Number(data.min_order_value))} required`)
        return
      }

      setAppliedCoupon({ code: String(data.code), percentage: Number(data.percentage), minOrderValue: Number(data.min_order_value || 0), discount: Number(data.discount || 0) })
    } catch {
      setCouponError('Failed to validate coupon. Try again.')
    } finally {
      setCouponLoading(false)
    }
  }

  const removeCoupon = () => {
    setAppliedCoupon(null)
    setCouponInput('')
    setCouponError('')
  }

  const getOrderType = (): 'pos_sale' | 'manual_sale' => (items.length > 0 && items.every((item) => item.source === 'manual') ? 'manual_sale' : 'pos_sale')

  const openDepositOrder = () => {
    if (!items.length) { setError('Add at least one product before creating a deposit order.'); return }
    if (!customer.name.trim()) { setError('Enter the customer name for the deposit order.'); return }
    if (!customer.phone.trim()) { setError('Enter the customer phone number for the deposit order.'); return }
    if (total <= 0) { setError('The order total must be greater than zero.'); return }
    const enteredAmount = Number(cashReceived) || 0
    const suggestedDeposit = enteredAmount > 0 && enteredAmount < total ? String(enteredAmount) : ''
    setDepositForm({ amount: suggestedDeposit, expectedDeliveryDate: '', paymentMethod: 'cash', address: customer.address || '', remarks: '', referenceNumber: '' })
    setError('')
    setDepositOpen(true)
  }

  const saveDepositOrder = async (event: FormEvent) => {
    event.preventDefault()
    const depositAmount = Number(depositForm.amount)
    if (!Number.isFinite(depositAmount) || depositAmount <= 0 || depositAmount >= total) { setError(`Deposit must be greater than ${formatCurrency(0)} and less than ${formatCurrency(total)}.`); return }
    if (!depositForm.expectedDeliveryDate) { setError('Select the expected delivery date.'); return }
    setSaving(true); setError('')
    try {
      const allocationBase = items.reduce((sum, item) => sum + item.lineTotal, 0)
      let allocated = 0
      const productsSnapshot = items.map((item, index) => {
        const lineTotal = index === items.length - 1
          ? Math.max(0, Math.round((total - allocated) * 100) / 100)
          : Math.max(0, Math.round((allocationBase > 0 ? total * item.lineTotal / allocationBase : total / items.length) * 100) / 100)
        allocated += lineTotal
        return {
          product_id: item.parentProductId || toProductId(item.id), variant_id: item.variantId || null,
          variant_name: item.variantName || null, name: item.name, category: item.category,
          description: item.note || '', quantity: item.qty, unit: item.selectedUnit, unit_type: item.unitType,
          base_quantity: item.baseQuantity, base_price: Number(item.basePrice) || 0, line_total: lineTotal,
          source: 'advance_order', note: item.note || null,
        }
      })
      const created = await createAdvanceOrder({
        customerName: customer.name.trim(), phone: customer.phone.trim(), address: depositForm.address.trim(),
        productName: items.map(item => `${item.qty}× ${item.name}`).join(', '),
        category: Array.from(new Set(items.map(item => item.category).filter(Boolean))).join(', '),
        description: items.map(item => `${item.qty}× ${item.name}${item.note ? ` — ${item.note}` : ''}`).join('\n'),
        totalAmount: total, depositAmount, expectedDeliveryDate: depositForm.expectedDeliveryDate,
        remarks: depositForm.remarks, referenceNumber: depositForm.referenceNumber, paymentMethod: depositForm.paymentMethod, createdByName: role || 'Staff',
        products: productsSnapshot,
      })
      setDepositCreated(created)
      setDepositOpen(false)
      clearAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create deposit order')
    } finally {
      setSaving(false)
    }
  }

  // ── Generate bill ─────────────────────────────────────────────────────
  const generateBill = async () => {
    if (!items.length) { setError('Add at least one product.'); return }
    // Validate required phone
    const normalizedPhone = normalizePhone(customer.phone || '')
    if (!normalizedPhone) { setError('Please enter a valid Indian mobile number (e.g. 9876543210 or +91 9876543210)'); return }
    // Validate payment amount (only required for cash)
    if (paymentType === 'cash' && !cashReceived.trim()) { setError('Enter the amount received from customer'); return }
    if (paymentType === 'cash' && cashReceivedNum < total) { setError(`Insufficient payment. Customer still owes ${formatCurrency(total - cashReceivedNum)}`); return }
    // Validate online mode availability
    if (ordermode === 'online' && !isSupabaseConfigured) { setError('Cannot place online orders while offline'); return }
    setSaving(true); setError('')
    try {
      const paymentMode = ordermode === 'online' ? 'online' : paymentType
      const created = await createOrderWithStock({
        customerName: customer.name.trim() || 'Walk-in Customer',
        phone: normalizedPhone,
        address: customer.address.trim() || 'POS Counter',
        items: items.map(item => buildStructuredOrderItem({
          productId:    item.parentProductId ? item.parentProductId : toProductId(item.id),
          variantId:    item.variantId   ?? null,
          variantName:  item.variantName ?? null,
          name: item.name,
          tamilName: item.tamilName || item.nameTa || null,
          quantity: item.qty,
          unit: item.selectedUnit,
          unitType: item.unitType,
          baseQuantity: item.baseQuantity,
          basePrice: Number(item.basePrice) || 0,
          imageUrl: item.imageUrl || item.image || null,
          source: item.source || 'catalogue',
          isManual: item.source === 'manual' || item.category === 'Unregistered',
          category: item.category || null,
          note: item.note || null,
        })),
        shipping: Number(shipping || 0),
        status: 'completed',
        orderMode: ordermode,
        orderType: getOrderType(),
        deliveryCharge: Number(shipping || 0),
        discountAmount: couponDiscount,
        manualDiscountAmount,
        manualDiscountType,
        manualDiscountValue: manualDiscountNumeric,
        couponCode: appliedCoupon?.code,
        couponPercentage: appliedCoupon?.percentage,
        totalGst,
        gstEnabled: billGstEnabled,
        paymentMethod: paymentMode
      })

      // ── CRITICAL: immediately fix totals in DB, independent of PDF upload ──
      // The RPC may store an incorrect total if items JSONB parsing differs.
      // This guarantees the correct client-computed values are always saved.
      // Determine the effective billing date/time
      const effectiveBillingDate = billingDate.trim()
        ? new Date(billingDate).toISOString()
        : new Date().toISOString()
      await supabase.from('orders').update({
        subtotal,
        total,
        total_gst: totalGst,
        gst_amount: totalGst,
        payment_mode: paymentMode,
        payment_method: paymentMode,
        discount_amount: couponDiscount,
        manual_discount_amount: manualDiscountAmount,
        delivery_charge: Number(shipping || 0),
        remarks: remarks.trim(),
        reference_number: referenceNumber.trim(),
        billing_date: effectiveBillingDate,
      }).eq('id', created.orderId)
      const createdInvoice: InvoiceSnap = {
        id: created.orderId,
        invoiceNo: created.invoiceNo,
        orderType: getOrderType(),
        date: billingDate.trim() ? new Date(billingDate).toISOString() : created.createdAt,
        items: [...items],
        subtotal,
        shipping: Number(shipping || 0),
        couponCode: appliedCoupon?.code,
        couponDiscount,
        manualDiscountAmount,
        manualDiscountType,
        manualDiscountValue: manualDiscountNumeric,
        gstAmount: totalGst,
        total,
        customerName: customer.name.trim() || 'Walk-in Customer',
        phone: normalizedPhone,
        address: customer.address.trim() || 'POS Counter',
        amountReceived: cashReceivedNum,
        balanceReturned: balanceToReturn,
        paymentMode: ordermode === 'online' ? 'Online' : paymentType === 'qr' ? 'QR' : paymentType === 'card' ? 'Card' : 'Cash',
        paymentMethod: paymentMode,
      }
      setInvoice(createdInvoice)
      void persistInvoicePdf(createdInvoice)
      setItems([])
      setCustomer({ name: '', phone: '', address: '' })
      void fetchProducts()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate bill')
    } finally {
      setSaving(false)
    }
  }

  const cashReceivedNum = Number(cashReceived) || 0
  const balanceToReturn = cashReceivedNum > 0 && cashReceivedNum >= total ? cashReceivedNum - total : 0
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isInsufficientPayment = cashReceived !== '' && cashReceivedNum > 0 && cashReceivedNum < total
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const change = cashReceived && Number(cashReceived) >= total
    ? Number(cashReceived) - total : null

  const sendPosWhatsApp = (inv: InvoiceSnap) => {
    const invoiceUrl = publicInvoiceUrl(inv.invoiceNo)
    const message = buildProfessionalWhatsAppMessage({
      customerName: inv.customerName,
      phone: inv.phone,
      invoiceNumber: inv.invoiceNo,
      invoiceUrl,
      paymentMode: inv.paymentMode || 'POS',
      items: inv.items.map((item) => ({
        name: item.name,
        qty: item.qty,
        unit: item.selectedUnit,
        unitType: item.unitType,
        rate: Number(item.basePrice) || 0,
        lineTotal: item.lineTotal,
      })),
      subtotal: inv.subtotal,
      couponDiscount: inv.couponDiscount,
      manualDiscountAmount: inv.manualDiscountAmount,
      shipping: inv.shipping,
      gstAmount: inv.gstAmount,
      total: inv.total,
    })
    window.open(toWhatsAppUrl(inv.phone || customer.phone || '', message), '_blank', 'noopener,noreferrer')
  }

  const persistInvoicePdf = async (inv: InvoiceSnap) => {
    try {
      const file = invoicePdfFile({
        invoiceNo: inv.invoiceNo,
        date: inv.date,
        customerName: inv.customerName,
        phone: inv.phone,
        address: inv.address,
        items: inv.items.map(item => ({ name: item.name, qty: item.qty, unit: item.selectedUnit, price: Number(item.basePrice) || 0, line_total: item.lineTotal })),
        subtotal: inv.subtotal,
        shipping: inv.shipping,
        discountAmount: inv.couponDiscount,
        manualDiscountAmount: inv.manualDiscountAmount,
        gstAmount: inv.gstAmount,
        couponCode: inv.couponCode,
        paymentMode: inv.paymentMode,
        total: inv.total,
      })
      // Upload PDF and save its URL — total fields already saved immediately after RPC
      const url = await uploadInvoicePdf(file, inv.invoiceNo)
      await supabase.from('orders').update({ invoice_pdf_url: url }).eq('id', inv.id)
      setInvoice(current => current?.id === inv.id ? { ...current, invoicePdfUrl: url } : current)
    } catch (err) {
      console.warn('Invoice PDF could not be stored:', err)
    }
  }

  const printReceipt = (inv: InvoiceSnap) => {
    // Print a Bluetooth/thermal receipt directly
    printThermalReceipt({
      invoiceNo: inv.invoiceNo,
      date: inv.date,
      customerName: inv.customerName,
      phone: inv.phone,
      items: inv.items.map(item => ({ name: item.name, qty: item.qty, unit: item.selectedUnit, price: Number(item.basePrice) || 0, line_total: item.lineTotal })),
      subtotal: inv.subtotal,
      shipping: inv.shipping,
      couponDiscount: inv.couponDiscount,
      manualDiscount: inv.manualDiscountAmount,
      totalGst: inv.gstAmount,
      total: inv.total,
    })
  }

  // ══ INVOICE SCREEN ════════════════════════════════════════════════════
  if (invoice) {
    const invoiceItems = invoice.items.map(item => ({
      id: String(item.id),
      name: item.name,
      nameTa: item.nameTa,
      qty: item.qty,
      quantity: item.qty,
      unit: item.selectedUnit,
      unit_type: item.unitType,
      base_quantity: item.baseQuantity,
      base_price: Number(item.basePrice) || 0,
      line_total: item.lineTotal,
      price: item.price,
      offerPrice: item.offerPrice ?? undefined,
    }))

    return (
      <div className="mobile-page-shell print:bg-white print:min-h-0">
        {/* Screen UI */}
        <div className="max-w-2xl mx-auto px-4 py-6 print:hidden space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-textMain">{l('Bill Generated Successfully', 'பில் உருவாக்கப்பட்டது')}</h1>
              <p className="text-xs text-textMuted mt-0.5">Transaction recorded and inventory updated</p>
            </div>
            <button onClick={clearAll}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111111] hover:bg-[#3d4f3a] text-white font-bold text-sm shadow-sm cursor-pointer">
              <Plus size={15} /> New Sale
            </button>
          </div>

          {/* Bill Details Section */}
          <div className="rounded-2xl border border-[#E8D399] bg-[#FBFAF6] p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Bill Number:</span>
                <span className="px-2.5 py-0.5 rounded-lg bg-[#0A0A0A] text-[#D4AF37] font-black text-xs font-mono">
                  #{formatInvoiceNo(invoice.invoiceNo)}
                </span>
              </div>
              <div className="text-xs font-semibold text-gray-600">
                {new Date(invoice.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2.5 text-xs">
              <div>
                <span className="text-[10px] text-gray-400 font-bold uppercase block">Customer</span>
                <span className="font-bold text-gray-900 truncate block">{invoice.customerName || 'Walk-in Customer'}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-bold uppercase block">Payment Mode</span>
                <span className="font-bold text-gray-900 uppercase block">{invoice.paymentMode || 'POS'}</span>
              </div>
              {invoice.phone && (
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase block">Phone</span>
                  <span className="font-semibold text-gray-700 block">{invoice.phone}</span>
                </div>
              )}
            </div>
          </div>

          {/* Payment receipt */}
          <div className="surface-panel p-5 rounded-xl border border-gray-100 bg-white shadow-sm mb-4">
            <p className="text-xs font-black uppercase tracking-widest text-textMuted mb-3">{l('Financial Summary', 'நிதி சுருக்கம்')}</p>
            <div className="space-y-2.5">
              <div className="flex justify-between items-center pb-2.5 border-b border-gray-100">
                <p className="text-sm font-bold text-textMuted">{l('Grand Total', 'மொத்த தொகை')}</p>
                <p className="text-2xl font-black text-textMain tabular-nums">{formatCurrency(invoice.total)}</p>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-sm font-bold text-textMuted">{l('Amount Received', 'பெற்ற தொகை')}</p>
                <p className="text-xl font-black text-textMain tabular-nums">{formatCurrency(invoice.amountReceived)}</p>
              </div>
              {invoice.balanceReturned > 0 ? (
                <div className="flex justify-between items-center rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
                  <p className="text-sm font-black text-blue-700">{l('Balance Returned', 'திரும்பிய பணம்')}</p>
                  <p className="text-2xl font-black text-blue-700 tabular-nums">{formatCurrency(invoice.balanceReturned)}</p>
                </div>
              ) : (
                <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-center">
                  <p className="text-sm font-black text-green-700">✅ {l('Exact Amount Received', 'சரியான தொகை')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-3 gap-3">
            <button onClick={() => printReceipt(invoice)}
              className="flex flex-col md:flex-row items-center justify-center gap-2 py-3 px-2 rounded-xl border-2 border-gray-200 hover:border-[#111111] text-textMain font-bold text-[12px] md:text-sm transition-colors text-center leading-tight">
              <Printer size={16} className="shrink-0" /> {l('Print Receipt', 'ரசீது அச்சிடு')}
            </button>
            <button onClick={() => sendPosWhatsApp(invoice)}
              className="flex flex-col md:flex-row items-center justify-center gap-2 py-3 px-2 rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold text-[12px] md:text-sm transition-colors text-center leading-tight">
              <MessageCircle size={16} className="shrink-0" /> WhatsApp Invoice
            </button>
            <button onClick={clearAll}
              className="flex flex-col md:flex-row items-center justify-center gap-2 py-3 px-2 rounded-xl bg-[#111111] hover:bg-[#3d4f3a] text-white font-bold text-[12px] md:text-sm transition-colors text-center leading-tight">
              <RefreshCw size={16} className="shrink-0" /> New Sale
            </button>
          </div>

          {/* Items summary */}
          <div className="surface-panel p-4 rounded-xl border border-gray-100 bg-white shadow-sm mt-4">
            <p className="text-xs font-bold text-textMuted uppercase tracking-wide mb-3">{l('Items Sold', 'விற்ற பொருட்கள்')}</p>
            <div className="space-y-1.5">
              {invoice.items.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-textMain">{item.name} × {formatQuantityDisplay(item.qty, item.selectedUnit, item.unitType)}</span>
                  <span className="font-bold">{formatCurrency(item.lineTotal)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Print view — full A4 invoice */}
        <div className="hidden print:block">
          <Invoice
            invoiceNo={invoice.invoiceNo}
            date={invoice.date}
            customerName={invoice.customerName}
            phone={invoice.phone}
            address={invoice.address}
            items={invoiceItems}
            subtotal={invoice.subtotal}
            shipping={invoice.shipping}
            total={invoice.total}
            status="Completed"
            discountAmount={invoice.couponDiscount || 0}
            manualDiscountAmount={invoice.manualDiscountAmount || 0}
            gstAmount={invoice.gstAmount || 0}
            couponCode={invoice.couponCode}
          />
        </div>
      </div>
    )
  }

  // ══ MAIN POS SCREEN ══════════════════════════════════════════════════
  return (
    <div data-embedded={embeddedMode} data-panel={mobilePanelView} className="flex flex-col h-full bg-[#FAFAFA] print:hidden overflow-y-auto overflow-x-hidden hide-scrollbar">
      {/* Header */}
      <div className="px-3 pt-3 pb-2.5 sm:px-4 sm:pt-4 md:px-6 md:pt-6 md:pb-4 shrink-0 flex flex-col gap-3 min-[480px]:flex-row min-[480px]:items-start min-[480px]:justify-between">
        <div className="min-w-0">
          <h2 className="text-[18px] sm:text-[22px] md:text-[24px] font-black text-[#0A0A0A] flex items-center gap-2 leading-tight">
            <div className="w-1.5 h-5 sm:h-6 bg-[#D4AF37] rounded-full shrink-0"></div>
            POS Billing Panel
          </h2>
          <p className="text-[11px] sm:text-[12px] text-gray-500 font-medium ml-3.5 mt-0.5 pr-2">Quick Invoice generator & database synced checkout</p>
        </div>

        {/* Online/Offline Toggle & Logout */}
        <div className="flex gap-2 w-full min-[480px]:w-auto">
          <div className="grid grid-cols-2 bg-white rounded-xl border border-gray-200 p-1 shadow-sm flex-1 min-[480px]:flex-none">
            <button
              onClick={() => setOrdermode('offline')}
              className={`min-h-[38px] sm:min-h-[42px] px-3 sm:px-4 py-1.5 rounded-lg text-[11px] font-black tracking-wider uppercase transition-colors ${ordermode === 'offline' ? 'bg-[#0A0A0A] text-[#D4AF37] shadow-sm' : 'text-[#374151] hover:bg-[#F9FAFB]'}`}
            >
              Offline
            </button>
            <button
              onClick={() => setOrdermode('online')}
              className={`min-h-[38px] sm:min-h-[42px] px-3 sm:px-4 py-1.5 rounded-lg text-[11px] font-black tracking-wider uppercase transition-colors ${ordermode === 'online' ? 'bg-[#0A0A0A] text-[#D4AF37] shadow-sm' : 'text-[#374151] hover:bg-[#F9FAFB]'}`}
            >
              Online
            </button>
          </div>
          {!embeddedMode && (
            <>
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center justify-center min-h-[38px] sm:min-h-[42px] px-3 sm:px-4 rounded-xl bg-[#111111] text-white hover:bg-[#3d4f3a] transition-colors text-[11px] font-black tracking-wider uppercase"
              >
                Dashboard
              </button>
              <button
                onClick={() => { logout(); navigate('/admin-login', { replace: true }) }}
                title="Logout"
                className="flex items-center justify-center min-h-[38px] sm:min-h-[42px] px-3 rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
              >
                <Power size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Split */}
      <div className="flex flex-col lg:flex-row gap-4 sm:gap-5 md:gap-6 px-3 sm:px-4 md:px-6 pb-6 lg:h-[calc(100vh-120px)] lg:overflow-hidden">

        {/* LEFT COLUMN (approx 68%) */}
        <div className="flex-[2.1] flex flex-col gap-4 sm:gap-6 min-w-0 max-w-full lg:overflow-y-auto lg:pb-4 hide-scrollbar">

          {/* Customer Details Card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3.5 sm:p-4 md:p-5 shrink-0 min-w-0 max-w-full">
            <h3 className="text-[14px] sm:text-[15px] font-black text-[#111111] flex items-center gap-2 mb-3 sm:mb-4">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#D4AF37]"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              Customer Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 min-w-0">
              <div className="min-w-0">
                <label className="block text-[11px] md:text-[10px] font-bold text-[#374151] mb-1">Customer Name</label>
                <input
                  type="text"
                  value={customer.name}
                  onChange={e => setCustomer({...customer, name: e.target.value})}
                  placeholder="Enter name"
                  className="w-full min-w-0 max-w-full box-border h-10 sm:h-11 px-3 sm:px-4 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#D4AF37] text-[13px] font-bold text-[#111111] placeholder:text-gray-400 placeholder:font-medium"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-[11px] md:text-[10px] font-bold text-[#374151] mb-1">Mobile Number (WhatsApp)</label>
                <input
                  type="text"
                  value={customer.phone}
                  onChange={e => setCustomer({...customer, phone: e.target.value})}
                  placeholder="Enter WhatsApp number"
                  className="w-full min-w-0 max-w-full box-border h-10 sm:h-11 px-3 sm:px-4 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#D4AF37] text-[13px] font-bold text-[#111111] placeholder:text-gray-400 placeholder:font-medium"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-[11px] md:text-[10px] font-bold text-[#374151] mb-1">Remarks (Internal)</label>
                <input
                  type="text"
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  placeholder="Optional remarks"
                  className="w-full min-w-0 max-w-full box-border h-10 sm:h-11 px-3 sm:px-4 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#D4AF37] text-[13px] font-bold text-[#111111] placeholder:text-gray-400 placeholder:font-medium"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-[11px] md:text-[10px] font-bold text-[#374151] mb-1">Reference Number</label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={e => setReferenceNumber(e.target.value)}
                  placeholder="Optional ref no."
                  className="w-full min-w-0 max-w-full box-border h-10 sm:h-11 px-3 sm:px-4 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#D4AF37] text-[13px] font-bold text-[#111111] placeholder:text-gray-400 placeholder:font-medium"
                />
              </div>
              <div className="min-w-0 md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] md:text-[10px] font-bold text-[#374151]">Billing Date (Optional)</label>
                  {billingDate && (
                    <button
                      type="button"
                      onClick={() => setBillingDate('')}
                      className="text-[10px] font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded transition-colors"
                    >
                      Reset to Now
                    </button>
                  )}
                </div>
                <input
                  id="pos-billing-date"
                  type="datetime-local"
                  value={billingDate}
                  onChange={e => setBillingDate(e.target.value)}
                  className="block w-full min-w-0 max-w-full box-border h-10 sm:h-11 px-3 sm:px-4 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#D4AF37] text-[13px] font-bold text-[#111111]"
                  style={{ maxWidth: '100%', boxSizing: 'border-box' }}
                />
                <p className="mt-1 text-[10px] text-gray-400 font-medium">Leave blank to use today's date &amp; time</p>
              </div>
            </div>
          </div>

          {/* Order Items Card */}
          <div className="bg-white rounded-2xl border border-[#E8D399] shadow-sm flex-1 flex flex-col min-h-[400px]">
            {/* Card Header & Barcode Scanner */}
            <div className="flex flex-col gap-3 p-4 md:p-5 border-b border-[#E8D399]">
              <div className="flex items-center justify-between">
                <h3 className="text-[18px] md:text-[14px] font-black text-[#0A0A0A] flex items-center gap-2">
                  <Receipt size={16} className="text-[#D4AF37]" />
                  Order Items ({items.length})
                </h3>
              </div>

              {/* Barcode Scanner Bar */}
              <div className="w-full">
                <BarcodeScannerInput onItemScanned={handleScannedItem} />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {/* Clear Order Button */}
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={items.length === 0}
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 sm:px-3 text-[11px] font-bold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition-colors shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-gray-500" />
                  <span>Clear Order</span>
                </button>

                {/* Button 1: Search Catalog */}
                <button
                  type="button"
                  onClick={() => setCatalogOpen(true)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 sm:px-3.5 text-[11px] font-bold rounded-lg bg-[#0A0A0A] text-[#D4AF37] hover:bg-[#1A1A1A] border border-[#D4AF37] shadow-xs transition-all shrink-0 cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span className="tracking-wide">Search Catalog</span>
                </button>

                {/* Button 2: Add Item (Ad-Hoc Unregistered) */}
                <button
                  type="button"
                  onClick={() => setAddUnregisteredOpen(true)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 sm:px-3.5 text-[11px] font-bold rounded-lg bg-amber-600 text-white hover:bg-amber-700 shadow-xs transition-all shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="tracking-wide">Add Item</span>
                </button>
              </div>
            </div>

            {/* Table Header */}
            <div className="hidden md:grid grid-cols-[1fr_100px_120px_40px] gap-3 px-5 py-3 border-b border-gray-200 bg-[#FAFAFA]">
              <span className="text-[10px] font-bold text-[#374151] tracking-wide">Item Name / Description</span>
              <span className="text-[10px] font-bold text-[#374151] tracking-wide text-right">Price (₹)</span>
              <span className="text-[10px] font-bold text-[#374151] tracking-wide text-center">Qty</span>
              <span></span>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 md:space-y-2">
              {items.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-[#374151]/60">
                  <ShoppingBag size={40} className="mb-3 opacity-20" />
                  <p className="text-[13px] font-bold">No items added yet</p>
                </div>
              )}

              {items.map(item => (
                <div key={item.id}>
                  <div className="md:hidden bg-white border border-gray-200/90 rounded-2xl p-3.5 shadow-sm hover:border-[#D4AF37]/50 transition-all space-y-3">
                    {/* Header Row: Product Name + Trash Delete */}
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0 flex-1">
                        {item.source === 'manual' ? (
                          <input
                            type="text"
                            value={item.name}
                            onChange={e => updateItem(item.id, 'name', e.target.value)}
                            placeholder="Enter item name..."
                            className="w-full px-3 py-1.5 bg-[#FAFAFA] border border-gray-200 rounded-xl text-[14px] font-bold text-[#111111] focus:outline-none focus:border-[#D4AF37]"
                          />
                        ) : (
                          <div>
                            <h4 className="text-[14px] font-bold text-[#111111] leading-snug break-words">
                              {item.name}
                            </h4>
                            {item.variantName && (
                              <span className="inline-block mt-0.5 text-[10.5px] font-semibold text-[#B48811] bg-[#FBFAF6] border border-[#E8D399]/60 px-1.5 py-0.5 rounded">
                                {item.variantName}
                              </span>
                            )}
                          </div>
                        )}
                        {/* Clickable Unit Price Pill Badge */}
                        <div className="mt-1.5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenPriceEdit(item)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FBF9F4] hover:bg-[#F5EEDB] border border-[#E8D399]/70 hover:border-[#D4AF37] text-[12px] text-[#374151] transition-all cursor-pointer active:scale-95"
                            title="Tap to change unit price"
                          >
                            <span className="text-gray-500 font-medium">Rate:</span>
                            <span className="font-bold text-[#111111]">
                              ₹{Number(item.basePrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                            </span>
                            <Edit2 size={11} className="text-[#B48811]" />
                          </button>
                        </div>
                      </div>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200/80 text-gray-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors shrink-0 active:scale-95"
                        aria-label={`Delete ${item.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* Bottom Row: Quantity Stepper & Line Total */}
                    <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-gray-100">
                      {/* Quantity Stepper */}
                      <div className="inline-flex items-center bg-[#F9FAFB] border border-gray-200 rounded-xl p-1">
                        <button
                          type="button"
                          onClick={() => bumpQty(item.id, -1)}
                          className="w-8 h-8 rounded-lg bg-white border border-gray-200/80 hover:bg-gray-100 text-gray-700 font-bold flex items-center justify-center text-[18px] shadow-sm active:scale-90 transition-all cursor-pointer"
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <span className="w-10 text-center text-[15px] font-black text-[#111111]">
                          {item.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => bumpQty(item.id, 1)}
                          className="w-8 h-8 rounded-lg bg-white border border-gray-200/80 hover:bg-gray-100 text-gray-700 font-bold flex items-center justify-center text-[18px] shadow-sm active:scale-90 transition-all cursor-pointer"
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>

                      {/* Line Total */}
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total</span>
                        <span className="text-[17px] font-black text-[#0A0A0A] leading-tight block">
                          {formatCurrency(item.lineTotal)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="hidden md:grid grid-cols-[1fr_100px_120px_40px] items-center gap-3 p-2 bg-white border border-gray-200 rounded-xl hover:border-[#D4AF37]/50 transition-colors">
                    {/* Item Name */}
                    <div className="min-w-0 flex items-center gap-2">
                      {item.source === 'manual' ? (
                        <input
                          type="text"
                          value={item.name}
                          onChange={e => updateItem(item.id, 'name', e.target.value)}
                          placeholder="Item name"
                          className="w-full px-3 py-2 bg-[#FAFAFA] border border-gray-200 rounded-lg text-[13px] font-bold text-[#111111] focus:outline-none focus:border-[#D4AF37]"
                        />
                      ) : (
                        <div className="px-3 py-2 w-full truncate border border-transparent flex items-center gap-2">
                          <span className="text-[13px] font-bold text-[#111111] truncate">{item.name} {item.variantName ? `- ${item.variantName}` : ''}</span>
                        </div>
                      )}
                      {item.source !== 'manual' && (
                        <span className="hidden sm:inline-flex px-2 py-0.5 rounded border border-[#D4AF37]/30 text-[#B48811] text-[9px] font-black tracking-wider uppercase shrink-0 bg-[#D4AF37]/10">
                          CATALOG
                        </span>
                      )}
                    </div>

                    {/* Price */}
                    <div className="flex items-center justify-end px-2 py-1 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenPriceEdit(item)}
                        className="group flex items-center justify-end gap-1.5 px-2.5 py-1.5 rounded-lg border border-transparent hover:border-[#D4AF37]/50 hover:bg-[#D4AF37]/10 transition-all text-right cursor-pointer"
                        title="Click to edit price"
                      >
                        <span className="text-[13px] font-black text-[#111111] group-hover:text-[#B48811] tracking-tight">
                          ₹{Number(item.basePrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </span>
                        <Edit2 size={12} className="text-gray-400 group-hover:text-[#B48811] transition-colors shrink-0" />
                      </button>
                    </div>

                    {/* Quantity Controls */}
                    <div className="flex items-center justify-between border border-gray-200 rounded-lg px-2 py-1 bg-white">
                      <button
                        onClick={() => bumpQty(item.id, -1)}
                        className="w-6 h-6 rounded-md hover:bg-[#FAFAFA] flex items-center justify-center text-[#374151] font-bold"
                      >-</button>
                      <span className="text-[13px] font-black text-[#111111] min-w-[20px] text-center">{item.qty}</span>
                      <button
                        onClick={() => bumpQty(item.id, 1)}
                        className="w-6 h-6 rounded-md hover:bg-[#FAFAFA] flex items-center justify-center text-[#374151] font-bold"
                      >+</button>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => removeItem(item.id)}
                      className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-[#374151] hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (approx 32%) */}
        <div className="flex-[1] flex min-h-0 flex-col gap-6 sticky top-4 h-[calc(100vh-140px)] max-h-[calc(100vh-140px)]">
          <div className="flex min-h-0 h-full max-h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-[#FBFAF6] shadow-sm">

            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-white shrink-0">
              <h3 className="text-[18px] md:text-[14px] font-black text-[#111111] flex items-center gap-2">
                <Receipt size={16} className="text-[#D4AF37]" />
                Current Order
              </h3>
              <span className={`px-2 py-1 rounded-full border text-[9px] font-black tracking-wider uppercase flex items-center gap-1.5 ${ordermode === 'offline' ? 'border-[#0A0A0A] text-[#0A0A0A] bg-gray-100' : 'border-[#D4AF37] text-[#B48811] bg-amber-50'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${ordermode === 'offline' ? 'bg-[#0A0A0A]' : 'bg-[#D4AF37]'}`}></div>
                {ordermode} (POS)
              </span>
            </div>

            {/* Content body */}
            <div className="min-h-0 flex-1 overflow-y-auto bg-white p-3 space-y-2 hide-scrollbar">

              {/* Info Table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden text-[11px] font-bold">
                <div className="flex justify-between px-3 py-2 border-b border-gray-200 bg-[#FAFAFA]">
                  <span className="text-[#374151] uppercase">Source</span>
                  <span className="text-[#0A0A0A] border border-gray-300 bg-gray-100 px-1.5 rounded uppercase">{ordermode.toUpperCase()}</span>
                </div>
                <div className="grid grid-cols-2 gap-0 border-b border-gray-200">
                  <div className="p-2 border-r border-gray-200">
                    <span className="text-[10px] text-[#374151] uppercase block mb-0.5">Customer Name</span>
                    <input
                      type="text"
                      value={customer.name}
                      onChange={e => setCustomer({...customer, name: e.target.value})}
                      placeholder="Enter name"
                      className="w-full h-8 px-2 bg-white border border-gray-200 rounded-lg text-[12px] font-bold text-[#111111] focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div className="p-2">
                    <span className="text-[10px] text-[#374151] uppercase block mb-0.5">WhatsApp Number</span>
                    <input
                      type="text"
                      value={customer.phone}
                      onChange={e => setCustomer({...customer, phone: e.target.value})}
                      placeholder="Enter WhatsApp number"
                      className={`w-full h-8 px-2 bg-white border rounded-lg text-[12px] font-bold text-[#111111] focus:outline-none ${customer.phone && !normalizePhone(customer.phone) ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-[#D4AF37]'}`}
                    />
                  </div>
                </div>
{items.length > 0 && (
                  <div className="px-3 py-2 bg-[#FAFAFA] space-y-1 border-b border-gray-200 max-h-[80px] overflow-y-auto">
                    {items.map(item => (
                <div key={item.id} className="flex justify-between text-[#111111] text-[11px]">
                        <span className="truncate pr-2">{item.qty}x {item.name}</span>
                        <span>{formatCurrency(item.lineTotal)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Coupon Code */}
              <div>
                <label className="block text-[10px] font-black text-[#374151] tracking-wider uppercase mb-1">Coupon Code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={e => {
                      const val = e.target.value.toUpperCase()
                      setCouponInput(val)
                      if (availableCoupons.some(c => c.code.toUpperCase() === val)) {
                        void applyCoupon(val)
                      }
                    }}
                    placeholder="Enter code"
                    disabled={appliedCoupon !== null}
                    list="pos-coupons"
                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-xl text-[12px] font-bold text-[#111111] focus:outline-none focus:border-[#D4AF37] uppercase disabled:bg-gray-100"
                  />
                  <datalist id="pos-coupons">
                    {availableCoupons.map(c => (
                      <option key={c.code} value={c.code} />
                    ))}
                  </datalist>
                  {appliedCoupon ? (
                    <button
                      onClick={removeCoupon}
                      className="h-9 px-3 bg-red-100 text-red-600 hover:bg-red-200 rounded-xl text-[11px] font-black transition-colors shrink-0"
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      onClick={() => void applyCoupon()}
                      disabled={couponLoading || !couponInput.trim()}
                      className="h-9 px-3 bg-[#0A0A0A] text-[#D4AF37] border border-[#D4AF37] hover:bg-[#1A1A1A] rounded-xl text-[11px] font-black transition-colors disabled:opacity-50 shrink-0"
                    >
                      Apply
                    </button>
                  )}
                </div>
                {couponError && <p className="text-[10px] font-bold text-red-500 mt-0.5">{couponError}</p>}
                {appliedCoupon && (
                  <p className="text-[10px] font-bold text-green-600 mt-0.5">Applied: -{formatCurrency(couponDiscount)}</p>
                )}
              </div>

              {/* Discount */}
              <div>
                <label className="block text-[10px] font-black text-[#374151] tracking-wider uppercase mb-1">Manual Discount</label>
                <div className="flex gap-2">
                  <div className="relative shrink-0">
                    <select
                      value={manualDiscountType}
                      onChange={e => setManualDiscountType(e.target.value as 'flat'|'percent')}
                      className="appearance-none h-9 bg-white border border-gray-200 rounded-xl pl-2 pr-7 text-[12px] font-black text-[#111111] focus:outline-none focus:border-[#D4AF37]"
                    >
                      <option value="flat">₹</option>
                      <option value="percent">%</option>
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#374151] pointer-events-none" />
                  </div>
                  <input
                    type="number" onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    value={manualDiscountValue}
                    onChange={e => setManualDiscountValue(e.target.value)}
                    placeholder="0"
                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-xl text-[12px] font-black text-[#111111] text-right focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              {/* GST Toggle */}
              <div className="flex items-center justify-between py-1 border-b border-gray-200">
                <span className="text-[11px] font-black text-[#374151]">Enable GST on Bill</span>
                <button
                  type="button"
                  onClick={() => setBillGstEnabled(!billGstEnabled)}
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors ${billGstEnabled ? 'bg-[#0A0A0A]' : 'bg-gray-200'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${billGstEnabled ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </button>
              </div>

              {billGstEnabled && (
                <div className="flex gap-2">
                  <div className="relative shrink-0">
                    <select
                      value={gstType}
                      onChange={e => setGstType(e.target.value as 'flat'|'percent')}
                      className="appearance-none h-9 bg-white border border-gray-200 rounded-xl pl-2 pr-7 text-[12px] font-black text-[#111111] focus:outline-none focus:border-[#D4AF37]"
                    >
                      <option value="percent">%</option>
                      <option value="flat">₹</option>
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#374151] pointer-events-none" />
                  </div>
                  <input
                    type="number" onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    value={gstInput}
                    onChange={e => setGstInput(e.target.value)}
                    placeholder={gstType === 'percent' ? "e.g. 6" : "0"}
                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-xl text-[12px] font-black text-[#111111] text-right focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              )}

              {/* Summary calculations */}
              <div className="bg-[#FAFAF8] rounded-xl border border-gray-200 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-[#374151]">Subtotal ({items.length} items)</span>
                  <span className="text-[12px] font-black text-[#111111]">{formatCurrency(subtotal)}</span>
                </div>

                {billGstEnabled && totalGst > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-[#374151]">GST Amount</span>
                    <span className="text-[12px] font-black text-[#111111]">{formatCurrency(totalGst)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-[#374151]">Delivery</span>
                  <input
                    type="number" onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    value={shipping}
                    onChange={e => setShipping(e.target.value)}
                    className="w-20 h-8 px-2 bg-white border border-gray-200 rounded-lg text-[12px] font-black text-[#111111] text-right focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>

                <div className="h-px bg-gray-200"></div>

                {/* Grand Total */}
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[12px] font-black text-[#111111] uppercase tracking-wider">Grand Total</span>
                  <span className="text-[20px] font-black text-[#0A0A0A] tracking-tight">{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Payment Mode Selector */}
              <div>
                <label className="block text-[10px] font-black text-[#374151] tracking-wider uppercase mb-1">Payment Mode</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['cash', 'qr', 'card'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentType(mode)}
                      className={`py-2 rounded-xl text-[11px] font-black uppercase tracking-wide border-2 transition-colors ${
                        paymentType === mode
                          ? 'bg-[#0A0A0A] text-[#D4AF37] border-[#0A0A0A]'
                          : 'bg-white text-[#374151] border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {mode === 'qr' ? 'QR' : mode === 'card' ? 'Card' : 'Cash'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount Received (shown for all payment modes) */}
              {ordermode !== 'online' && (
              <div>
                <div className="border border-gray-200 rounded-xl p-2.5 bg-white">
                  <label className="block text-[10px] font-black text-[#374151] tracking-wider uppercase mb-0.5">
                    {paymentType === 'qr' ? 'QR' : paymentType === 'card' ? 'Card' : 'Cash'} — Amount Received (₹)
                  </label>
                  <input
                    type="number" onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    value={cashReceived}
                    onChange={e => setCashReceived(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-9 px-3 bg-[#FAFAFA] border border-gray-200 rounded-xl text-[13px] font-black text-[#111111] focus:outline-none focus:border-[#D4AF37]"
                  />
                  {cashReceivedNum > 0 && (
                    <div className="mt-2 flex justify-between items-center bg-[#F9FAFB] px-3 py-1.5 rounded-lg border border-gray-200">
                      <span className="text-[10px] font-bold text-[#374151]">Return Balance:</span>
                      <span className="text-[12px] font-black text-[#111111]">{formatCurrency(balanceToReturn)}</span>
                    </div>
                  )}
                </div>
              </div>
              )}

              {error && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[11px] font-bold">
                  {error}
                </div>
              )}
            </div>

            {/* Action Buttons Fixed Footer */}
            <div className="shrink-0 border-t border-gray-200 bg-white p-3 shadow-[0_-8px_20px_rgba(0,0,0,0.04)]">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={openDepositOrder}
                  disabled={saving || items.length === 0}
                  className="min-h-[44px] rounded-xl border-2 border-[#0A0A0A] bg-white px-3 py-3 text-[12px] font-black uppercase tracking-wide text-[#0A0A0A] transition-colors hover:bg-[#0A0A0A] hover:text-[#D4AF37] disabled:opacity-40 cursor-pointer"
                >
                  Save as Deposit Order
                </button>
                <button
                  type="button"
                  onClick={generateBill}
                  disabled={saving}
                  className="min-h-[44px] rounded-xl bg-emerald-600 px-3 py-3 text-[13px] font-black uppercase tracking-wider text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 cursor-pointer shadow-md"
                >
                  {saving ? 'Processing...' : 'Complete Sale'}
                </button>
              </div>
              <p className="mt-2 text-center text-[10px] font-bold text-[#6B7280]">Deposit orders do not count as revenue until the remaining payment is received.</p>
            </div>
          </div>
        </div>

      </div>

      {depositOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4">
          <form onSubmit={saveDepositOrder} className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[.16em] text-violet-600">Advance payment only</p>
                <h3 className="text-xl font-black text-[#111111]">Save as Deposit Order</h3>
                <p className="mt-1 text-xs font-semibold text-amber-700">No sale or tax invoice will be created now.</p>
              </div>
              <button type="button" onClick={() => { setDepositOpen(false); setError('') }} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"><X size={20}/></button>
            </div>
            <div className="mb-4 rounded-2xl bg-violet-50 p-4">
              <div className="flex justify-between text-sm"><span className="font-bold text-violet-700">Order total</span><span className="font-black text-violet-900">{formatCurrency(total)}</span></div>
              <div className="mt-2 max-h-24 space-y-1 overflow-y-auto border-t border-violet-200 pt-2">{items.map(item => <div key={item.id} className="flex justify-between gap-3 text-xs"><span className="truncate">{item.qty}× {item.name}</span><span className="font-bold">{formatCurrency(item.lineTotal)}</span></div>)}</div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-[#6B7280]">Deposit received *</span><input required autoFocus type="number" onWheel={(e) => (e.target as HTMLInputElement).blur()} min="0.01" max={Math.max(0, total - 0.01)} step="0.01" value={depositForm.amount} onChange={e => setDepositForm({...depositForm, amount:e.target.value})} className="w-full rounded-xl border px-3 py-2.5 text-sm font-bold outline-none focus:border-violet-600"/></label>
              <label className="block"><span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-[#6B7280]">Remaining balance</span><div className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-black text-red-700">{formatCurrency(Math.max(0,total-Number(depositForm.amount||0)))}</div></label>
              <label className="block"><span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-[#6B7280]">Expected delivery *</span><input required type="date" value={depositForm.expectedDeliveryDate} onChange={e => setDepositForm({...depositForm, expectedDeliveryDate:e.target.value})} className="w-full rounded-xl border px-3 py-2.5 text-sm font-bold outline-none focus:border-violet-600"/></label>
              <label className="block"><span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-[#6B7280]">Payment method *</span><select value={depositForm.paymentMethod} onChange={e => setDepositForm({...depositForm,paymentMethod:e.target.value as AdvancePaymentMethod})} className="w-full rounded-xl border px-3 py-2.5 text-sm font-bold outline-none focus:border-violet-600"><option value="cash">Cash</option><option value="upi">QR</option><option value="card">Card</option></select></label>
              <label className="block sm:col-span-2"><span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-[#6B7280]">Delivery address</span><textarea value={depositForm.address} onChange={e => setDepositForm({...depositForm,address:e.target.value})} className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-violet-600" rows={2}/></label>
              <label className="block sm:col-span-2"><span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-[#6B7280]">Reference Number</span><input value={depositForm.referenceNumber} onChange={e => setDepositForm({...depositForm,referenceNumber:e.target.value})} className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-violet-600" placeholder="e.g. PO-001, booking ref (optional)"/></label>
              <label className="block sm:col-span-2"><span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-[#6B7280]">Remarks</span><textarea value={depositForm.remarks} onChange={e => setDepositForm({...depositForm,remarks:e.target.value})} className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-violet-600" rows={2}/></label>
            </div>
            {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-600">{error}</div>}
            <div className="mt-5 flex gap-3"><button type="button" onClick={() => { setDepositOpen(false); setError('') }} className="flex-1 rounded-xl border py-3 text-sm font-black">Cancel</button><button disabled={saving} className="flex-[1.5] rounded-xl bg-violet-700 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? 'Saving…' : 'Confirm Deposit Order'}</button></div>
          </form>
        </div>
      )}

      {depositCreated && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">✓</div>
            <p className="mt-4 text-[11px] font-black uppercase tracking-[.16em] text-violet-600">Deposit order saved</p>
            <h3 className="mt-1 text-2xl font-black text-[#111111]">{depositCreated.deposit_id}</h3>
            <p className="mt-2 text-sm text-[#6B7280]">Deposit {formatCurrency(depositCreated.deposit_amount)} · Balance {formatCurrency(depositCreated.remaining_balance)}</p>
            <div className="mt-5 grid grid-cols-2 gap-2"><button onClick={() => printAdvanceReceipt(depositCreated)} className="rounded-xl border border-violet-200 py-3 text-sm font-black text-violet-700"><Printer size={16} className="mr-1 inline"/>Print Receipt</button><button onClick={() => { const msg = buildAdvanceDepositWhatsAppMessage({ customerName: depositCreated.customer_name, depositId: depositCreated.deposit_id, productName: depositCreated.product_name, totalAmount: depositCreated.total_amount, depositAmount: depositCreated.deposit_amount, remainingBalance: depositCreated.remaining_balance, expectedDeliveryDate: depositCreated.expected_delivery_date }); window.open(toWhatsAppUrl(depositCreated.phone, msg), '_blank', 'noopener,noreferrer') }} className="rounded-xl bg-[#25D366] py-3 text-sm font-black text-white"><MessageCircle size={16} className="mr-1 inline -mt-0.5"/>WhatsApp</button></div>
            <button onClick={() => { setDepositCreated(null); searchRef.current?.focus() }} className="mt-3 w-full rounded-xl bg-[#111111] py-3 text-sm font-black text-white">Start New Order</button>
          </div>
        </div>
      )}

      {catalogOpen && (
        <CatalogModal
          isOpen={catalogOpen}
          onClose={() => setCatalogOpen(false)}
          onAdd={(p) => {
            void addItem(p)
            setCatalogOpen(false)
          }}
        />
      )}

      {addUnregisteredOpen && (
        <AddUnregisteredItemModal
          isOpen={addUnregisteredOpen}
          onClose={() => setAddUnregisteredOpen(false)}
          onSubmit={handleAddUnregisteredItem}
        />
      )}

      {/* Variant Picker Modal for Multi-Variant Products */}
      {variantPickerProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-[#E8D399] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-[#FBFAF6]">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-[#0A0A0A]">
                  Select Variant / Size
                </h3>
                <p className="text-xs text-gray-500 font-bold">
                  {variantPickerProduct.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setVariantPickerProduct(null)
                  setAvailableVariants([])
                }}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <label className="block text-[11px] font-black uppercase tracking-wider text-gray-600">
                  Available Sizes &amp; Options ({availableVariants.length})
                </label>
                <div className="grid grid-cols-2 gap-2.5 max-h-52 overflow-y-auto pr-1">
                  {availableVariants.map((v) => (
                    <div
                      key={v.id}
                      onClick={() => setSelectedVariant(v)}
                      className={`p-3 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                        selectedVariant?.id === v.id
                          ? 'border-[#0A0A0A] bg-[#FFF9E6] shadow-xs'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="font-black text-xs text-gray-900">
                        {v.variantName}
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-1 border-t border-gray-100 text-[11px]">
                        <span className="font-black text-black">₹{v.price}</span>
                        <span className="text-[10px] text-emerald-700 font-bold">Stock: {v.stock}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quantity Stepper */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-[#FBFAF6] border border-gray-200">
                <span className="text-xs font-black uppercase tracking-wider text-gray-700">Quantity</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setVariantPickerQty((q) => Math.max(1, q - 1))}
                    className="w-8 h-8 rounded-xl border border-gray-300 bg-white font-black text-sm flex items-center justify-center hover:bg-gray-100 cursor-pointer"
                  >
                    -
                  </button>
                  <span className="font-black text-sm text-black min-w-[20px] text-center">
                    {variantPickerQty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setVariantPickerQty((q) => q + 1)}
                    className="w-8 h-8 rounded-xl border border-gray-300 bg-white font-black text-sm flex items-center justify-center hover:bg-gray-100 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Add Button */}
              <button
                type="button"
                onClick={addVariantToItems}
                className="w-full py-3 rounded-2xl bg-[#0A0A0A] border border-[#D4AF37] text-[#D4AF37] text-xs font-black uppercase tracking-wider hover:bg-[#1A1A1A] transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                Add to Order (₹{((selectedVariant?.price || variantPickerProduct.price || 0) * variantPickerQty).toFixed(2)})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Price Edit & Inventory Confirmation Modal */}
      {priceEditModal.isOpen && priceEditModal.item && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-amber-50/50 to-white">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center text-[#B48811]">
                  <Edit2 size={16} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Edit Item Price</h3>
                  <p className="text-xs text-gray-500 truncate max-w-[260px]">{priceEditModal.item.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClosePriceEdit}
                className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    New Price (₹)
                  </label>
                  <span className="text-[11px] text-gray-500 font-semibold">
                    Current: ₹{Number(priceEditModal.item.basePrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-base">₹</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    autoFocus
                    value={priceEditModal.newPrice}
                    onChange={(e) => setPriceEditModal(prev => ({ ...prev, newPrice: e.target.value, error: '' }))}
                    placeholder="0.00"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void handleSavePrice(false)
                      }
                    }}
                    className="w-full h-12 pl-8 pr-4 bg-gray-50 border-2 border-gray-200 rounded-xl text-lg font-black text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:bg-white transition-all"
                  />
                </div>
                {priceEditModal.error && (
                  <p className="text-xs font-semibold text-red-500 mt-1.5">{priceEditModal.error}</p>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/60 text-xs text-amber-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-amber-800">
                  <AlertCircle size={14} className="shrink-0 text-[#B48811]" />
                  Do you want to update this price in inventory also?
                </p>
                <p className="text-[11px] text-amber-700/90 pl-5 leading-relaxed">
                  Selecting <strong>Yes</strong> updates the price in your master product catalog and inventory database. Selecting <strong>No</strong> updates it for this billing session only.
                </p>
              </div>

              <div className="pt-2 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={priceEditModal.isSubmitting}
                  onClick={() => void handleSavePrice(true)}
                  className="h-11 px-3 bg-[#0A0A0A] hover:bg-[#1A1A1A] text-[#D4AF37] border border-[#D4AF37] font-bold text-xs rounded-xl shadow-sm hover:shadow transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {priceEditModal.isSubmitting ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  <span>Yes (Update Inventory)</span>
                </button>

                <button
                  type="button"
                  disabled={priceEditModal.isSubmitting}
                  onClick={() => void handleSavePrice(false)}
                  className="h-11 px-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1 disabled:opacity-50 cursor-pointer"
                >
                  <span>No (This Bill Only)</span>
                </button>
              </div>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={handleClosePriceEdit}
                  className="text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
