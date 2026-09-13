import React, { useEffect, useRef } from 'react'
import { renderBarcodeSvg } from '../../lib/barcode'
import { BRAND_EN } from '../../lib/brand'
import { formatCurrency } from '../../lib/retail'

export interface BarcodeLabelProps {
  productName: string
  variantName?: string
  barcodeValue: string
  price: number
  mrp?: number | null
  storeName?: string
  widthMm?: number
  heightMm?: number
}

export const BarcodeLabel: React.FC<BarcodeLabelProps> = ({
  productName,
  variantName,
  barcodeValue,
  price,
  mrp,
  storeName = BRAND_EN,
  widthMm = 50,
  heightMm = 30,
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const isSmall = heightMm <= 25
  const isLarge = heightMm >= 40

  // Dynamic calculation for barcode dimensions and typography (balanced proportions to prevent overlapping)
  const barcodeHeightPx = Math.max(16, Math.round(heightMm * 0.32 * 3.7795))
  const printableWidthPx = Math.max(30, (widthMm - 4) * 3.7795)
  const barcodeBarWidth = Math.max(0.80, Math.min(1.70, Math.round((printableWidthPx / 120) * 100) / 100))
  const barcodeFontSize = Math.max(6, Math.min(9.5, Math.round(heightMm * 0.20 * 10) / 10))

  useEffect(() => {
    if (svgRef.current && barcodeValue) {
      renderBarcodeSvg(svgRef.current, barcodeValue, {
        width: barcodeBarWidth,
        height: barcodeHeightPx,
        fontSize: barcodeFontSize,
        font: 'Arial, sans-serif',
        margin: 0,
        textMargin: 1.5,
        displayValue: true,
      })
    }
  }, [barcodeValue, widthMm, heightMm, barcodeHeightPx, barcodeBarWidth, barcodeFontSize])

  const fullTitle = `${productName}${variantName ? ` (${variantName})` : ''}`

  return (
    <div
      className="barcode-sticker-box bg-white text-black border border-gray-300 rounded flex flex-col justify-between items-center text-center shadow-sm select-none transition-all"
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        maxWidth: `${widthMm}mm`,
        maxHeight: `${heightMm}mm`,
        padding: isSmall ? '0.6mm 1.2mm' : isLarge ? '1.5mm 2.2mm' : '1.0mm 1.6mm',
        boxSizing: 'border-box',
        overflow: 'hidden',
        pageBreakInside: 'avoid',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Brand & Product Header */}
      <div className="w-full flex flex-col items-center leading-none shrink-0">
        <div
          className="font-black tracking-wider text-[#0A0A0A] uppercase truncate max-w-full"
          style={{ fontSize: isSmall ? '7.5px' : isLarge ? '11px' : '9px' }}
        >
          {storeName}
        </div>
        <div
          className="font-bold text-gray-900 truncate max-w-full leading-tight"
          style={{
            fontSize: isSmall ? '6.5px' : isLarge ? '9.5px' : '8px',
            marginTop: '0.3mm',
          }}
        >
          {fullTitle}
        </div>
      </div>

      {/* Barcode Graphic Box */}
      <div
        className="w-full flex-1 flex justify-center items-center overflow-hidden"
        style={{ margin: '0.4mm 0', minHeight: 0 }}
      >
        <svg ref={svgRef} className="max-w-[98%] max-h-full h-auto" />
      </div>

      {/* Pricing Footer */}
      <div
        className="w-full flex items-center justify-between px-0.5 border-t border-black leading-none shrink-0"
        style={{
          paddingTop: isSmall ? '0.4mm' : '0.6mm',
        }}
      >
        {mrp && mrp > price ? (
          <span className="text-gray-500 line-through" style={{ fontSize: isSmall ? '6px' : isLarge ? '8.5px' : '7.5px' }}>
            MRP {formatCurrency(mrp)}
          </span>
        ) : (
          <span className="text-gray-600 font-bold" style={{ fontSize: isSmall ? '6px' : isLarge ? '8.5px' : '7px' }}>
            CHAJI RETAIL
          </span>
        )}
        <span
          className="font-black text-black"
          style={{ fontSize: isSmall ? '8.5px' : isLarge ? '12px' : '10px' }}
        >
          {formatCurrency(price)}
        </span>
      </div>
    </div>
  )
}
