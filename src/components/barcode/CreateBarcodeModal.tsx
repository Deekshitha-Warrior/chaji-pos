import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  Settings,
  Plus,
  Trash2,
  Printer,
  Sparkles,
  Info,
  CheckCircle,
  AlertCircle,
  ChevronDown,
} from 'lucide-react'
import {
  type BarcodeQueueItem,
  type BarcodeSettings,
  type LabelSizeConfig,
  getStoredBarcodeSettings,
  getAllLabelSizes,
  renderBarcodeSvg,
  generateBarcodeSvgString,
} from '../../lib/barcode'
import { BRAND_EN } from '../../lib/brand'
import { barcodeService } from '../../services/barcodeService'
import { fetchVariantsByProduct, type ProductVariant } from '../../services/variantService'
import { BarcodeSettingsDrawer } from './BarcodeSettingsDrawer'
import { BarcodeSheetPreviewModal } from './BarcodeSheetPreviewModal'

interface ProductOption {
  id: number
  name: string
  price: number
  cost_price?: number
  barcode?: string
  stock_quantity?: number
  category?: string
  has_variants?: boolean
}

export interface CreateBarcodeModalProps {
  isOpen: boolean
  onClose: () => void
  products: ProductOption[]
  preselectedProductId?: number
  preselectedVariantId?: string | null
  onSuccess?: () => void
}

export const CreateBarcodeModal: React.FC<CreateBarcodeModalProps> = ({
  isOpen,
  onClose,
  products,
  preselectedProductId,
  preselectedVariantId,
  onSuccess,
}) => {
  // Settings
  const [settings, setSettings] = useState<BarcodeSettings>(getStoredBarcodeSettings())
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false)
  const [showSheetPreviewModal, setShowSheetPreviewModal] = useState(false)

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showSettingsDrawer && !showSheetPreviewModal) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, showSettingsDrawer, showSheetPreviewModal])

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Current Form State (Left Column)
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null)

  const [itemCode, setItemCode] = useState('')
  const [noOfLabels, setNoOfLabels] = useState<string>('1')
  const [header, setHeader] = useState(BRAND_EN)
  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')
  const [line3, setLine3] = useState('Discount: 0%')
  const [line4, setLine4] = useState('')

  // Queue of items to generate (Bottom Table)
  const [queue, setQueue] = useState<BarcodeQueueItem[]>([])

  // Submission & Status
  const [generating, setGenerating] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Preview SVG Ref
  const previewSvgRef = useRef<SVGSVGElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const allSizes = getAllLabelSizes()
  const currentSizeConfig: LabelSizeConfig =
    allSizes.find((s) => s.id === settings.selectedSizeId) || allSizes[0]

  const isSmall = currentSizeConfig.heightMm <= 25
  const isLarge = currentSizeConfig.heightMm >= 40

  const selectProductItem = useCallback(async (prod: ProductOption, targetVariantId?: string | null) => {
    setSelectedProduct(prod)
    setProductSearch(prod.name)
    setDropdownOpen(false)

    // Set default item code (product barcode or generate new code)
    const code = prod.barcode || `CHAJI${Math.floor(1000000 + Math.random() * 9000000)}`
    setItemCode(code)
    setLine1(prod.name)
    setLine2(prod.category || '')
    setLine3(settings.showDiscount ? 'Discount: 0%' : `Price: ₹${prod.price}`)

    // Fetch variants if applicable
    if (prod.has_variants) {
      try {
        const vars = await fetchVariantsByProduct(String(prod.id))
        setVariants(vars)
        if (vars.length > 0) {
          const matched = targetVariantId ? vars.find(v => v.id === targetVariantId) : vars[0]
          const chosen = matched || vars[0]
          setSelectedVariant(chosen)
          if (chosen.barcode) setItemCode(chosen.barcode)
          setLine2(`Size: ${chosen.variantName}`)
          if (chosen.price) {
            setLine3(settings.showDiscount ? 'Discount: 0%' : `Price: ₹${chosen.price}`)
          }
        }
      } catch (err) {
        console.error('Failed to load variants:', err)
      }
    } else {
      setVariants([])
      setSelectedVariant(null)
    }
  }, [settings.showDiscount])

  // Initialize with preselected product if passed
  useEffect(() => {
    if (preselectedProductId) {
      const found = products.find((p) => p.id === preselectedProductId)
      if (found) {
        void selectProductItem(found, preselectedVariantId)
      }
    }
  }, [preselectedProductId, preselectedVariantId, products, selectProductItem])

  // Handle clicking outside the dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Update live preview SVG with dynamic dimension calculations
  useEffect(() => {
    const codeToRender = (itemCode && itemCode.trim()) || 'CHAJI0000000'

    // Proportional preview dimensions: fit comfortably within preview box
    const previewScale = Math.min(230 / currentSizeConfig.widthMm, 150 / currentSizeConfig.heightMm)
    const previewWidth = Math.round(currentSizeConfig.widthMm * previewScale)
    const previewHeight = Math.round(currentSizeConfig.heightMm * previewScale)
    const previewBarcodeHeight = Math.max(26, Math.round(previewHeight * 0.46))
    const codeLength = codeToRender.length
    const previewBarcodeWidth = Math.max(
      0.82,
      Math.min(1.85, Math.round(((previewWidth * 0.84) / ((codeLength + 2) * 11 + 2)) * 100) / 100)
    )

    if (previewSvgRef.current) {
      renderBarcodeSvg(previewSvgRef.current, codeToRender, {
        width: previewBarcodeWidth,
        height: previewBarcodeHeight,
        fontSize: Math.max(7, Math.round(previewHeight * 0.08)),
        displayValue: false,
        margin: 0,
      })
    }
  }, [
    itemCode,
    header,
    line1,
    line2,
    line3,
    line4,
    currentSizeConfig.id,
    currentSizeConfig.widthMm,
    currentSizeConfig.heightMm,
  ])

  // Determine if currently selected item / variant already has a barcode assigned
  const assignedBarcode = selectedVariant
    ? (selectedVariant.barcode && selectedVariant.barcode.trim().length > 0 ? selectedVariant.barcode.trim() : null)
    : (selectedProduct?.has_variants ? null : (selectedProduct?.barcode && selectedProduct.barcode.trim().length > 0 ? selectedProduct.barcode.trim() : null))

  const isBarcodeAlreadyAssigned = Boolean(assignedBarcode)

  const handleSelectVariant = (varId: string) => {
    const v = variants.find((item) => item.id === varId)
    if (!v) return
    setSelectedVariant(v)
    if (v.barcode) setItemCode(v.barcode)
    setLine2(`Size: ${v.variantName}`)
    if (v.price) {
      setLine3(settings.showDiscount ? 'Discount: 0%' : `Price: ₹${v.price}`)
    }
  }

  const handleAssignCode = () => {
    const generated = 'CHAJI' + Math.floor(1000000 + Math.random() * 9000000)
    setItemCode(generated)
  }

  const handleAddToQueue = () => {
    if (!selectedProduct) {
      setStatusMessage({ type: 'error', text: 'Please select an item first' })
      return
    }

    // Check if item already has a barcode assigned in stock management
    if (isBarcodeAlreadyAssigned) {
      setStatusMessage({
        type: 'error',
        text: `Barcode already exists for this item (${assignedBarcode}). Please check in Stock Management.`,
      })
      return
    }

    if (!itemCode.trim()) {
      setStatusMessage({ type: 'error', text: 'Item Code / Barcode is required' })
      return
    }

    const parsedLabels = parseInt(noOfLabels.trim(), 10)
    const finalLabels = !isNaN(parsedLabels) && parsedLabels > 0 ? parsedLabels : 1

    // Check if already present in the current queue
    const alreadyInQueue = queue.some(
      (it) => it.productId === selectedProduct.id && (selectedVariant ? it.variantId === selectedVariant.id : !it.variantId)
    )
    if (alreadyInQueue) {
      setStatusMessage({
        type: 'error',
        text: `This item (${selectedProduct.name}${selectedVariant ? ` - ${selectedVariant.variantName}` : ''}) is already added in the queue.`,
      })
      return
    }

    const newItem: BarcodeQueueItem = {
      id: `queue_${Date.now()}_${Math.random()}`,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      variantId: selectedVariant?.id || null,
      variantName: selectedVariant?.variantName || undefined,
      barcodeValue: itemCode.trim(),
      price: selectedVariant?.price || selectedProduct.price,
      costPrice: selectedProduct.cost_price || 0,
      noOfLabels: finalLabels,
      header: header.trim(),
      line1: line1.trim(),
      line2: line2.trim(),
      line3: line3.trim(),
      line4: line4.trim(),
      selected: true,
    }

    setQueue((prev) => [...prev, newItem])
    setStatusMessage(null)

    // Reset some inputs for rapid entry
    setNoOfLabels('1')
  }

  const handleRemoveQueueItem = (id: string) => {
    setQueue((prev) => prev.filter((it) => it.id !== id))
  }

  const handleUpdateQueueItem = (
    id: string,
    field: keyof BarcodeQueueItem,
    value: string | number | boolean
  ) => {
    setQueue((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: value } : it))
    )
  }

  const handleToggleSelectAll = (checked: boolean) => {
    setQueue((prev) => prev.map((it) => ({ ...it, selected: checked })))
  }

  const totalLabelsNeeded = queue
    .filter((it) => it.selected)
    .reduce((sum, it) => sum + (it.noOfLabels || 0), 0)

  const handleGenerateAndCommitStock = async () => {
    const selectedItems = queue.filter((it) => it.selected)
    if (selectedItems.length === 0) {
      setStatusMessage({ type: 'error', text: 'Please add and select at least one item to generate barcodes' })
      return
    }

    setGenerating(true)
    setStatusMessage(null)

    try {
      // Process all queued items sequentially or in parallel
      for (const item of selectedItems) {
        await barcodeService.receiveStockWithBarcode({
          product_id: item.productId,
          variant_id: item.variantId || null,
          quantity_received: item.noOfLabels,
          unit_cost: item.costPrice || null,
          custom_barcode: item.barcodeValue,
          note: `Received via Barcode Generator (${item.noOfLabels} labels)`,
          created_by_name: 'Admin',
        })
      }

      setStatusMessage({
        type: 'success',
        text: `Successfully generated barcodes & added stock for ${selectedItems.length} items (${totalLabelsNeeded} total units)!`,
      })

      onSuccess?.()
      setShowSheetPreviewModal(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to receive stock with barcodes'
      setStatusMessage({ type: 'error', text: msg })
    } finally {
      setGenerating(false)
    }
  }

  // Filter products for searchable dropdown
  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.barcode && p.barcode.toLowerCase().includes(productSearch.toLowerCase()))
  )

  const printQueueDirectly = () => {
    const selectedItems = queue.filter((it) => it.selected)
    if (selectedItems.length === 0) return

    try {
      // Build printable HTML sheet for thermal / regular printer
      const iframe = document.createElement('iframe')
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
      iframe.setAttribute('aria-hidden', 'true')
      iframe.setAttribute('tabindex', '-1')
      iframe.setAttribute('data-gramm', 'false')
      iframe.setAttribute('data-gramm_editor', 'false')
      iframe.setAttribute('data-enable-grammarly', 'false')
      iframe.setAttribute('spellcheck', 'false')
      document.body.appendChild(iframe)

      const doc = iframe.contentWindow?.document
      if (!doc) {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
        return
      }

    const isThermal = settings.printerType === 'label'
    const isSmall = currentSizeConfig.heightMm <= 25
    const isLarge = currentSizeConfig.heightMm >= 40

    // Proportional barcode sizing preventing detail overlaps
    const barcodeHeightPx = Math.max(16, Math.round(currentSizeConfig.heightMm * 0.32 * 3.7795))
    const printableWidthPx = Math.max(30, (currentSizeConfig.widthMm - 4) * 3.7795)
    const barcodeBarWidth = Math.max(0.80, Math.min(1.70, Math.round((printableWidthPx / 120) * 100) / 100))
    const barcodeFontSize = Math.max(6, Math.min(9.5, Math.round(currentSizeConfig.heightMm * 0.20 * 10) / 10))

    const headerFontSize = isSmall ? '7pt' : isLarge ? '10.5pt' : '8.5pt'
    const titleFontSize = isSmall ? '6pt' : isLarge ? '9pt' : '7.5pt'
    const tagFontSize = isSmall ? '5.5pt' : isLarge ? '8.5pt' : '7pt'
    const priceFontSize = isSmall ? '8pt' : isLarge ? '12pt' : '9.5pt'
    const stickerPadding = isSmall ? '0.6mm 1.2mm' : '1.0mm 1.6mm'

    // Generate individual sticker cards HTML with pre-rendered SVGs
    const allStickers: string[] = []
    selectedItems.forEach((item) => {
      const count = Math.max(1, item.noOfLabels)
      const fullTitle = `${item.productName}${item.variantName ? ` (${item.variantName})` : ''}`
      const svgMarkup = generateBarcodeSvgString(item.barcodeValue, {
        width: barcodeBarWidth,
        height: barcodeHeightPx,
        fontSize: barcodeFontSize,
        font: 'Arial, sans-serif',
        margin: 0,
        textMargin: 1.5,
        displayValue: true,
      })
      for (let i = 0; i < count; i++) {
        allStickers.push(`
          <div class="label-sticker">
            ${settings.showCompanyName ? `<div class="header">${item.header || BRAND_EN}</div>` : ''}
            ${settings.showItemName ? `<div class="prod-title">${fullTitle}</div>` : ''}
            <div class="barcode-box">
              ${svgMarkup}
            </div>
            <div class="footer">
              <span>${item.line2 ? `<span class="tag">${item.line2}</span>` : '<span class="tag">CHAJI RETAIL</span>'}</span>
              ${settings.showSalePrice ? `<span class="price">₹${item.price}</span>` : ''}
            </div>
          </div>
        `)
      }
    })

    let bodyContent = ''
    if (isThermal) {
      // 1 barcode per page for thermal roll printing
      bodyContent = allStickers.join('')
    } else {
      // Regular A4 printer container
      bodyContent = `
        <div class="a4-container">
          ${allStickers.join('')}
        </div>
      `
    }

    doc.open()
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>CHAJI Barcode Labels</title>
          <style>
            @page {
              ${
                isThermal
                  ? `size: ${currentSizeConfig.widthMm}mm ${currentSizeConfig.heightMm}mm; margin: 0mm !important; marks: none !important;`
                  : `size: A4 portrait; margin: 10mm !important;`
              }
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .a4-container {
              display: flex;
              flex-wrap: wrap;
              align-content: flex-start;
              gap: 3mm 4mm;
            }
            .label-sticker {
              width: ${currentSizeConfig.widthMm}mm !important;
              height: ${currentSizeConfig.heightMm}mm !important;
              max-width: ${currentSizeConfig.widthMm}mm !important;
              max-height: ${currentSizeConfig.heightMm}mm !important;
              box-sizing: border-box;
              padding: ${stickerPadding};
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              align-items: center;
              text-align: center;
              overflow: hidden;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
              background: #fff;
              ${!isThermal ? 'border: 0.2mm dashed #bbb;' : ''}
            }
            .label-sticker + .label-sticker {
              ${isThermal ? 'break-before: page !important; page-break-before: always !important;' : ''}
            }
            .header {
              font-size: ${headerFontSize};
              font-weight: 900;
              letter-spacing: 0.3px;
              text-transform: uppercase;
              line-height: 1.1;
              color: #000;
              flex-shrink: 0;
            }
            .prod-title {
              font-size: ${titleFontSize};
              font-weight: 700;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              max-width: 98%;
              margin-top: 0.3mm;
              color: #111;
              line-height: 1.1;
            }
            .barcode-box {
              width: 100%;
              flex: 1;
              min-height: 0;
              display: flex;
              justify-content: center;
              align-items: center;
              margin: 0.4mm 0;
              overflow: hidden;
            }
            .barcode-box svg {
              display: block;
              margin: 0 auto;
              max-width: 98%;
              max-height: 100%;
              width: auto;
              height: auto;
            }
            .footer {
              width: 100%;
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-top: 0.6pt solid #000;
              padding-top: 0.5mm;
              line-height: 1;
              flex-shrink: 0;
            }
            .tag {
              font-size: ${tagFontSize};
              font-weight: 700;
              color: #444;
            }
            .price {
              font-size: ${priceFontSize};
              font-weight: 900;
              color: #000;
            }
          </style>
        </head>
        <body data-gramm="false">
          ${bodyContent}
        </body>
      </html>
    `)
    doc.close()

    const cleanup = () => {
      try {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe)
        }
      } catch {}
    }

    setTimeout(() => {
      try {
        if (iframe.contentWindow) {
          iframe.contentWindow.onbeforeunload = null
          iframe.contentWindow.onunload = null
          iframe.contentWindow.onafterprint = cleanup
          iframe.contentWindow.focus()
          iframe.contentWindow.print()
        }
      } catch (err) {
        console.warn('[CreateBarcodeModal] Print error:', err)
      } finally {
        setTimeout(cleanup, 2500)
      }
    }, 200)
  } catch (err) {
    console.warn('[CreateBarcodeModal] Failed to execute print:', err)
  }
}

  if (!isOpen) return null

  return createPortal(
    <>
      <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen h-[100dvh] z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4 overflow-hidden animate-in fade-in duration-150">
        <div className="absolute inset-0" onClick={onClose} />
        <div className="relative z-10 bg-white w-full max-w-6xl h-screen h-[100dvh] sm:h-auto sm:max-h-[94vh] rounded-none sm:rounded-3xl border-0 sm:border border-gray-200 shadow-2xl overflow-hidden flex flex-col">
          {/* TOP BAR matching Screenshot 195106 */}
          <div className="flex items-center justify-between px-4 py-3.5 sm:px-6 sm:py-4 border-b border-gray-200 bg-[#0A0A0A] text-white shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black tracking-wide text-white flex items-center gap-1.5">
                Barcode Generator
              </h2>
              <Info size={14} className="text-[#D4AF37] opacity-80" />
            </div>

            {/* Right side: Printer / Size info & Settings gear */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-gray-300">
                <span>
                  Printer <strong className="text-white">{settings.printerType === 'label' ? 'Label Printer' : 'Regular Printer'}</strong>
                </span>
                <span className="text-gray-500">|</span>
                <span>
                  Size <strong className="text-[#D4AF37]">{currentSizeConfig.name}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsDrawer(true)}
                title="Barcode Settings"
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-[#D4AF37] hover:text-[#0A0A0A] flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                <Settings size={16} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Status Message */}
          {statusMessage && (
            <div
              className={`px-6 py-2.5 flex items-center justify-between text-xs font-bold ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200'
                  : 'bg-red-50 text-red-800 border-b border-red-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {statusMessage.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                <span>{statusMessage.text}</span>
              </div>
              <button
                onClick={() => setStatusMessage(null)}
                className="text-gray-500 hover:text-black font-black cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* MAIN WORKSPACE BODY (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {/* TOP CARD: 2-COLUMN INTAKE FORM */}
            <div className="bg-[#FBFAF6] border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_310px] gap-6 items-start">
                {/* LEFT SECTION: Form Inputs */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="block text-xs font-black uppercase tracking-wider text-gray-800">
                      Enter item details to add for barcode
                    </span>
                    {selectedProduct && (
                      <span className="text-[11px] font-bold text-gray-500">
                        Selected: <strong className="text-gray-900">{selectedProduct.name}</strong>
                      </span>
                    )}
                  </div>

                  {/* Duplicate Barcode Alert Warning Banner */}
                  {isBarcodeAlreadyAssigned && (
                    <div className="p-3 bg-red-50 border-2 border-red-300 rounded-xl flex items-start gap-2.5 text-xs text-red-900 font-bold animate-in fade-in duration-150">
                      <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>Barcode already exists for this item:</span>
                          <span className="font-mono bg-white px-2 py-0.5 rounded border border-red-300 text-red-950 font-black">
                            {assignedBarcode}
                          </span>
                        </div>
                        <p className="text-[11px] text-red-700 font-semibold mt-1">
                          Barcode already exists. Please check in Stock Management to view, print, or manage this SKU.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Row 1: Item Name & Item Code */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Item Name Dropdown / Combobox with markers */}
                    <div className="relative" ref={dropdownRef}>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700 mb-1">
                        Item Name <span className="text-red-500">*</span>
                      </label>
                      <div
                        onClick={() => setDropdownOpen(true)}
                        className="w-full h-10 px-3 rounded-xl border border-gray-300 bg-white flex items-center justify-between cursor-pointer focus-within:border-[#0A0A0A]"
                      >
                        <input
                          type="text"
                          placeholder="Enter / Select Item Name"
                          value={productSearch}
                          onChange={(e) => {
                            setProductSearch(e.target.value)
                            setDropdownOpen(true)
                          }}
                          className="w-full text-xs font-bold text-gray-900 bg-transparent outline-none"
                        />
                        <ChevronDown size={14} className="text-gray-400 shrink-0" />
                      </div>

                      {/* Dropdown Menu with Visual Markers */}
                      {dropdownOpen && (
                        <div className="absolute left-0 top-full mt-1 w-full sm:w-[420px] bg-white rounded-2xl border border-gray-300 shadow-2xl z-50 overflow-hidden animate-in fade-in duration-100">
                          {/* Product Items List */}
                          <div className="max-h-60 overflow-y-auto divide-y divide-gray-100">
                            {filteredProducts.length === 0 ? (
                              <div className="p-4 text-xs text-gray-400 text-center font-bold">
                                No matching products found.
                              </div>
                            ) : (
                              filteredProducts.map((p) => {
                                const hasExistingBarcode = Boolean(p.barcode && p.barcode.trim().length > 0)
                                return (
                                  <div
                                    key={p.id}
                                    onClick={() => selectProductItem(p)}
                                    className="p-2.5 hover:bg-[#FBFAF6] cursor-pointer flex items-center justify-between text-xs transition-colors"
                                  >
                                    <div className="min-w-0 pr-2">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <p className="font-bold text-gray-900 truncate">
                                          {p.name}
                                        </p>
                                        {p.has_variants ? (
                                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                                            Variants
                                          </span>
                                        ) : hasExistingBarcode ? (
                                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                                            Barcode: {p.barcode}
                                          </span>
                                        ) : (
                                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                            No Barcode
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                                        {p.category || 'General'}
                                      </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <span className="font-black text-gray-900">₹{p.price}</span>
                                      <span className="block text-[10px] text-gray-500 font-semibold">
                                        Stock: {p.stock_quantity ?? 0}
                                      </span>
                                    </div>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Item Code (with Assign Code button) */}
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700 mb-1">
                        Item Code <span className="text-red-500">*</span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          required
                          placeholder="Enter Item Code"
                          value={itemCode}
                          onChange={(e) => setItemCode(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-gray-300 bg-white text-xs font-mono font-bold text-gray-900 outline-none focus:border-[#0A0A0A]"
                        />
                        <button
                          type="button"
                          onClick={handleAssignCode}
                          className="shrink-0 px-3 h-10 rounded-xl bg-gray-100 border border-gray-300 text-[11px] font-black text-gray-700 hover:bg-gray-200 transition-colors cursor-pointer"
                        >
                          Assign Code
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* If product has variants, show variant picker & Add All Variants button */}
                  {variants.length > 0 && (
                    <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-black uppercase tracking-wider text-amber-900">
                          Select Variant / Size ({variants.length} available)
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            if (!selectedProduct) return
                            const unassignedVariants = variants.filter(
                              (v) => !v.barcode || !v.barcode.trim()
                            )

                            if (unassignedVariants.length === 0) {
                              setStatusMessage({
                                type: 'error',
                                text: `All variants for "${selectedProduct.name}" already have barcodes assigned. Please check in Stock Management.`,
                              })
                              return
                            }

                            const itemsToAdd: BarcodeQueueItem[] = unassignedVariants.map((v) => ({
                              id: `queue_${Date.now()}_${v.id}_${Math.random()}`,
                              productId: selectedProduct.id,
                              productName: selectedProduct.name,
                              variantId: v.id,
                              variantName: v.variantName,
                              barcodeValue: `CHAJI${Math.floor(1000000 + Math.random() * 9000000)}`,
                              price: v.price || selectedProduct.price,
                              costPrice: selectedProduct.cost_price || 0,
                              noOfLabels: parseInt(noOfLabels, 10) || 1,
                              header: header || BRAND_EN,
                              line1: selectedProduct.name,
                              line2: `Size: ${v.variantName}`,
                              line3: settings.showDiscount ? 'Discount: 0%' : `Price: ₹${v.price || selectedProduct.price}`,
                              line4: line4.trim(),
                              selected: true,
                            }))

                            setQueue((prev) => [...prev, ...itemsToAdd])

                            if (unassignedVariants.length < variants.length) {
                              const skipped = variants.length - unassignedVariants.length
                              setStatusMessage({
                                type: 'success',
                                text: `Added ${unassignedVariants.length} new variants to queue. Skipped ${skipped} variant(s) that already have barcodes.`,
                              })
                            } else {
                              setStatusMessage({
                                type: 'success',
                                text: `Added all ${variants.length} variants for "${selectedProduct.name}" to the queue!`,
                              })
                            }
                          }}
                          className="px-2.5 py-1 rounded-md bg-[#0A0A0A] text-[#D4AF37] border border-[#D4AF37] text-[10px] font-black uppercase tracking-wider hover:bg-[#1A1A1A] transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                        >
                          <Plus size={11} /> Add Unassigned Variants ({variants.filter(v => !v.barcode?.trim()).length})
                        </button>
                      </div>
                      <select
                        value={selectedVariant?.id || ''}
                        onChange={(e) => handleSelectVariant(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-amber-300 bg-white text-xs font-bold text-gray-900 outline-none"
                      >
                        {variants.map((v) => {
                          const hasVarBarcode = Boolean(v.barcode && v.barcode.trim())
                          return (
                            <option key={v.id} value={v.id}>
                              {v.variantName} {hasVarBarcode ? `— [Barcode: ${v.barcode}] (Already Assigned)` : '— [No Barcode]'} — ₹{v.price} — Stock: {v.stock}
                            </option>
                          )
                        })}
                      </select>
                    </div>
                  )}

                  {/* Row 2: No of Labels, Header, Line 1 */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700 mb-1">
                        No of Labels <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="1"
                        value={noOfLabels}
                        onChange={(e) => {
                          const clean = e.target.value.replace(/[^0-9]/g, '')
                          setNoOfLabels(clean)
                        }}
                        className="w-full h-10 px-3 rounded-xl border border-gray-300 bg-white text-xs font-black text-gray-900 outline-none focus:border-[#0A0A0A]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700 mb-1">
                        Header
                      </label>
                      <input
                        type="text"
                        placeholder="Enter Header"
                        value={header}
                        onChange={(e) => setHeader(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-[#0A0A0A]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700 mb-1">
                        Line 1
                      </label>
                      <input
                        type="text"
                        placeholder="Enter Line 1"
                        value={line1}
                        onChange={(e) => setLine1(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-[#0A0A0A]"
                      />
                    </div>
                  </div>

                  {/* Row 3: Line 2, Line 3, Line 4 */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700 mb-1">
                        Line 2
                      </label>
                      <input
                        type="text"
                        placeholder="Enter Line 2"
                        value={line2}
                        onChange={(e) => setLine2(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-[#0A0A0A]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700 mb-1">
                        Line 3
                      </label>
                      <input
                        type="text"
                        placeholder="Enter Line 3"
                        value={line3}
                        onChange={(e) => setLine3(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-[#0A0A0A]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700 mb-1">
                        Line 4
                      </label>
                      <input
                        type="text"
                        placeholder="Enter Line 4"
                        value={line4}
                        onChange={(e) => setLine4(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-[#0A0A0A]"
                      />
                    </div>
                  </div>
                </div>

                {/* RIGHT SECTION: Live Sticker Preview dynamically adapting to selected size */}
                <div className="flex flex-col items-center w-full">
                  <div className="w-full flex items-center justify-between mb-2 px-0.5">
                    <span className="text-xs font-black uppercase tracking-wider text-gray-800">
                      Live Preview
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#0A0A0A] text-[#D4AF37] tracking-wide shrink-0">
                      {currentSizeConfig.widthMm} × {currentSizeConfig.heightMm} mm
                    </span>
                  </div>

                  {/* Canvas backing representing paper roll / sheet */}
                  <div className="w-full rounded-2xl bg-[#F4F5F7] border border-gray-300 p-3.5 shadow-inner flex flex-col items-center justify-center relative min-h-[220px] overflow-hidden">
                    {(() => {
                      const previewScale = Math.min(230 / currentSizeConfig.widthMm, 150 / currentSizeConfig.heightMm)
                      const previewWidthPx = Math.max(140, Math.round(currentSizeConfig.widthMm * previewScale))
                      const previewHeightPx = Math.max(90, Math.round(currentSizeConfig.heightMm * previewScale))
                      const previewBarcodeHeightPx = Math.max(26, Math.round(previewHeightPx * 0.46))

                      return (
                        <div
                          className="bg-white border border-gray-300 rounded-xl p-2.5 shadow-sm flex flex-col justify-between items-center text-center relative transition-all"
                          style={{
                            width: `${previewWidthPx}px`,
                            height: `${previewHeightPx}px`,
                            boxSizing: 'border-box',
                          }}
                        >
                          {/* Company / Brand */}
                          {settings.showCompanyName && (
                            <span
                              className="font-black uppercase tracking-wider text-gray-900 leading-none truncate max-w-[78%]"
                              style={{ fontSize: `${Math.max(8, Math.round(previewHeightPx * 0.085))}px` }}
                            >
                              {header || BRAND_EN}
                            </span>
                          )}

                          {/* Barcode Graphic Box (takes ~46% height) */}
                          <div
                            className="w-full flex items-center justify-center overflow-hidden my-0.5"
                            style={{ height: `${previewBarcodeHeightPx}px` }}
                          >
                            <svg ref={previewSvgRef} className="max-w-[98%] max-h-full h-auto" />
                          </div>

                          {/* Barcode number text */}
                          <span
                            className="font-mono font-bold text-gray-800 tracking-wider leading-none"
                            style={{ fontSize: `${Math.max(7.5, Math.round(previewHeightPx * 0.075))}px` }}
                          >
                            {itemCode || 'CHAJI0000000'}
                          </span>

                          {/* Product Title */}
                          {settings.showItemName && (
                            <span
                              className="font-bold text-gray-800 truncate max-w-full leading-tight"
                              style={{ fontSize: `${Math.max(7.5, Math.round(previewHeightPx * 0.075))}px` }}
                            >
                              {line1 || selectedProduct?.name || 'Item Name'}
                            </span>
                          )}

                          {/* Variant / Category */}
                          {line2 && (
                            <span
                              className="font-semibold text-gray-600 truncate max-w-full leading-tight"
                              style={{ fontSize: `${Math.max(7, Math.round(previewHeightPx * 0.07))}px` }}
                            >
                              {line2}
                            </span>
                          )}

                          {/* Price */}
                          {settings.showSalePrice && (
                            <span
                              className="font-black text-black truncate max-w-full leading-none"
                              style={{ fontSize: `${Math.max(8.5, Math.round(previewHeightPx * 0.095))}px` }}
                            >
                              {line3 || (settings.showDiscount ? 'Discount: 0%' : 'Price: ₹0')}
                            </span>
                          )}

                          {/* Extra line */}
                          {line4 && (
                            <span
                              className="text-gray-500 truncate max-w-full leading-none"
                              style={{ fontSize: `${Math.max(6.5, Math.round(previewHeightPx * 0.065))}px` }}
                            >
                              {line4}
                            </span>
                          )}
                        </div>
                      )
                    })()}

                    <div className="mt-2.5 text-[10px] font-bold text-gray-500 text-center">
                      {settings.printerType === 'label'
                        ? `Thermal Roll • 1 barcode per page (${currentSizeConfig.name})`
                        : 'Regular Printer (A4 Sheet Layout)'}
                    </div>
                  </div>

                  {/* Add for Barcode Button */}
                  <button
                    type="button"
                    onClick={handleAddToQueue}
                    className={`w-full mt-3 py-2.5 rounded-xl border text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer ${
                      isBarcodeAlreadyAssigned
                        ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                        : 'bg-[#0A0A0A] border-[#D4AF37] text-[#D4AF37] hover:bg-[#1A1A1A]'
                    }`}
                  >
                    <Plus size={14} /> {isBarcodeAlreadyAssigned ? 'Barcode Already Exists' : 'Add for Barcode'}
                  </button>
                </div>
              </div>
            </div>

            {/* BOTTOM SECTION: QUEUE TABLE (`Item Details`) matching Screenshot 195637 */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
              <div className="p-4 border-b border-gray-200 bg-[#FAFAFA] flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-800">
                  Item Details ({queue.length})
                </h3>
              </div>

              {queue.length === 0 ? (
                /* Empty queue state matching Screenshot 195106 */
                <div className="p-12 text-center flex flex-col items-center justify-center text-gray-400">
                  <div className="w-16 h-16 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center mb-3">
                    <Sparkles size={28} className="text-gray-400" />
                  </div>
                  <p className="text-xs font-bold text-gray-600">
                    Added items for Barcode generation will appear here.
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Select an item above, set quantity of labels, and click "Add for Barcode".
                  </p>
                </div>
              ) : (
                /* Queue Table with inline editable cells */
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#FBFAF6] border-b border-gray-200 text-[10px] font-black uppercase tracking-wider text-gray-600">
                      <tr>
                        <th className="p-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={queue.every((it) => it.selected)}
                            onChange={(e) => handleToggleSelectAll(e.target.checked)}
                            className="accent-[#0A0A0A] w-4 h-4 rounded cursor-pointer"
                          />
                        </th>
                        <th className="p-3">Item Name</th>
                        <th className="p-3 w-28">No of Labels</th>
                        <th className="p-3">Header</th>
                        <th className="p-3">Line 1</th>
                        <th className="p-3">Line 2</th>
                        <th className="p-3">Line 3</th>
                        <th className="p-3">Line 4</th>
                        <th className="p-3 w-12 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {queue.map((item) => (
                        <tr key={item.id} className="hover:bg-[#FBFAF6] transition-colors">
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={(e) =>
                                handleUpdateQueueItem(item.id, 'selected', e.target.checked)
                              }
                              className="accent-[#0A0A0A] w-4 h-4 rounded cursor-pointer"
                            />
                          </td>
                          <td className="p-3 font-bold text-gray-900">
                            <div>{item.productName}</div>
                            <div className="text-[10px] font-mono text-gray-400">
                              {item.barcodeValue} {item.variantName ? `(${item.variantName})` : ''}
                            </div>
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              placeholder="1"
                              value={item.noOfLabels === 0 || (item.noOfLabels as unknown) === '' ? '' : item.noOfLabels}
                              onChange={(e) => {
                                const clean = e.target.value.replace(/[^0-9]/g, '')
                                handleUpdateQueueItem(
                                  item.id,
                                  'noOfLabels',
                                  clean === '' ? ('' as unknown as number) : (parseInt(clean, 10) || 0)
                                )
                              }}
                              className="w-20 h-8 px-2 rounded-lg border border-gray-300 font-black text-center text-xs outline-none focus:border-[#0A0A0A]"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={item.header}
                              onChange={(e) =>
                                handleUpdateQueueItem(item.id, 'header', e.target.value)
                              }
                              className="w-28 h-8 px-2 rounded-lg border border-gray-300 text-xs font-bold outline-none focus:border-[#0A0A0A]"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={item.line1}
                              onChange={(e) =>
                                handleUpdateQueueItem(item.id, 'line1', e.target.value)
                              }
                              className="w-28 h-8 px-2 rounded-lg border border-gray-300 text-xs outline-none focus:border-[#0A0A0A]"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={item.line2}
                              onChange={(e) =>
                                handleUpdateQueueItem(item.id, 'line2', e.target.value)
                              }
                              className="w-28 h-8 px-2 rounded-lg border border-gray-300 text-xs outline-none focus:border-[#0A0A0A]"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={item.line3}
                              onChange={(e) =>
                                handleUpdateQueueItem(item.id, 'line3', e.target.value)
                              }
                              className="w-28 h-8 px-2 rounded-lg border border-gray-300 text-xs outline-none focus:border-[#0A0A0A]"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={item.line4}
                              onChange={(e) =>
                                handleUpdateQueueItem(item.id, 'line4', e.target.value)
                              }
                              className="w-28 h-8 px-2 rounded-lg border border-gray-300 text-xs outline-none focus:border-[#0A0A0A]"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveQueueItem(item.id)}
                              className="w-7 h-7 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer mx-auto"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Status Banner at table bottom matching Screenshot 195637 */}
              {queue.length > 0 && (
                <div className="p-3 bg-blue-50/70 border-t border-blue-200 text-xs text-blue-900 font-bold flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Info size={15} className="text-blue-600" />
                    <span>You will need {totalLabelsNeeded} labels for printing.</span>
                  </div>
                  <span className="text-[11px] text-gray-600">
                    {queue.filter((i) => i.selected).length} items selected
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* MODAL FOOTER matching Screenshot 195637 */}
          <div className="px-3 py-2.5 sm:px-6 sm:py-4 border-t border-gray-200 bg-white flex items-center justify-between shrink-0 gap-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 sm:px-5 sm:py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
            >
              Close
            </button>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {queue.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSheetPreviewModal(true)}
                  className="px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl border-2 border-[#0A0A0A] bg-white text-[#0A0A0A] text-[11px] sm:text-xs font-black uppercase tracking-wider hover:bg-gray-100 transition-all cursor-pointer shrink-0"
                >
                  Preview
                </button>
              )}

              <button
                type="button"
                onClick={handleGenerateAndCommitStock}
                disabled={generating || queue.filter((it) => it.selected).length === 0}
                className="px-3 py-2 sm:px-6 sm:py-2.5 rounded-xl bg-[#0A0A0A] border border-[#D4AF37] text-[#D4AF37] text-[11px] sm:text-xs font-black uppercase tracking-wider hover:bg-[#1A1A1A] transition-all shadow-md flex items-center gap-1.5 sm:gap-2 cursor-pointer disabled:opacity-50 text-center justify-center shrink-0"
              >
                {generating ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin inline-block" />
                    <span className="hidden sm:inline">Receiving Stock &amp; Generating...</span>
                    <span className="sm:hidden">Adding...</span>
                  </>
                ) : (
                  <>
                    <Printer size={15} /> <span>Generate &amp; Add ({totalLabelsNeeded})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Barcode Settings Drawer */}
      {showSettingsDrawer && (
        <BarcodeSettingsDrawer
          isOpen={showSettingsDrawer}
          onClose={() => setShowSettingsDrawer(false)}
          settings={settings}
          onUpdateSettings={(newSettings) => setSettings(newSettings)}
        />
      )}

      {/* Multi-Label Sheet Preview Modal */}
      {showSheetPreviewModal && (
        <BarcodeSheetPreviewModal
          isOpen={showSheetPreviewModal}
          onClose={() => setShowSheetPreviewModal(false)}
          items={queue}
          sizeConfig={currentSizeConfig}
          onPrint={printQueueDirectly}
        />
      )}
    </>,
    document.body
  )
}
