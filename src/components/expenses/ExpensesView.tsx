import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Download,
  Plus,
  Trash2,
  Calendar,
  Receipt,
  RefreshCw,
  TrendingDown,
  Layers,
  Search,
  X,
  Filter,
  ChevronDown,
  SlidersHorizontal,
  Edit2,
} from 'lucide-react'
import {
  expenseService,
  exportExpensesToCSV,
  type ExpenseCategory,
  type ExpenseRecord,
  type ExpenseSummaryMetrics,
} from '../../services/expenseService'
import { RecordExpenseModal } from './RecordExpenseModal'
import { ExpenseCategoriesView } from './ExpenseCategoriesView'

export const ExpensesView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'expenses' | 'categories'>('expenses')
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null)

  // Metrics
  const [metrics, setMetrics] = useState<ExpenseSummaryMetrics>({
    today: 0,
    this_week: 0,
    this_month: 0,
    this_year: 0,
    total_all_time: 0,
  })

  // Data & Categories
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(false)

  // Filters
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [activePreset, setActivePreset] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all')
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)

  const loadMetrics = useCallback(async () => {
    try {
      const data = await expenseService.getMetrics()
      setMetrics(data)
    } catch (err) {
      console.warn('Failed to load expense metrics:', err)
    }
  }, [])

  const loadCategories = useCallback(async () => {
    try {
      const cats = await expenseService.getCategories()
      setCategories(cats)
    } catch (err) {
      console.warn('Failed to load categories:', err)
    }
  }, [])

  const loadExpenses = useCallback(async () => {
    setLoading(true)
    try {
      const data = await expenseService.getExpenses({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        categoryId: selectedCategoryId !== 'all' ? selectedCategoryId : undefined,
      })
      setExpenses(data)
    } catch (err) {
      console.error('Failed to load expenses:', err)
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate, selectedCategoryId])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadMetrics(), loadCategories(), loadExpenses()])
  }, [loadMetrics, loadCategories, loadExpenses])

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  // Calculate count of active filters (excluding keyword search)
  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (selectedCategoryId !== 'all') count++
    if (activePreset !== 'all') count++
    if (selectedPaymentMode !== 'all') count++
    return count
  }, [selectedCategoryId, activePreset, selectedPaymentMode])

  // Filter expenses list by search query and payment mode
  const filteredExpenses = useMemo(() => {
    let list = expenses
    if (selectedPaymentMode !== 'all') {
      list = list.filter((e) => e.payment_mode?.toLowerCase() === selectedPaymentMode.toLowerCase())
    }
    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase().trim()
    return list.filter(
      (e) =>
        e.description?.toLowerCase().includes(q) ||
        e.category_name?.toLowerCase().includes(q) ||
        e.payment_mode?.toLowerCase().includes(q) ||
        e.recorded_by_name?.toLowerCase().includes(q) ||
        String(e.amount).includes(q)
    )
  }, [expenses, searchQuery, selectedPaymentMode])

  // Handle Preset Clicks (Synchronizes FROM and TO dates)
  const applyDatePreset = (preset: 'all' | 'today' | 'week' | 'month' | 'custom') => {
    setActivePreset(preset)
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)

    if (preset === 'all') {
      setFromDate('')
      setToDate('')
    } else if (preset === 'today') {
      setFromDate(todayStr)
      setToDate(todayStr)
    } else if (preset === 'week') {
      const dayOfWeek = (today.getDay() + 6) % 7
      const monday = new Date(today)
      monday.setDate(today.getDate() - dayOfWeek)
      setFromDate(monday.toISOString().slice(0, 10))
      setToDate(todayStr)
    } else if (preset === 'month') {
      const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
      setFromDate(monthStart)
      setToDate(todayStr)
    } else if (preset === 'custom') {
      setShowAdvancedFilters(true)
    }
  }

  const resetAllFilters = () => {
    setFromDate('')
    setToDate('')
    setActivePreset('all')
    setSelectedCategoryId('all')
    setSelectedPaymentMode('all')
    setSearchQuery('')
    setShowAdvancedFilters(false)
  }


  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('Delete this expense record?')) return
    try {
      await expenseService.deleteExpense(id)
      setExpenses((prev) => prev.filter((e) => e.id !== id))
      void loadMetrics()
    } catch (err) {
      console.error('Failed to delete expense:', err)
      alert('Could not delete expense record')
    }
  }

  const handleExpenseSaved = (savedExpense: ExpenseRecord) => {
    setExpenses((prev) => {
      const exists = prev.some((e) => e.id === savedExpense.id)
      if (exists) {
        return prev.map((e) => (e.id === savedExpense.id ? savedExpense : e))
      }
      return [savedExpense, ...prev]
    })
    setIsRecordModalOpen(false)
    setEditingExpense(null)
    void loadMetrics()
  }

  const handleEditExpense = (exp: ExpenseRecord) => {
    setEditingExpense(exp)
    setIsRecordModalOpen(true)
  }

  const formatCurrencyValue = (val: number) => {
    return `₹ ${Number(val || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Tab Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#0A0A0A] flex items-center gap-2">
            <Receipt size={22} className="text-[#D4AF37]" />
            Expense Tracker
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-0.5">
            Monitor store overheads, operating costs, and categorized expenses
          </p>
        </div>

        {/* View Switch Pills */}
        <div className="flex items-center gap-2 bg-[#FBFAF6] p-1.5 rounded-2xl border border-[#E8D399]">
          <button
            type="button"
            onClick={() => setActiveTab('expenses')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'expenses'
                ? 'bg-[#0A0A0A] text-[#D4AF37] shadow-sm'
                : 'text-gray-700 hover:text-black'
            }`}
          >
            Expenses
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('categories')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'categories'
                ? 'bg-[#0A0A0A] text-[#D4AF37] shadow-sm'
                : 'text-gray-700 hover:text-black'
            }`}
          >
            Categories
          </button>
        </div>
      </div>

      {activeTab === 'categories' ? (
        <ExpenseCategoriesView
          categories={categories}
          onCategoriesUpdated={() => {
            void loadCategories()
            void loadExpenses()
          }}
        />
      ) : (
        <div className="space-y-6">
          {/* 5 KPI Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {[
              { label: 'Today', value: metrics.today },
              { label: 'This Week', value: metrics.this_week },
              { label: 'This Month', value: metrics.this_month },
              { label: 'This Year', value: metrics.this_year },
              { label: 'Total All Time', value: metrics.total_all_time },
            ].map((kpi, idx) => (
              <div
                key={idx}
                className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between hover:border-[#D4AF37]/50 transition-all group"
              >
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-[11px] font-bold text-gray-500">
                    {kpi.label}
                  </span>
                  <div className="w-6 h-6 rounded-lg bg-[#FBFAF6] border border-[#E8D399]/60 flex items-center justify-center text-[#D4AF37] group-hover:scale-105 transition-transform">
                    <TrendingDown size={13} />
                  </div>
                </div>
                <div className="text-base sm:text-lg font-black text-[#0A0A0A] tracking-tight">
                  {formatCurrencyValue(kpi.value)}
                </div>
              </div>
            ))}
          </div>

          {/* Filter Bar */}
          <div className="bg-white border border-gray-200 rounded-2xl p-3 sm:p-4 shadow-xs space-y-3">
            {/* Main Bar: Search, Grouped Dropdowns, Filter Toggle, and Actions */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5">
              {/* Search Box */}
              <div className="relative flex-1 min-w-0">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search description, category, staff, amount..."
                  className="w-full h-10 pl-9 pr-8 rounded-xl border border-gray-200 bg-[#F9FAFB] text-xs font-semibold text-gray-900 placeholder-gray-400 outline-none focus:border-[#D4AF37] focus:bg-white transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Controls Group: Category Dropdown, Date Preset Dropdown, Filters Toggle */}
              <div className="grid grid-cols-3 sm:flex items-center gap-2 shrink-0">
                {/* Category Dropdown */}
                <div className="relative min-w-0">
                  <select
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    className="w-full sm:w-36 lg:w-40 h-10 appearance-none pl-3 pr-7 rounded-xl bg-[#F9FAFB] border border-gray-200 text-xs font-bold text-gray-800 focus:outline-none focus:border-[#D4AF37] cursor-pointer hover:bg-gray-100 transition-colors truncate"
                  >
                    <option value="all">All Categories</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>

                {/* Date Preset Dropdown */}
                <div className="relative min-w-0">
                  <select
                    value={activePreset}
                    onChange={(e) => {
                      const val = e.target.value as 'all' | 'today' | 'week' | 'month' | 'custom'
                      applyDatePreset(val)
                    }}
                    className="w-full sm:w-32 lg:w-36 h-10 appearance-none pl-3 pr-7 rounded-xl bg-[#F9FAFB] border border-gray-200 text-xs font-bold text-gray-800 focus:outline-none focus:border-[#D4AF37] cursor-pointer hover:bg-gray-100 transition-colors truncate"
                  >
                    <option value="all">All Dates</option>
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="custom">Custom...</option>
                  </select>
                  <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>

                {/* Detailed Filters Toggle Button */}
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters((v) => !v)}
                  className={`w-full sm:w-auto h-10 px-2.5 sm:px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-w-0 shrink-0 ${
                    showAdvancedFilters || activeFiltersCount > 0
                      ? 'bg-[#0A0A0A] text-white border-[#0A0A0A]'
                      : 'bg-[#F9FAFB] text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                  title="Toggle detailed filters"
                >
                  <SlidersHorizontal size={12} className="shrink-0" />
                  <span className="truncate">Filters</span>
                  {activeFiltersCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-[#D4AF37] text-black text-[9px] font-black flex items-center justify-center shrink-0">
                      {activeFiltersCount}
                    </span>
                  )}
                  <ChevronDown size={11} className={`transition-transform duration-200 shrink-0 ${showAdvancedFilters ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Action Buttons: Refresh, Export CSV, Record Expense */}
              <div className="flex items-center gap-2 shrink-0 justify-end">
                <button
                  type="button"
                  onClick={() => void refreshAll()}
                  title="Refresh Expenses"
                  className="h-10 w-10 rounded-xl border border-gray-200 bg-[#F9FAFB] hover:bg-gray-100 flex items-center justify-center text-gray-600 hover:text-black transition-colors cursor-pointer shrink-0"
                >
                  <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                </button>

                <button
                  type="button"
                  onClick={() => exportExpensesToCSV(filteredExpenses)}
                  disabled={filteredExpenses.length === 0}
                  className="h-10 px-3 sm:px-3.5 rounded-xl border border-gray-200 bg-[#F9FAFB] text-xs font-bold text-gray-800 hover:bg-gray-100 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40 shrink-0 shadow-xs"
                >
                  <Download size={13} />
                  <span className="hidden sm:inline">Export</span> CSV
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEditingExpense(null)
                    setIsRecordModalOpen(true)
                  }}
                  className="h-10 px-3 sm:px-4 rounded-xl bg-[#0A0A0A] border border-[#D4AF37] text-[#D4AF37] text-xs font-bold hover:bg-[#1A1A1A] transition-all shadow-md flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Plus size={14} />
                  <span className="whitespace-nowrap">Record Expense</span>
                </button>
              </div>
            </div>

            {/* Collapsible Advanced Filters Panel */}
            {showAdvancedFilters && (
              <div className="pt-3 pb-1 border-t border-gray-100 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between text-xs font-bold text-gray-500">
                  <span className="uppercase text-[10px] tracking-wider text-gray-600 flex items-center gap-1">
                    <SlidersHorizontal size={11} /> Detailed Filters
                  </span>
                  {(activeFiltersCount > 0 || searchQuery) && (
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="text-[11px] font-bold text-red-600 hover:underline cursor-pointer"
                    >
                      Reset All Filters
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* From Date */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                      From Date
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => {
                          setFromDate(e.target.value)
                          setActivePreset('custom')
                        }}
                        className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 bg-[#F9FAFB] text-xs font-semibold text-gray-800 outline-none focus:border-[#D4AF37] focus:bg-white"
                      />
                      <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* To Date */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                      To Date
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        value={toDate}
                        onChange={(e) => {
                          setToDate(e.target.value)
                          setActivePreset('custom')
                        }}
                        className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 bg-[#F9FAFB] text-xs font-semibold text-gray-800 outline-none focus:border-[#D4AF37] focus:bg-white"
                      />
                      <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Payment Mode */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                      Payment Mode
                    </label>
                    <div className="relative">
                      <select
                        value={selectedPaymentMode}
                        onChange={(e) => setSelectedPaymentMode(e.target.value)}
                        className="w-full h-10 appearance-none pl-3 pr-7 rounded-xl bg-[#F9FAFB] border border-gray-200 text-xs font-semibold text-gray-800 focus:outline-none focus:border-[#D4AF37] cursor-pointer hover:bg-gray-100 transition-colors"
                      >
                        <option value="all">All Payment Modes</option>
                        <option value="cash">Cash</option>
                        <option value="upi">UPI / QR</option>
                        <option value="card">Credit / Debit Card</option>
                        <option value="bank_transfer">Bank Transfer / NetBanking</option>
                      </select>
                      <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Expenses Table */}
          <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-xs">
            <div className="p-5 border-b border-gray-100 bg-[#FAFAFA] flex items-center justify-between">
              <h4 className="text-xs font-bold text-gray-800">
                Expense Records ({filteredExpenses.length})
              </h4>
              {selectedCategoryId !== 'all' && (
                <span className="text-[11px] font-bold text-gray-500">
                  Filtered by Category:{' '}
                  <span className="text-gray-900">
                    {categories.find((c) => String(c.id) === String(selectedCategoryId))?.name || selectedCategoryId}
                  </span>
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-[#FBFAF6]">
                    <th className="px-5 py-3.5 text-[11px] font-bold text-gray-600">
                      Date
                    </th>
                    <th className="px-5 py-3.5 text-[11px] font-bold text-gray-600">
                      Category
                    </th>
                    <th className="px-5 py-3.5 text-[11px] font-bold text-gray-600">
                      Description
                    </th>
                    <th className="px-5 py-3.5 text-[11px] font-bold text-gray-600 text-right">
                      Amount (₹)
                    </th>
                    <th className="px-5 py-3.5 text-[11px] font-bold text-gray-600 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-gray-400 font-bold">
                        <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-[#D4AF37]" />
                        Loading expenses...
                      </td>
                    </tr>
                  ) : filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-gray-400 font-bold">
                        <Layers size={32} className="mx-auto mb-2 opacity-30" />
                        No expense records found matching the filters.
                      </td>
                    </tr>
                  ) : (
                    filteredExpenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-5 py-3.5 font-bold text-gray-900 whitespace-nowrap">
                          {exp.expense_date}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#FBFAF6] text-[#0A0A0A] border border-[#E8D399]">
                            {exp.category_name}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-gray-700 max-w-[280px] truncate">
                          {exp.description || '—'}
                        </td>
                        <td className="px-5 py-3.5 text-right font-black text-sm text-[#0A0A0A] whitespace-nowrap">
                          {formatCurrencyValue(exp.amount)}
                        </td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleEditExpense(exp)}
                              title="Edit record"
                              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 inline-flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteExpense(exp.id)}
                              title="Delete record"
                              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-rose-50 hover:text-rose-600 text-gray-500 inline-flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Record / Edit Expense Modal */}
          <RecordExpenseModal
            isOpen={isRecordModalOpen}
            onClose={() => {
              setIsRecordModalOpen(false)
              setEditingExpense(null)
            }}
            onSuccess={handleExpenseSaved}
            categories={categories}
            expenseToEdit={editingExpense}
          />
        </div>
      )}
    </div>
  )
}
