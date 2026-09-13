import React, { useState, useRef } from 'react'
import { Plus, Trash2, Tag, AlertCircle, CheckCircle2, Edit2, X, Check } from 'lucide-react'
import { expenseService, type ExpenseCategory } from '../../services/expenseService'

interface ExpenseCategoriesViewProps {
  categories: ExpenseCategory[]
  onCategoriesUpdated: () => void
}

export const ExpenseCategoriesView: React.FC<ExpenseCategoriesViewProps> = ({
  categories,
  onCategoriesUpdated,
}) => {
  const [catName, setCatName] = useState('')
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = catName.trim()
    if (!trimmed) return

    setLoading(true)
    setNotice(null)
    try {
      if (editingCategory) {
        await expenseService.updateCategory(editingCategory.id, trimmed)
        setNotice({ type: 'success', text: `Category updated to "${trimmed}" successfully!` })
        setEditingCategory(null)
      } else {
        await expenseService.createCategory(trimmed)
        setNotice({ type: 'success', text: `Category "${trimmed}" created successfully!` })
      }
      setCatName('')
      onCategoriesUpdated()
    } catch (err: unknown) {
      console.error('Failed to save category:', err)
      const msg = err instanceof Error ? err.message : 'Could not save category'
      setNotice({ type: 'error', text: msg })
    } finally {
      setLoading(false)
    }
  }

  const handleStartEdit = (cat: ExpenseCategory) => {
    setEditingCategory(cat)
    setCatName(cat.name)
    setNotice(null)
    setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 50)
  }

  const handleCancelEdit = () => {
    setEditingCategory(null)
    setCatName('')
  }

  const handleDeleteCategory = async (cat: ExpenseCategory) => {
    if (!window.confirm(`Delete expense category "${cat.name}"? Historical expenses will remain intact.`)) {
      return
    }

    try {
      await expenseService.deleteCategory(cat.id)
      if (editingCategory?.id === cat.id) {
        handleCancelEdit()
      }
      setNotice({ type: 'success', text: `Category "${cat.name}" deleted.` })
      onCategoriesUpdated()
    } catch (err: unknown) {
      console.error('Failed to delete category:', err)
      const msg = err instanceof Error ? err.message : 'Could not delete category'
      setNotice({ type: 'error', text: msg })
    }
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div
          className={`flex items-center gap-2.5 p-4 rounded-2xl border text-xs font-bold animate-in fade-in duration-200 ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {notice.type === 'success' ? (
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      {/* 2-Column Grid matching reference UI */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
        {/* LEFT COLUMN: Add / Edit Category Card */}
        <div className={`bg-white border rounded-3xl p-6 shadow-xs space-y-4 transition-all ${
          editingCategory ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/20' : 'border-gray-200'
        }`}>
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              {editingCategory ? (
                <Edit2 size={16} className="text-[#D4AF37]" />
              ) : (
                <Tag size={16} className="text-[#D4AF37]" />
              )}
              <h4 className="text-xs font-bold text-gray-800">
                {editingCategory ? 'Edit Category' : 'Add Category'}
              </h4>
            </div>
            {editingCategory && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="text-[11px] font-bold text-gray-500 hover:text-gray-900 flex items-center gap-1 cursor-pointer"
              >
                <X size={13} /> Cancel
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">
                Category Name <span className="text-red-500">*</span>
              </label>
              <input
                ref={inputRef}
                type="text"
                required
                placeholder="e.g. Utility Bills, Packaging"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-gray-300 bg-[#FAFAFA] text-xs font-bold text-gray-900 outline-none focus:border-[#0A0A0A] focus:bg-white transition-all"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={loading || !catName.trim()}
                className="flex-1 h-11 rounded-xl bg-[#0A0A0A] border border-[#D4AF37] text-[#D4AF37] text-xs font-bold hover:bg-[#1A1A1A] transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {editingCategory ? (
                  <>
                    <Check size={14} /> {loading ? 'Saving...' : 'Update Category'}
                  </>
                ) : (
                  <>
                    <Plus size={14} /> {loading ? 'Adding...' : 'Add Category'}
                  </>
                )}
              </button>
              {editingCategory && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        {/* RIGHT COLUMN: Categories Table Card */}
        <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-xs">
          <div className="p-5 border-b border-gray-100 bg-[#FAFAFA] flex items-center justify-between">
            <h4 className="text-xs font-bold text-gray-800">
              Expense Categories ({categories.length})
            </h4>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-[#FBFAF6]">
                  <th className="px-5 py-3.5 text-[11px] font-bold text-gray-600">
                    Category Name
                  </th>
                  <th className="px-5 py-3.5 text-[11px] font-bold text-gray-600">
                    Status
                  </th>
                  <th className="px-5 py-3.5 text-[11px] font-bold text-gray-600 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-gray-400 font-bold">
                      No expense categories configured.
                    </td>
                  </tr>
                ) : (
                  categories.map((cat) => {
                    const isBeingEdited = editingCategory?.id === cat.id
                    return (
                      <tr
                        key={cat.id}
                        className={`transition-colors ${
                          isBeingEdited ? 'bg-[#D4AF37]/10' : 'hover:bg-gray-50/70'
                        }`}
                      >
                        <td className="px-5 py-3.5 font-bold text-gray-900">
                          <div className="flex items-center gap-2">
                            <span>{cat.name}</span>
                            {isBeingEdited && (
                              <span className="text-[10px] font-bold text-[#D4AF37] bg-[#0A0A0A] px-2 py-0.5 rounded-full">
                                Editing
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Active
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Edit Option Icon Only Button */}
                            <button
                              type="button"
                              onClick={() => handleStartEdit(cat)}
                              title={`Edit ${cat.name}`}
                              className={`w-8 h-8 rounded-lg inline-flex items-center justify-center transition-colors cursor-pointer ${
                                isBeingEdited
                                  ? 'bg-[#0A0A0A] text-[#D4AF37] border border-[#D4AF37] shadow-xs'
                                  : 'bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900'
                              }`}
                            >
                              <Edit2 size={13} />
                            </button>

                            {/* Delete Option Icon Only Button */}
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(cat)}
                              title={`Delete ${cat.name}`}
                              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-rose-50 hover:text-rose-600 text-gray-500 inline-flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
