import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Printer, Copy, Check } from 'lucide-react'
import { BarcodeLabel } from './BarcodeLabel'
import { BRAND_EN } from '../../lib/brand'
import { getAllLabelSizes, generateBarcodeSvgString, getStoredBarcodeSettings, saveStoredBarcodeSettings } from '../../lib/barcode'

export interface BarcodePrintModalProps {
  isOpen: boolean
  onClose: () => void
  productName: string
  variantName?: string
  barcodeValue: string
  price: number
  mrp?: number | null
  defaultQuantity?: number
}

type LabelSizePreset = {
  name: string
  widthMm: number
  heightMm: number
}

const getAvailablePresets = (): LabelSizePreset[] => {
  const sizes = getAllLabelSizes()
  return sizes.map((s) => ({
    name: `${s.name} (${s.widthMm}mm × ${s.heightMm}mm)`,
    widthMm: s.widthMm,
    heightMm: s.heightMm,
  }))
}

export const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({
  isOpen,
  onClose,
  productName,
  variantName,
  barcodeValue,
  price,
  mrp,
  defaultQuantity = 1,
}) => {
  const presets = getAvailablePresets()
  const [quantity, setQuantity] = useState<string>(String(defaultQuantity || 1))
  const [selectedPreset, setSelectedPreset] = useState<LabelSizePreset>(presets[0] || { name: 'Thermal Standard', widthMm: 50, heightMm: 25 })
  const [copied, setCopied] = useState(false)
  const [printerType, setPrinterType] = useState<'label' | 'regular'>(() => {
    return getStoredBarcodeSettings().printerType || 'label'
  })

  const handlePrinterTypeChange = (type: 'label' | 'regular') => {
    setPrinterType(type)
    const current = getStoredBarcodeSettings()
    saveStoredBarcodeSettings({ ...current, printerType: type })
  }

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

  if (!isOpen) return null

  const handleCopyBarcode = () => {
    navigator.clipboard.writeText(barcodeValue)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePrint = () => {
    try {
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

      const fullTitle = `${productName}${variantName ? ` (${variantName})` : ''}`
      const isThermal = printerType === 'label'
      const isSmall = selectedPreset.heightMm <= 25
      const isLarge = selectedPreset.heightMm >= 40

      // Proportional barcode sizing preventing detail overlaps
      // Barcode bars take ~32% of height, leaving balanced space for text, header, and footer
      const barcodeHeightPx = Math.max(16, Math.round(selectedPreset.heightMm * 0.32 * 3.7795))
      const printableWidthPx = Math.max(30, (selectedPreset.widthMm - 4) * 3.7795)
      const barcodeBarWidth = Math.max(0.80, Math.min(1.70, Math.round((printableWidthPx / 120) * 100) / 100))
      const barcodeFontSize = Math.max(6, Math.min(9.5, Math.round(selectedPreset.heightMm * 0.20 * 10) / 10))

      // Direct SVG generation without CDN script dependencies
      const svgMarkup = generateBarcodeSvgString(barcodeValue, {
        width: barcodeBarWidth,
        height: barcodeHeightPx,
        fontSize: barcodeFontSize,
        font: 'Arial, sans-serif',
        margin: 0,
        textMargin: 1.5,
        displayValue: true,
      })

      const headerFontSize = isSmall ? '7pt' : isLarge ? '10.5pt' : '8.5pt'
      const titleFontSize = isSmall ? '6pt' : isLarge ? '9pt' : '7.5pt'
      const tagFontSize = isSmall ? '5.5pt' : isLarge ? '8.5pt' : '7pt'
      const priceFontSize = isSmall ? '8pt' : isLarge ? '12pt' : '9.5pt'
      const stickerPadding = isSmall ? '0.6mm 1.2mm' : '1.0mm 1.6mm'

    // Build standalone HTML for the printed stickers with strict thermal proportions
    const parsedQty = parseInt(quantity.trim(), 10)
    const validQuantity = !isNaN(parsedQty) && parsedQty > 0 ? parsedQty : 1
    const singleStickerHtml = `
      <div class="sticker">
        <div class="header">
          <div class="brand">${BRAND_EN}</div>
          <div class="prod-title">${fullTitle}</div>
        </div>
        <div class="barcode-box">
          ${svgMarkup}
        </div>
        <div class="footer">
          <span>${mrp && mrp > price ? `<span class="mrp">MRP ₹${mrp}</span>` : '<span class="retail-tag">CHAJI RETAIL</span>'}</span>
          <span class="price">₹${price}</span>
        </div>
      </div>
    `
    const allStickersHtml = Array.from({ length: Math.max(1, validQuantity) })
      .map(() => singleStickerHtml)
      .join('')

    const bodyContent = isThermal
      ? allStickersHtml
      : `<div class="a4-container">${allStickersHtml}</div>`

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Barcode - ${barcodeValue}</title>
          <style>
            @page {
              ${
                isThermal
                  ? `size: ${selectedPreset.widthMm}mm ${selectedPreset.heightMm}mm; margin: 0mm !important; marks: none !important;`
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
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .a4-container {
              display: flex;
              flex-wrap: wrap;
              align-content: flex-start;
              gap: 3mm 4mm;
            }
            .sticker {
              width: ${selectedPreset.widthMm}mm;
              height: ${selectedPreset.heightMm}mm;
              max-width: ${selectedPreset.widthMm}mm;
              max-height: ${selectedPreset.heightMm}mm;
              padding: ${stickerPadding};
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              align-items: center;
              text-align: center;
              overflow: hidden;
              box-sizing: border-box;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
              background: #fff;
              ${!isThermal ? 'border: 0.2mm dashed #bbb;' : ''}
            }
            .sticker + .sticker {
              ${isThermal ? 'break-before: page !important; page-break-before: always !important;' : ''}
            }
            .header {
              width: 100%;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: flex-start;
              line-height: 1.1;
              flex-shrink: 0;
            }
            .brand {
              font-size: ${headerFontSize};
              font-weight: 900;
              letter-spacing: 0.3px;
              text-transform: uppercase;
              color: #000;
              line-height: 1.1;
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
            .retail-tag {
              font-size: ${tagFontSize};
              font-weight: 800;
              color: #444;
            }
            .mrp {
              text-decoration: line-through;
              color: #555;
              font-size: ${tagFontSize};
              font-weight: 600;
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
    `

    doc.open()
    doc.write(html)
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
        console.warn('[BarcodePrintModal] Failed to execute print:', err)
      } finally {
        setTimeout(cleanup, 2500)
      }
    }, 200)
  } catch (err) {
    console.warn('[BarcodePrintModal] Failed to execute print:', err)
  }
}

  return createPortal(
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen h-[100dvh] z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4 overflow-hidden animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-none sm:rounded-3xl max-w-2xl sm:max-w-3xl w-full h-screen h-[100dvh] sm:h-auto sm:max-h-[92vh] border-0 sm:border border-[#E8D399] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-[#0A0A0A] px-4 py-3 sm:px-6 sm:py-4 border-b border-[#D4AF37]/30 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#1A1A1A] border border-[#D4AF37] flex items-center justify-center text-[#D4AF37]">
              <Printer size={16} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-wide text-white">
                Print Barcode Labels ({BRAND_EN})
              </h2>
              <p className="text-[11px] text-[#D4AF37] font-semibold">
                Generate physical retail stickers for this SKU
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body - Scrollable */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Barcode Info Card */}
          <div className="bg-[#FBFAF6] border border-[#E8D399] rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-[#B48811]">
                Product / SKU
              </span>
              <h3 className="text-base sm:text-lg font-black text-[#0A0A0A] leading-tight">{productName}</h3>
              {variantName && (
                <div className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold">
                  Variant: {variantName}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-gray-200 shadow-sm shrink-0">
              <span className="font-mono text-sm font-black text-black">
                {barcodeValue}
              </span>
              <button
                type="button"
                onClick={handleCopyBarcode}
                className="text-gray-400 hover:text-gray-700 transition-colors p-1 cursor-pointer"
                title="Copy Barcode Value"
              >
                {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          {/* Configuration Form Card */}
          <div className="bg-[#FBFAF6] border border-[#E8D399]/70 rounded-2xl p-4 space-y-4">
            {/* Row 1: Target Printer & Preset */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Target Printer Type */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1.5">
                  Target Printer
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white border border-[#E8D399] shadow-sm">
                  <button
                    type="button"
                    onClick={() => handlePrinterTypeChange('label')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-black transition-all text-center cursor-pointer ${
                      printerType === 'label'
                        ? 'bg-[#0A0A0A] text-[#D4AF37] shadow-sm'
                        : 'text-gray-600 hover:text-black hover:bg-gray-100'
                    }`}
                  >
                    Thermal (Roll)
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrinterTypeChange('regular')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-black transition-all text-center cursor-pointer ${
                      printerType === 'regular'
                        ? 'bg-[#0A0A0A] text-[#D4AF37] shadow-sm'
                        : 'text-gray-600 hover:text-black hover:bg-gray-100'
                    }`}
                  >
                    Desktop (A4)
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  {printerType === 'label'
                    ? 'Roll label printer (1 label per page)'
                    : 'A4 sheet printer (Canon G2010, HP, Epson)'}
                </p>
              </div>

              {/* Label Sizing Preset */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1.5">
                  Label Sizing Preset
                </label>
                <select
                  value={selectedPreset.name}
                  onChange={(e) => {
                    const preset = presets.find((p) => p.name === e.target.value)
                    if (preset) setSelectedPreset(preset)
                  }}
                  className="w-full py-2.5 px-3 rounded-xl border-2 border-[#E8D399] bg-white font-bold text-xs sm:text-sm text-gray-900 outline-none focus:border-[#0A0A0A] shadow-sm cursor-pointer"
                >
                  {presets.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  Dimensions: {selectedPreset.widthMm}mm × {selectedPreset.heightMm}mm
                </p>
              </div>
            </div>

            {/* Row 2: Quantity Stepper & Quick Pills */}
            <div className="pt-3 border-t border-[#E8D399]/50">
              <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-2">
                Number of Labels to Print
              </label>
              <div className="flex flex-wrap items-center gap-3">
                {/* Stepper with explicit unshrinkable buttons */}
                <div className="inline-flex items-center rounded-xl border-2 border-[#E8D399] bg-white overflow-hidden shadow-sm shrink-0">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => String(Math.max(1, (parseInt(q, 10) || 1) - 1)))}
                    className="w-10 h-10 shrink-0 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-black font-black text-lg flex items-center justify-center transition-colors cursor-pointer select-none"
                  >
                    -
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="1"
                    value={quantity}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^0-9]/g, '')
                      setQuantity(clean)
                    }}
                    className="w-20 sm:w-24 text-center font-black text-lg py-1.5 bg-white text-black outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => String((parseInt(q, 10) || 0) + 1))}
                    className="w-10 h-10 shrink-0 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-black font-black text-lg flex items-center justify-center transition-colors cursor-pointer select-none"
                  >
                    +
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[1, 5, 10, 20, 50, 100].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setQuantity(String(num))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        quantity === String(num)
                          ? 'bg-[#0A0A0A] text-[#D4AF37] shadow-sm'
                          : 'bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 shadow-sm'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-black uppercase tracking-wider text-gray-600">
                Sticker Print Preview
              </label>
              <span className="text-[11px] font-bold text-[#B48811]">
                {quantity || 1} {quantity === '1' ? 'Label' : 'Labels'} • {selectedPreset.widthMm} × {selectedPreset.heightMm} mm ({printerType === 'label' ? 'Roll' : 'A4 Sheet'})
              </span>
            </div>
            <div className="bg-[#FBFAF6] border-2 border-dashed border-[#E8D399] rounded-2xl py-6 px-4 flex items-center justify-center min-h-[140px]">
              <BarcodeLabel
                productName={productName}
                variantName={variantName}
                barcodeValue={barcodeValue}
                price={price}
                mrp={mrp}
                storeName={BRAND_EN}
                widthMm={selectedPreset.widthMm}
                heightMm={selectedPreset.heightMm}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#FBFAF6] px-4 py-3 sm:px-6 sm:py-3.5 border-t border-[#E8D399] flex items-center justify-between shrink-0 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs sm:text-sm hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 sm:gap-2 px-4 py-2 sm:px-6 sm:py-2.5 rounded-xl bg-[#0A0A0A] border border-[#D4AF37] text-[#D4AF37] font-black hover:bg-[#1A1A1A] transition-all shadow-md cursor-pointer hover:scale-[1.02] text-xs sm:text-sm shrink-0"
          >
            <Printer size={16} />
            Print {quantity || '1'} {quantity === '1' ? 'Sticker' : 'Stickers'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
