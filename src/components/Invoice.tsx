import React from 'react'
import { BRAND_ADDRESS, BRAND_EMAIL, BRAND_EN, BRAND_INSTAGRAM, BRAND_PRIMARY_PHONE_DISPLAY, BRAND_ICON } from '../lib/brand'
import { formatCurrency, formatQuantityDisplay, normalizeStructuredOrderItem, formatInvoiceNo } from '../lib/retail'

export interface InvoiceItem {
  id: string | number
  name: string
  nameTa?: string
  qty: number
  quantity?: number
  unit?: string
  unit_type?: 'unit' | 'piece' | 'weight' | 'volume' | 'bundle'
  base_quantity?: number
  base_price?: number
  price: number
  offerPrice?: number | null
  line_total?: number
  lineTotal?: number
}

export interface InvoiceProps {
  invoiceNo: string
  date: string
  customerName?: string
  phone?: string
  address?: string
  items: InvoiceItem[]
  subtotal: number
  shipping?: number
  deliveryCharge?: number
  discountAmount?: number
  manualDiscountAmount?: number
  gstAmount?: number
  couponCode?: string
  total: number
  status?: string
  userId?: string
  paymentMode?: string
  onPrintReceipt?: () => void
}

export const Invoice: React.FC<InvoiceProps> = ({
  invoiceNo,
  date,
  customerName,
  phone,
  address,
  items,
  subtotal,
  shipping = 0,
  deliveryCharge = 0,
  discountAmount = 0,
  manualDiscountAmount = 0,
  gstAmount = 0,
  couponCode,
  total,
  status = 'completed',
  userId,
  paymentMode,
}) => {
  const formattedInvoiceNo = formatInvoiceNo(invoiceNo)
  const dateStr = (() => {
    try { return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
    catch { return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
  })()

  const statusColor = status === 'completed' ? '#D4AF37' : status === 'cancelled' ? '#dc2626' : '#d97706'
  const effectiveDelivery = deliveryCharge || shipping

  return (
    <div
      id="invoice-print-root"
      className="w-full max-w-[680px] mx-auto bg-white text-[#111111] box-border flex flex-col p-4 sm:p-8 print:p-0 print:max-w-full overflow-hidden border border-[#E8D399]/40 shadow-xl rounded-3xl min-h-[960px] print:min-h-[290mm]"
      style={{
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        minHeight: '960px',
      }}
    >
      {/* ── HEADER ────────────────────────────────────────────────── */}
      <div className="invoice-header" style={{ textAlign: 'center', borderBottom: '1px solid #E8D399', paddingBottom: 20, marginBottom: 20 }}>
        <div style={{ width: 64, height: 64, margin: '0 auto 10px auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={BRAND_ICON} alt={BRAND_EN} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <div style={{ fontSize: 24, fontWeight: 900, color: '#0A0A0A', letterSpacing: 2, textTransform: 'uppercase' }}>
          {BRAND_EN}
        </div>
        <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4, fontWeight: 500, paddingLeft: 8, paddingRight: 8 }}>
          {BRAND_ADDRESS}
        </div>
        <div style={{ fontSize: 11, color: '#4b5563', marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>📞 {BRAND_PRIMARY_PHONE_DISPLAY}</span>
          <span>✉️ {BRAND_EMAIL}</span>
          <span>📷 @{BRAND_INSTAGRAM}</span>
        </div>
      </div>

      {/* ── META ROW (Properly partitioned bill details) ─────────── */}
      <div className="invoice-meta grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div style={{ minWidth: 0, padding: '12px 14px', borderRadius: 12, background: '#FBFAF6', border: '1px solid #E8D399' }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Bill Details</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#666', textTransform: 'uppercase' }}>Invoice No</span>
            <span style={{ fontSize: 13, fontWeight: 900, color: '#0A0A0A' }}>#{formattedInvoiceNo}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#666', textTransform: 'uppercase' }}>Date</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{dateStr}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#666', textTransform: 'uppercase' }}>Status</span>
            <span
              style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: 99,
                background: statusColor + '18', color: statusColor,
                fontSize: 9, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', border: `1px solid ${statusColor}40`
              }}
            >
              {status}
            </span>
          </div>
          {userId && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: '#888', textTransform: 'uppercase' }}>User ID</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#555' }}>{userId}</span>
            </div>
          )}
        </div>

        <div style={{ minWidth: 0, padding: '12px 14px', borderRadius: 12, background: '#FBFAF6', border: '1px solid #E8D399', overflowWrap: 'anywhere' }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Customer Information</div>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 4 }}>Customer Name</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0A0A0A', lineHeight: 1.35, wordBreak: 'break-word' }}>{customerName || 'Walk-in Customer'}</div>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 6 }}>Mobile Number</div>
          <div style={{ fontSize: 12, color: '#555', lineHeight: 1.4, wordBreak: 'break-word' }}>{phone || '—'}</div>
          {address && <div style={{ fontSize: 11, color: '#777', marginTop: 4, lineHeight: 1.4, wordBreak: 'break-word' }}>{address}</div>}
          {paymentMode && <div style={{ fontSize: 10, color: '#777', marginTop: 4 }}>Payment Mode: {paymentMode}</div>}
        </div>
      </div>

      {/* ── DIVIDER ──────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px dashed #d0d0d0', marginBottom: 20 }} />

      {/* ── ITEMS TABLE ──────────────────────────────────────────── */}
      <div className="w-full overflow-x-auto">
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
          <thead>
            <tr style={{ background: '#0A0A0A', borderRadius: 8 }}>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#D4AF37', textTransform: 'uppercase', letterSpacing: 0.8, width: 28 }}>#</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#D4AF37', textTransform: 'uppercase', letterSpacing: 0.8 }}>Item / SKU</th>
              <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10, fontWeight: 800, color: '#D4AF37', textTransform: 'uppercase', letterSpacing: 0.8, width: 45 }}>Qty</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, fontWeight: 800, color: '#D4AF37', textTransform: 'uppercase', letterSpacing: 0.8, width: 75 }}>Rate</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, fontWeight: 800, color: '#D4AF37', textTransform: 'uppercase', letterSpacing: 0.8, width: 85 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const normalized = normalizeStructuredOrderItem(item as unknown as Record<string, unknown>)
              const displayName = normalized.tamil_name || item.nameTa || normalized.name
              return (
                <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '10px 8px', fontSize: 11, color: '#999', verticalAlign: 'top' }}>{idx + 1}</td>
                  <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0A0A0A' }}>{normalized.name}</div>
                    {displayName && displayName !== normalized.name && <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{displayName}</div>}
                    {item.offerPrice && item.price !== item.offerPrice && (
                      <div style={{ fontSize: 10, color: '#aaa', textDecoration: 'line-through', marginTop: 2 }}>MRP ₹{item.price}</div>
                    )}
                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                      {normalized.unit} · {formatCurrency(normalized.base_price)}
                    </div>
                  </td>
                  <td style={{ padding: '10px 8px', fontSize: 12, fontWeight: 600, textAlign: 'center', verticalAlign: 'top' }}>{formatQuantityDisplay(normalized.quantity, normalized.unit, normalized.unit_type)}</td>
                  <td style={{ padding: '10px 8px', fontSize: 12, fontWeight: 600, textAlign: 'right', verticalAlign: 'top', color: '#555', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(normalized.base_price)}</td>
                  <td style={{ padding: '10px 8px', fontSize: 13, fontWeight: 800, textAlign: 'right', verticalAlign: 'top', color: '#0A0A0A', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(normalized.line_total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── TOTALS ───────────────────────────────────────────────── */}
      <div className="invoice-totals" style={{ marginTop: 24, borderTop: '2px solid #D4AF37', paddingTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ minWidth: 240, width: '100%', maxWidth: 300 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: '#666' }}>Subtotal</span>
              <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#B48811' }}>
                  Coupon{couponCode ? ` (${couponCode})` : ''}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#B48811', fontVariantNumeric: 'tabular-nums' }}>−{formatCurrency(discountAmount)}</span>
              </div>
            )}
            {manualDiscountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#B48811' }}>Manual Discount</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#B48811', fontVariantNumeric: 'tabular-nums' }}>−{formatCurrency(manualDiscountAmount)}</span>
              </div>
            )}
            {gstAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#666' }}>GST</span>
                <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>+{formatCurrency(gstAmount)}</span>
              </div>
            )}
            {effectiveDelivery > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#666' }}>Delivery</span>
                <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(effectiveDelivery)}</span>
              </div>
            )}
            <div
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderTop: '2px solid #D4AF37', paddingTop: 10, marginTop: 4,
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 900, color: '#0A0A0A', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: '#0A0A0A', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <div
        className="invoice-footer mt-auto"
        style={{
          marginTop: 'auto',
          paddingTop: 16,
          paddingBottom: 4,
          borderTop: '1px dashed #d0d0d0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: '#0A0A0A', letterSpacing: 0.5 }}>
          Thank you for shopping at CHAJI MENS WEAR!
        </div>
        <div style={{ fontSize: 10, color: '#666', marginTop: 3, fontWeight: 500 }}>
          Follow us on Instagram: @{BRAND_INSTAGRAM}
        </div>
      </div>
    </div>
  )
}
