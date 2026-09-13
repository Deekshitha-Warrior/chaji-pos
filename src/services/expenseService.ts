import { isSupabaseConfigured, supabase } from '../lib/supabase'

export interface ExpenseRecord {
  id: string
  expense_date: string // YYYY-MM-DD
  category_id: number | null
  category_name: string
  amount: number
  description: string
  payment_mode?: string
  recorded_by_name?: string
  created_at: string
  updated_at?: string
}

export interface ExpenseCategory {
  id: number
  name: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export interface ExpenseSummaryMetrics {
  today: number
  this_week: number
  this_month: number
  this_year: number
  total_all_time: number
}

export interface ExpenseFilterPayload {
  fromDate?: string
  toDate?: string
  categoryId?: number | string
}

const STORAGE_EXPENSES_KEY = 'chaji_expenses_records_v1'
const LEGACY_STORAGE_EXPENSES_KEY = 'clad_expenses_records_v1'
const STORAGE_CATEGORIES_KEY = 'chaji_expense_categories_v1'
const LEGACY_STORAGE_CATEGORIES_KEY = 'clad_expense_categories_v1'

// Default starter categories
export const DEFAULT_EXPENSE_CATEGORIES: string[] = [
  'Maintenance',
  'Marketing',
  'Other',
  'Rent',
  'Salaries',
  'Supplies',
]

// Track remote schema availability to prevent continuous 404 network spam
let remoteExpensesAvailable: boolean | null = null
let remoteCategoriesAvailable: boolean | null = null

const loadLocalExpenses = (): ExpenseRecord[] => {
  try {
    const raw = localStorage.getItem(STORAGE_EXPENSES_KEY) || localStorage.getItem(LEGACY_STORAGE_EXPENSES_KEY)
    return raw ? (JSON.parse(raw) as ExpenseRecord[]) : []
  } catch {
    return []
  }
}

const saveLocalExpenses = (records: ExpenseRecord[]) => {
  try {
    localStorage.setItem(STORAGE_EXPENSES_KEY, JSON.stringify(records))
  } catch (err) {
    console.warn('Failed to save expenses to localStorage:', err)
  }
}

const loadLocalCategories = (): ExpenseCategory[] => {
  try {
    const raw = localStorage.getItem(STORAGE_CATEGORIES_KEY) || localStorage.getItem(LEGACY_STORAGE_CATEGORIES_KEY)
    if (raw) return JSON.parse(raw) as ExpenseCategory[]
  } catch {
    // fallback
  }
  const defaults = DEFAULT_EXPENSE_CATEGORIES.map((name, idx) => ({
    id: idx + 1,
    name,
    is_active: true,
  }))
  saveLocalCategories(defaults)
  return defaults
}

const saveLocalCategories = (cats: ExpenseCategory[]) => {
  try {
    localStorage.setItem(STORAGE_CATEGORIES_KEY, JSON.stringify(cats))
  } catch (err) {
    console.warn('Failed to save categories to localStorage:', err)
  }
}

function calculateMetricsFromList(expenses: ExpenseRecord[]): ExpenseSummaryMetrics {
  const todayStr = new Date().toISOString().slice(0, 10)
  const now = new Date()
  const dayOfWeek = (now.getDay() + 6) % 7 // Monday = 0
  const monday = new Date(now)
  monday.setDate(now.getDate() - dayOfWeek)
  const weekStartStr = monday.toISOString().slice(0, 10)
  const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const yearStartStr = `${now.getFullYear()}-01-01`

  let today = 0
  let this_week = 0
  let this_month = 0
  let this_year = 0
  let total_all_time = 0

  for (const exp of expenses) {
    const amt = Number(exp.amount) || 0
    total_all_time += amt
    if (exp.expense_date === todayStr) today += amt
    if (exp.expense_date >= weekStartStr && exp.expense_date <= todayStr) this_week += amt
    if (exp.expense_date >= monthStartStr && exp.expense_date <= todayStr) this_month += amt
    if (exp.expense_date >= yearStartStr && exp.expense_date <= todayStr) this_year += amt
  }

  return { today, this_week, this_month, this_year, total_all_time }
}

export const expenseService = {
  // 1. Fetch KPI Metrics
  async getMetrics(): Promise<ExpenseSummaryMetrics> {
    if (isSupabaseConfigured && remoteExpensesAvailable !== false) {
      try {
        const { data, error } = await supabase.rpc('get_expense_summary_metrics')
        if (!error && data) {
          remoteExpensesAvailable = true
          return {
            today: Number(data.today) || 0,
            this_week: Number(data.this_week) || 0,
            this_month: Number(data.this_month) || 0,
            this_year: Number(data.this_year) || 0,
            total_all_time: Number(data.total_all_time) || 0,
          }
        }
        if (error && (error.code === 'PGRST202' || error.code === 'PGRST205' || error.message?.includes('not find'))) {
          // Table/RPC not in schema cache
          remoteExpensesAvailable = false
        }
      } catch {
        remoteExpensesAvailable = false
      }
    }

    // Direct local / remote list fallback
    const list = await this.getExpenses()
    return calculateMetricsFromList(list)
  },

  // 2. Fetch Expenses with Date Filtering
  async getExpenses(filters?: ExpenseFilterPayload): Promise<ExpenseRecord[]> {
    if (isSupabaseConfigured && remoteExpensesAvailable !== false) {
      try {
        let query = supabase
          .from('expenses')
          .select('*')
          .order('expense_date', { ascending: false })
          .order('created_at', { ascending: false })

        if (filters?.fromDate) {
          query = query.gte('expense_date', filters.fromDate)
        }
        if (filters?.toDate) {
          query = query.lte('expense_date', filters.toDate)
        }
        if (filters?.categoryId && filters.categoryId !== 'all') {
          const catNum = Number(filters.categoryId)
          if (!Number.isNaN(catNum) && catNum > 0) {
            query = query.eq('category_id', catNum)
          } else {
            query = query.ilike('category_name', String(filters.categoryId))
          }
        }

        const { data, error } = await query
        if (!error && data) {
          remoteExpensesAvailable = true
          // Update local backup
          if (!filters?.fromDate && !filters?.toDate && (!filters?.categoryId || filters.categoryId === 'all')) {
            saveLocalExpenses(data as ExpenseRecord[])
          }
          return data as ExpenseRecord[]
        }
        if (error && (error.code === 'PGRST205' || error.message?.includes('not find'))) {
          remoteExpensesAvailable = false
        }
      } catch {
        remoteExpensesAvailable = false
      }
    }

    // Local Storage Filter
    let local = loadLocalExpenses()
    if (filters?.fromDate) {
      local = local.filter((e) => e.expense_date >= filters.fromDate!)
    }
    if (filters?.toDate) {
      local = local.filter((e) => e.expense_date <= filters.toDate!)
    }
    if (filters?.categoryId && filters.categoryId !== 'all') {
      local = local.filter(
        (e) =>
          String(e.category_id) === String(filters.categoryId) ||
          e.category_name.toLowerCase() === String(filters.categoryId).toLowerCase()
      )
    }

    return local.sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime())
  },

  // 3. Record a New Expense
  async createExpense(payload: {
    expense_date: string
    category_id: number | null
    category_name: string
    amount: number
    description?: string
    payment_mode?: string
    recorded_by_name?: string
  }): Promise<ExpenseRecord> {
    const newRecord: ExpenseRecord = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `exp_${Date.now()}`,
      expense_date: payload.expense_date,
      category_id: payload.category_id || null,
      category_name: payload.category_name.trim(),
      amount: Math.max(0.01, payload.amount),
      description: (payload.description || '').trim(),
      payment_mode: payload.payment_mode || 'cash',
      recorded_by_name: payload.recorded_by_name || 'Staff',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (isSupabaseConfigured && remoteExpensesAvailable !== false) {
      try {
        const { data, error } = await supabase
          .from('expenses')
          .insert({
            expense_date: newRecord.expense_date,
            category_id: newRecord.category_id,
            category_name: newRecord.category_name,
            amount: newRecord.amount,
            description: newRecord.description,
            payment_mode: newRecord.payment_mode,
            recorded_by_name: newRecord.recorded_by_name,
          })
          .select()
          .single()

        if (!error && data) {
          remoteExpensesAvailable = true
          const local = loadLocalExpenses()
          saveLocalExpenses([data as ExpenseRecord, ...local])
          return data as ExpenseRecord
        }
        if (error && (error.code === 'PGRST205' || error.message?.includes('not find'))) {
          remoteExpensesAvailable = false
        }
      } catch {
        remoteExpensesAvailable = false
      }
    }

    // Save to local storage
    const current = loadLocalExpenses()
    const updated = [newRecord, ...current]
    saveLocalExpenses(updated)
    return newRecord
  },

  // 3b. Update an Expense
  async updateExpense(
    id: string,
    payload: {
      expense_date?: string
      category_id?: number | null
      category_name?: string
      amount?: number
      description?: string
      payment_mode?: string
    }
  ): Promise<ExpenseRecord> {
    const updatedAt = new Date().toISOString()
    if (isSupabaseConfigured && remoteExpensesAvailable !== false) {
      try {
        const { data, error } = await supabase
          .from('expenses')
          .update({
            ...(payload.expense_date !== undefined && { expense_date: payload.expense_date }),
            ...(payload.category_id !== undefined && { category_id: payload.category_id }),
            ...(payload.category_name !== undefined && { category_name: payload.category_name }),
            ...(payload.amount !== undefined && { amount: payload.amount }),
            ...(payload.description !== undefined && { description: payload.description }),
            ...(payload.payment_mode !== undefined && { payment_mode: payload.payment_mode }),
            updated_at: updatedAt,
          })
          .eq('id', id)
          .select()
          .single()

        if (!error && data) {
          remoteExpensesAvailable = true
          const local = loadLocalExpenses()
          const updated = local.map((e) => (e.id === id ? (data as ExpenseRecord) : e))
          saveLocalExpenses(updated)
          return data as ExpenseRecord
        }
        if (error && (error.code === 'PGRST205' || error.message?.includes('not find'))) {
          remoteExpensesAvailable = false
        }
      } catch {
        remoteExpensesAvailable = false
      }
    }

    // Update in local storage
    const current = loadLocalExpenses()
    let updatedRecord: ExpenseRecord | null = null
    const updated = current.map((e) => {
      if (e.id === id) {
        updatedRecord = {
          ...e,
          ...payload,
          updated_at: updatedAt,
        }
        return updatedRecord
      }
      return e
    })
    saveLocalExpenses(updated)
    if (!updatedRecord) {
      throw new Error('Expense record not found')
    }
    return updatedRecord
  },

  // 4. Delete an Expense
  async deleteExpense(id: string): Promise<void> {
    if (isSupabaseConfigured && remoteExpensesAvailable !== false) {
      try {
        const { error } = await supabase.from('expenses').delete().eq('id', id)
        if (!error) {
          remoteExpensesAvailable = true
        } else if (error.code === 'PGRST205' || error.message?.includes('not find')) {
          remoteExpensesAvailable = false
        }
      } catch {
        remoteExpensesAvailable = false
      }
    }

    const current = loadLocalExpenses()
    const filtered = current.filter((e) => e.id !== id)
    saveLocalExpenses(filtered)
  },

  // 5. Category Operations
  async getCategories(): Promise<ExpenseCategory[]> {
    if (isSupabaseConfigured && remoteCategoriesAvailable !== false) {
      try {
        const { data, error } = await supabase
          .from('expense_categories')
          .select('*')
          .order('name', { ascending: true })

        if (!error && data && data.length > 0) {
          remoteCategoriesAvailable = true
          saveLocalCategories(data as ExpenseCategory[])
          return data as ExpenseCategory[]
        }
        if (error && (error.code === 'PGRST205' || error.message?.includes('not find'))) {
          remoteCategoriesAvailable = false
        }
      } catch {
        remoteCategoriesAvailable = false
      }
    }

    return loadLocalCategories()
  },

  async createCategory(name: string): Promise<ExpenseCategory> {
    const cleanName = name.trim()
    if (!cleanName) throw new Error('Category name cannot be empty')

    if (isSupabaseConfigured && remoteCategoriesAvailable !== false) {
      try {
        const { data, error } = await supabase
          .from('expense_categories')
          .insert({ name: cleanName, is_active: true })
          .select()
          .single()

        if (!error && data) {
          remoteCategoriesAvailable = true
          const local = loadLocalCategories()
          saveLocalCategories([...local, data as ExpenseCategory])
          return data as ExpenseCategory
        }
        if (error && (error.code === 'PGRST205' || error.message?.includes('not find'))) {
          remoteCategoriesAvailable = false
        }
      } catch {
        remoteCategoriesAvailable = false
      }
    }

    const local = loadLocalCategories()
    const newCat: ExpenseCategory = {
      id: Date.now(),
      name: cleanName,
      is_active: true,
      created_at: new Date().toISOString(),
    }
    saveLocalCategories([...local, newCat])
    return newCat
  },

  async deleteCategory(id: number): Promise<void> {
    if (isSupabaseConfigured && remoteCategoriesAvailable !== false) {
      try {
        const { error } = await supabase
          .from('expense_categories')
          .delete()
          .eq('id', id)

        if (!error) {
          remoteCategoriesAvailable = true
        } else if (error.code === 'PGRST205' || error.message?.includes('not find')) {
          remoteCategoriesAvailable = false
        }
      } catch {
        remoteCategoriesAvailable = false
      }
    }

    const local = loadLocalCategories()
    const filtered = local.filter((c) => c.id !== id)
    saveLocalCategories(filtered)
  },

  async updateCategory(id: number, name: string): Promise<ExpenseCategory> {
    const cleanName = name.trim()
    if (!cleanName) throw new Error('Category name cannot be empty')

    if (isSupabaseConfigured && remoteCategoriesAvailable !== false) {
      try {
        const { data, error } = await supabase
          .from('expense_categories')
          .update({ name: cleanName, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single()

        if (!error && data) {
          remoteCategoriesAvailable = true
          const local = loadLocalCategories()
          const updated = local.map((c) => (c.id === id ? (data as ExpenseCategory) : c))
          saveLocalCategories(updated)
          return data as ExpenseCategory
        }
        if (error && (error.code === 'PGRST205' || error.message?.includes('not find'))) {
          remoteCategoriesAvailable = false
        }
      } catch {
        remoteCategoriesAvailable = false
      }
    }

    const local = loadLocalCategories()
    let updatedCat: ExpenseCategory = { id, name: cleanName, is_active: true }
    const updated = local.map((c) => {
      if (c.id === id) {
        updatedCat = { ...c, name: cleanName, updated_at: new Date().toISOString() }
        return updatedCat
      }
      return c
    })
    saveLocalCategories(updated)
    return updatedCat
  },
}

// 6. CSV Ledger Export Utility
export function exportExpensesToCSV(expenses: ExpenseRecord[]): void {
  const headers = ['Date', 'Category', 'Description', 'Amount (INR)', 'Recorded By']
  const rows = expenses.map((e) => [
    e.expense_date,
    `"${(e.category_name || 'Uncategorized').replace(/"/g, '""')}"`,
    `"${(e.description || '').replace(/"/g, '""')}"`,
    Number(e.amount || 0).toFixed(2),
    `"${(e.recorded_by_name || 'Staff').replace(/"/g, '""')}"`,
  ])

  const csvContent =
    'data:text/csv;charset=utf-8,\uFEFF' +
    [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  const link = document.createElement('a')
  link.href = encodeURI(csvContent)
  link.download = `CHAJI-Expenses-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
