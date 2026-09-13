import { isSupabaseConfigured, supabase } from '../lib/supabase'

export type AdvanceStatus = 'pending_deposit' | 'ready_for_delivery' | 'waiting_final_payment' | 'completed' | 'cancelled'
export type AdvancePaymentMethod = 'cash' | 'upi' | 'card'

export type AdvanceOrder = {
  id: string
  deposit_id: string
  customer_name: string
  phone: string
  address: string
  product_name: string
  products: Array<Record<string, unknown>>
  category: string
  description: string
  total_amount: number
  deposit_amount: number
  remaining_balance: number
  expected_delivery_date: string
  status: AdvanceStatus
  remarks: string
  reference_number: string
  created_by_name: string
  created_at: string
  updated_at: string
  completed_at: string | null
  completed_order_id: string | null
  invoice_number: string | null
  final_payment_method: string | null
}

export type AdvanceTimeline = { id: number; advance_order_id: string; event_type: string; label: string; remarks: string; created_at: string }
export type AdvancePayment = { id: string; advance_order_id: string; payment_type: 'deposit' | 'remaining'; amount: number; payment_method: string; remarks: string; received_at: string }

const STORAGE_ORDERS_KEY = 'purple_boutique_advance_orders_v1'
const STORAGE_TIMELINE_KEY = 'purple_boutique_advance_timeline_v1'
const STORAGE_PAYMENTS_KEY = 'purple_boutique_advance_payments_v1'

const loadLocalOrders = (): AdvanceOrder[] => {
  try {
    const raw = localStorage.getItem(STORAGE_ORDERS_KEY)
    return raw ? (JSON.parse(raw) as AdvanceOrder[]) : []
  } catch {
    return []
  }
}

const saveLocalOrders = (orders: AdvanceOrder[]) => {
  try {
    localStorage.setItem(STORAGE_ORDERS_KEY, JSON.stringify(orders))
  } catch { /* ignore */ }
}

const loadLocalTimeline = (): AdvanceTimeline[] => {
  try {
    const raw = localStorage.getItem(STORAGE_TIMELINE_KEY)
    return raw ? (JSON.parse(raw) as AdvanceTimeline[]) : []
  } catch {
    return []
  }
}

const saveLocalTimeline = (timeline: AdvanceTimeline[]) => {
  try {
    localStorage.setItem(STORAGE_TIMELINE_KEY, JSON.stringify(timeline))
  } catch { /* ignore */ }
}

const loadLocalPayments = (): AdvancePayment[] => {
  try {
    const raw = localStorage.getItem(STORAGE_PAYMENTS_KEY)
    return raw ? (JSON.parse(raw) as AdvancePayment[]) : []
  } catch {
    return []
  }
}

const saveLocalPayments = (payments: AdvancePayment[]) => {
  try {
    localStorage.setItem(STORAGE_PAYMENTS_KEY, JSON.stringify(payments))
  } catch { /* ignore */ }
}

const normalizeOrder = (row: Record<string, unknown>): AdvanceOrder => ({
  ...row,
  id: String(row.id || ''),
  deposit_id: String(row.deposit_id || ''),
  customer_name: String(row.customer_name || ''),
  phone: String(row.phone || ''),
  address: String(row.address || ''),
  product_name: String(row.product_name || ''),
  products: Array.isArray(row.products) ? (row.products as Array<Record<string, unknown>>) : [],
  category: String(row.category || ''),
  description: String(row.description || ''),
  total_amount: Number(row.total_amount || 0),
  deposit_amount: Number(row.deposit_amount || 0),
  remaining_balance: Number(row.remaining_balance ?? (Number(row.total_amount || 0) - Number(row.deposit_amount || 0))),
  expected_delivery_date: String(row.expected_delivery_date || ''),
  status: String(row.status || 'pending_deposit') as AdvanceStatus,
  remarks: String(row.remarks || ''),
  reference_number: String(row.reference_number || ''),
  created_by_name: String(row.created_by_name || ''),
  created_at: String(row.created_at || new Date().toISOString()),
  updated_at: String(row.updated_at || new Date().toISOString()),
  completed_at: row.completed_at ? String(row.completed_at) : null,
  completed_order_id: row.completed_order_id ? String(row.completed_order_id) : null,
  invoice_number: row.invoice_number ? String(row.invoice_number) : null,
  final_payment_method: row.final_payment_method ? String(row.final_payment_method) : null,
})

const rpcRow = (data: unknown) => (Array.isArray(data) ? data[0] : data) as Record<string, unknown>

export async function listAdvanceOrders(): Promise<AdvanceOrder[]> {
  const local = loadLocalOrders()
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('advance_orders').select('*').order('created_at', { ascending: false })
      if (error) {
        console.error('[listAdvanceOrders] Supabase error:', error.message)
      } else if (Array.isArray(data)) {
        const remote = data.map(row => normalizeOrder(row as Record<string, unknown>))
        const remoteIds = new Set(remote.map(r => r.id))
        const localOnly = local.filter(l => !remoteIds.has(l.id))
        const merged = [...remote, ...localOnly].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        saveLocalOrders(merged)
        return merged
      }
    } catch (err) { console.error('[listAdvanceOrders] Exception:', err) }
  }
  return local
}

export async function getAdvanceOrderHistory(orderId: string) {
  const localTimeline = loadLocalTimeline().filter(t => t.advance_order_id === orderId)
  const localPayments = loadLocalPayments().filter(p => p.advance_order_id === orderId)

  if (isSupabaseConfigured) {
    try {
      const [tRes, pRes] = await Promise.all([
        supabase.from('advance_order_timeline').select('*').eq('advance_order_id', orderId).order('created_at'),
        supabase.from('advance_order_payments').select('*').eq('advance_order_id', orderId).order('received_at'),
      ])
      const timeline = (tRes.data && tRes.data.length > 0) ? (tRes.data as AdvanceTimeline[]) : localTimeline
      const payments = (pRes.data && pRes.data.length > 0) ? (pRes.data as AdvancePayment[]) : localPayments
      return { timeline, payments }
    } catch { /* fallback */ }
  }
  return { timeline: localTimeline, payments: localPayments }
}

export async function createAdvanceOrder(input: {
  customerName: string; phone: string; address: string; productName: string; category: string; description: string
  totalAmount: number; depositAmount: number; expectedDeliveryDate: string; remarks: string; referenceNumber: string
  paymentMethod: AdvancePaymentMethod; createdByName: string; products?: Array<Record<string, unknown>>
}): Promise<AdvanceOrder> {
  let createdOrder: AdvanceOrder | null = null

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('create_advance_order', {
        p_customer_name: input.customerName, p_phone: input.phone, p_address: input.address, p_product_name: input.productName,
        p_category: input.category, p_description: input.description, p_total_amount: input.totalAmount,
        p_deposit_amount: input.depositAmount, p_expected_delivery_date: input.expectedDeliveryDate, p_remarks: input.remarks,
        p_payment_method: input.paymentMethod, p_created_by_name: input.createdByName, p_products: input.products || [],
      })
      if (error) {
        console.error('[createAdvanceOrder] Supabase error:', error.message)
      } else if (data) {
        createdOrder = normalizeOrder(rpcRow(data))
        // Patch reference_number (not in RPC params)
        if (input.referenceNumber.trim()) {
          await supabase.from('advance_orders').update({ reference_number: input.referenceNumber.trim() }).eq('id', createdOrder.id)
          createdOrder.reference_number = input.referenceNumber.trim()
        }
      }
    } catch (err) { console.error('[createAdvanceOrder] Exception:', err) }
  }

  if (!createdOrder) {
    const now = new Date()
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const seq = String(Math.floor(1000 + Math.random() * 9000))
    const depositId = `DEP-${ymd}-${seq}`
    const orderId = crypto.randomUUID ? crypto.randomUUID() : `adv_${Date.now()}_${Math.random().toString(36).slice(2)}`

    createdOrder = {
      id: orderId,
      deposit_id: depositId,
      customer_name: input.customerName.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      product_name: input.productName.trim(),
      products: input.products || [{ name: input.productName, category: input.category, quantity: 1, base_price: input.totalAmount, line_total: input.totalAmount }],
      category: input.category.trim(),
      description: input.description.trim(),
      total_amount: Number(input.totalAmount),
      deposit_amount: Number(input.depositAmount),
      remaining_balance: Number(input.totalAmount) - Number(input.depositAmount),
      expected_delivery_date: input.expectedDeliveryDate,
      status: 'pending_deposit',
      remarks: input.remarks.trim(),
      reference_number: input.referenceNumber.trim(),
      created_by_name: input.createdByName,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      completed_at: null,
      completed_order_id: null,
      invoice_number: null,
      final_payment_method: null,
    }

    const currentTimeline = loadLocalTimeline()
    currentTimeline.push(
      { id: Date.now(), advance_order_id: orderId, event_type: 'created', label: 'Deposit Created', remarks: input.remarks, created_at: now.toISOString() },
      { id: Date.now() + 1, advance_order_id: orderId, event_type: 'deposit_received', label: 'Deposit Received', remarks: `Received INR ${input.depositAmount} via ${input.paymentMethod.toLowerCase() === 'upi' ? 'QR' : input.paymentMethod.toUpperCase()}`, created_at: now.toISOString() }
    )
    saveLocalTimeline(currentTimeline)

    const currentPayments = loadLocalPayments()
    currentPayments.push({
      id: orderId + '_dep',
      advance_order_id: orderId,
      payment_type: 'deposit',
      amount: Number(input.depositAmount),
      payment_method: input.paymentMethod,
      remarks: input.remarks,
      received_at: now.toISOString(),
    })
    saveLocalPayments(currentPayments)
  }

  const localOrders = loadLocalOrders()
  const updated = [createdOrder, ...localOrders.filter(o => o.id !== createdOrder!.id)]
  saveLocalOrders(updated)
  return createdOrder
}

export async function updateAdvanceStatus(orderId: string, status: AdvanceStatus, remarks = ''): Promise<AdvanceOrder> {
  let updatedOrder: AdvanceOrder | null = null

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('update_advance_order_status', { p_order_id: orderId, p_status: status, p_remarks: remarks })
      if (error) {
        console.error('[updateAdvanceStatus] Supabase error:', error.message)
      } else if (data) {
        updatedOrder = normalizeOrder(rpcRow(data))
      }
    } catch (err) { console.error('[updateAdvanceStatus] Exception:', err) }
  }

  const localOrders = loadLocalOrders()
  const existing = localOrders.find(o => o.id === orderId)
  if (!updatedOrder && existing) {
    const now = new Date().toISOString()
    const label = status === 'ready_for_delivery' ? 'Ready for Delivery' : status === 'waiting_final_payment' ? 'Customer Contacted' : status === 'cancelled' ? 'Cancelled' : 'Pending Deposit'
    updatedOrder = { ...existing, status, remarks: remarks || existing.remarks, updated_at: now }

    const timeline = loadLocalTimeline()
    timeline.push({ id: Date.now(), advance_order_id: orderId, event_type: status, label, remarks, created_at: now })
    saveLocalTimeline(timeline)
  }

  if (updatedOrder) {
    saveLocalOrders(localOrders.map(o => o.id === orderId ? updatedOrder! : o))
    return updatedOrder
  }
  throw new Error('Order not found')
}

export async function addAdvanceEvent(orderId: string, eventType: string, label: string, remarks = '') {
  if (isSupabaseConfigured) {
    try {
      await supabase.rpc('add_advance_order_event', { p_order_id: orderId, p_event_type: eventType, p_label: label, p_remarks: remarks })
    } catch { /* fallback */ }
  }
  const timeline = loadLocalTimeline()
  timeline.push({ id: Date.now(), advance_order_id: orderId, event_type: eventType, label, remarks, created_at: new Date().toISOString() })
  saveLocalTimeline(timeline)
}

export async function completeAdvanceOrder(
  orderId: string, 
  paymentMethod: AdvancePaymentMethod, 
  finalAmount: number,
  couponCode: string | null = null,
  couponPercentage: number = 0,
  manualDiscountAmount: number = 0,
  remarks = ''
) {
  let result: { order_id: string; invoice_no: string; completed_at: string } | null = null

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('complete_advance_order_v2', { 
        p_order_id: orderId, 
        p_payment_method: paymentMethod,
        p_final_amount: finalAmount,
        p_coupon_code: couponCode,
        p_coupon_percentage: couponPercentage,
        p_manual_discount: manualDiscountAmount,
        p_remarks: remarks 
      })
      if (error) {
        throw new Error(error.message || JSON.stringify(error))
      }
      if (data) {
        const row = Array.isArray(data) ? data[0] : data
        result = row as { order_id: string; invoice_no: string; completed_at: string }
      }
    } catch (err: unknown) {
      alert(`Supabase Backend Error: ${err instanceof Error ? err.message : String(err)}`)
      throw err
    }
  }

  const localOrders = loadLocalOrders()
  const order = localOrders.find(o => o.id === orderId)
  const now = new Date().toISOString()

  if (!result) {
    const seq = String(Math.floor(10000000 + Math.random() * 89999999))
    const invoiceNo = `INV${seq}`
    const completedOrderId = crypto.randomUUID ? crypto.randomUUID() : `ord_${Date.now()}_${Math.random().toString(36).slice(2)}`
    result = { order_id: completedOrderId, invoice_no: invoiceNo, completed_at: now }
  }

  if (order) {
    const updatedOrder: AdvanceOrder = {
      ...order,
      status: 'completed',
      completed_at: result.completed_at,
      completed_order_id: result.order_id,
      invoice_number: result.invoice_no,
      final_payment_method: paymentMethod,
      remarks: remarks || order.remarks,
      updated_at: now,
    }
    saveLocalOrders(localOrders.map(o => o.id === orderId ? updatedOrder : o))

    const timeline = loadLocalTimeline()
    timeline.push(
      { id: Date.now(), advance_order_id: orderId, event_type: 'remaining_payment_received', label: 'Final Payment Received', remarks, created_at: now },
      { id: Date.now() + 1, advance_order_id: orderId, event_type: 'delivered', label: 'Delivered', remarks, created_at: now },
      { id: Date.now() + 2, advance_order_id: orderId, event_type: 'revenue_posted', label: `Revenue Posted (INR ${order.total_amount})`, remarks, created_at: now },
      { id: Date.now() + 3, advance_order_id: orderId, event_type: 'invoice_generated', label: `Invoice Generated (${result.invoice_no})`, remarks, created_at: now }
    )
    saveLocalTimeline(timeline)

    const payments = loadLocalPayments()
    payments.push({
      id: orderId + '_rem',
      advance_order_id: orderId,
      payment_type: 'remaining',
      amount: order.remaining_balance,
      payment_method: paymentMethod,
      remarks,
      received_at: now,
    })
    saveLocalPayments(payments)
  }

  return result!
}
