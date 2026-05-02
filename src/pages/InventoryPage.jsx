/**
 * Velo CRM — InventoryPage (new schema).
 *
 * Wraps `inventory_items`. Columns: name, category, quantity, unit,
 * low_stock_threshold, last_restocked_at. The legacy supplier and cost
 * columns were dropped — keep this page narrow.
 *
 * "Total value" can't be computed without a cost-per-unit column on disk,
 * so the dashboard tile is just total-item-count and low-stock count.
 */

import { useState, useEffect, useMemo } from 'react'
import { C, card, makeBtn } from '../design'
import { Icons, Modal, FormField, inputStyle, selectStyle } from '../components/shared'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  fetchInventoryItems,
  insertInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from '../lib/inventory'
import { fetchMyProfile } from '../lib/profiles'
import { can } from '../lib/permissions'

const CATEGORIES = [
  { id: 'consumables',   en: 'Consumables',    ar: 'مواد استهلاكية' },
  { id: 'equipment',     en: 'Equipment',      ar: 'معدات' },
  { id: 'medications',   en: 'Medications',    ar: 'أدوية' },
  { id: 'lab_materials', en: 'Lab Materials',  ar: 'مواد المختبر' },
  { id: 'sterilization', en: 'Sterilization',  ar: 'تعقيم' },
  { id: 'other',         en: 'Other',          ar: 'أخرى' },
]
const UNITS = ['unit', 'pcs', 'box', 'bottle', 'roll', 'pack', 'tube']

const catLabel = (id, isRTL) => {
  const c = CATEGORIES.find(x => x.id === id)
  return c ? (isRTL ? c.ar : c.en) : id
}

export default function InventoryPage({ lang, dir, isRTL, toast }) {
  void lang
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('all')

  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)

  const [role, setRole] = useState(null)
  const canEdit = role ? (can(role, 'settings', 'w') || role === 'owner' || role === 'receptionist') : true

  const [form, setForm] = useState({
    name: '', category: 'consumables', quantity: 0, unit: 'unit',
    low_stock_threshold: 5, last_restocked_at: '',
  })

  useEffect(() => {
    let cancelled = false
    fetchMyProfile().then(p => { if (!cancelled) setRole(p?.role || null) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      if (!isSupabaseConfigured()) { if (!cancelled) { setItems([]); setLoading(false) }; return }
      try {
        const data = await fetchInventoryItems()
        if (!cancelled) setItems(data || [])
      } catch (err) {
        console.error('[InventoryPage] load failed:', err)
        if (!cancelled) toast?.(err.message || (isRTL ? 'فشل تحميل المخزون' : 'Failed to load inventory'), 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [toast, isRTL])

  const handleSave = async (e) => {
    e.preventDefault()
    const payload = {
      name: form.name.trim(),
      category: form.category,
      quantity: Number(form.quantity) || 0,
      unit: form.unit,
      low_stock_threshold: Number(form.low_stock_threshold) || 0,
      last_restocked_at: form.last_restocked_at
        ? new Date(form.last_restocked_at + 'T00:00:00').toISOString()
        : null,
    }
    if (!payload.name) { toast?.(isRTL ? 'الاسم مطلوب' : 'Name is required', 'error'); return }
    try {
      if (editingItem) {
        await updateInventoryItem(editingItem.id, payload)
        setItems(prev => prev.map(i => i.id === editingItem.id ? { ...i, ...payload } : i))
        toast?.(isRTL ? 'تم التحديث' : 'Item updated', 'success')
      } else {
        const data = await insertInventoryItem(payload)
        if (data) setItems(prev => [data, ...prev].sort((a, b) => (a.name || '').localeCompare(b.name || '')))
        toast?.(isRTL ? 'تمت الإضافة' : 'Item added', 'success')
      }
      setShowModal(false)
    } catch (err) {
      console.error('[InventoryPage] save failed:', err)
      toast?.(err.message || (isRTL ? 'فشل الحفظ' : 'Save failed'), 'error')
    }
  }

  const handleDelete = async (id) => {
    try { await deleteInventoryItem(id) }
    catch (err) {
      console.error('[InventoryPage] delete failed:', err)
      toast?.(err.message || (isRTL ? 'فشل الحذف' : 'Delete failed'), 'error')
      return
    }
    setItems(prev => prev.filter(i => i.id !== id))
    toast?.(isRTL ? 'تم الحذف' : 'Item deleted', 'success')
  }

  const openNew = () => {
    setForm({ name: '', category: 'consumables', quantity: 0, unit: 'unit', low_stock_threshold: 5, last_restocked_at: '' })
    setEditingItem(null)
    setShowModal(true)
  }

  const openEdit = (item) => {
    setForm({
      name: item.name || '',
      category: item.category || 'consumables',
      quantity: item.quantity ?? 0,
      unit: item.unit || 'unit',
      low_stock_threshold: item.low_stock_threshold ?? 0,
      last_restocked_at: item.last_restocked_at ? item.last_restocked_at.slice(0, 10) : '',
    })
    setEditingItem(item)
    setShowModal(true)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(i => {
      const matchesSearch = !q || (i.name || '').toLowerCase().includes(q)
      const matchesCat = filterCat === 'all' || i.category === filterCat
      return matchesSearch && matchesCat
    })
  }, [items, search, filterCat])

  const lowStockItems = useMemo(
    () => items.filter(i => Number(i.quantity || 0) <= Number(i.low_stock_threshold || 0)),
    [items]
  )

  return (
    <div dir={dir} style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>
            {isRTL ? 'المخزون' : 'Inventory'}
          </h1>
          <p style={{ fontSize: 13, color: C.textSec, margin: '4px 0 0' }}>
            {isRTL ? 'المستلزمات والمعدات والأدوية' : 'Supplies, equipment, and medications'}
          </p>
        </div>
        {canEdit && (
          <button onClick={openNew} className="velo-btn-primary" style={makeBtn('primary', { gap: 6 })}>
            {Icons.plus(14)} {isRTL ? 'إضافة عنصر' : 'Add item'}
          </button>
        )}
      </div>

      {/* Low-stock banner */}
      {lowStockItems.length > 0 && (
        <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 8, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#ef4444', fontSize: 18, fontWeight: 700 }}>!</span>
          <div style={{ flex: 1, fontSize: 13, color: C.text }}>
            <strong style={{ color: '#ef4444' }}>{isRTL ? 'تنبيه مخزون منخفض:' : 'Low stock alert:'}</strong>{' '}
            {lowStockItems.length} {isRTL ? 'عنصر تحت حد التنبيه' : (lowStockItems.length === 1 ? 'item is below its low-stock threshold' : 'items are below their low-stock thresholds')}
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ ...card, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            {isRTL ? 'إجمالي العناصر' : 'Total items'}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{items.length}</div>
        </div>
        <div style={{ ...card, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            {isRTL ? 'منخفض المخزون' : 'Low stock'}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: lowStockItems.length > 0 ? '#ef4444' : C.text, fontVariantNumeric: 'tabular-nums' }}>{lowStockItems.length}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ ...card, padding: 14, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bg, borderRadius: 8, padding: '6px 12px', border: `1px solid ${C.border}`, flex: 1, minWidth: 220, maxWidth: 320 }}>
          <span style={{ color: C.textMuted, display: 'flex' }}>{Icons.search(16)}</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={isRTL ? 'البحث بالاسم...' : 'Search by name...'}
            style={{ border: 'none', background: 'transparent', outline: 'none', color: C.text, fontSize: 13, width: '100%' }} />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          style={{ ...selectStyle(dir), width: 'auto', padding: '0 12px', height: 36 }}>
          <option value="all">{isRTL ? 'كل الفئات' : 'All categories'}</option>
          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{isRTL ? c.ar : c.en}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ ...card, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
            {isRTL ? 'جاري التحميل...' : 'Loading inventory...'}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
            {isRTL ? 'لا توجد عناصر' : 'No items found'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                  {[
                    isRTL ? 'الاسم' : 'Name',
                    isRTL ? 'الفئة' : 'Category',
                    isRTL ? 'الكمية' : 'Quantity',
                    isRTL ? 'الوحدة' : 'Unit',
                    isRTL ? 'حد التنبيه' : 'Low threshold',
                    isRTL ? 'آخر تجديد' : 'Last restocked',
                  ].map((h, i) => (
                    <th key={i} style={{ padding: '10px 14px', textAlign: isRTL ? 'right' : 'left', fontWeight: 600, color: C.textSec, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                  ))}
                  {canEdit && <th style={{ padding: '10px 14px', width: 80 }} />}
                </tr>
              </thead>
              <tbody>
                {filtered.map(i => {
                  const isLow = Number(i.quantity || 0) <= Number(i.low_stock_threshold || 0)
                  const restocked = i.last_restocked_at
                    ? new Date(i.last_restocked_at).toLocaleDateString(isRTL ? 'ar-IQ' : 'en-US')
                    : '—'
                  return (
                    <tr key={i.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '10px 14px', color: C.text, fontWeight: 600 }}>{i.name}</td>
                      <td style={{ padding: '10px 14px', color: C.textSec }}>
                        <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 5, background: C.bg, color: C.textSec }}>
                          {catLabel(i.category, isRTL)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: isLow ? '#ef4444' : C.text, background: isLow ? 'rgba(239,68,68,0.1)' : 'transparent', padding: '3px 8px', borderRadius: 4, fontVariantNumeric: 'tabular-nums' }}>
                          {i.quantity}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: C.textSec }}>{i.unit || '—'}</td>
                      <td style={{ padding: '10px 14px', color: C.textSec, fontVariantNumeric: 'tabular-nums' }}>{i.low_stock_threshold ?? 0}</td>
                      <td style={{ padding: '10px 14px', color: C.textMuted, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{restocked}</td>
                      {canEdit && (
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button onClick={() => openEdit(i)} aria-label={isRTL ? 'تعديل' : 'Edit'}
                              style={{ background: 'transparent', border: 'none', color: C.primary, cursor: 'pointer', padding: 4, borderRadius: 4, display: 'inline-flex' }}>
                              {Icons.edit(14)}
                            </button>
                            <button onClick={() => handleDelete(i.id)} aria-label={isRTL ? 'حذف' : 'Delete'}
                              style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'inline-flex' }}>
                              {Icons.trash(14)}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal onClose={() => setShowModal(false)} dir={dir} width={500}>
          <form onSubmit={handleSave}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>
                {editingItem ? (isRTL ? 'تعديل عنصر' : 'Edit item') : (isRTL ? 'إضافة عنصر' : 'Add inventory item')}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} aria-label="Close"
                style={{ border: 'none', background: 'transparent', color: C.textMuted, cursor: 'pointer', display: 'inline-flex' }}>
                {Icons.x(20)}
              </button>
            </div>

            <FormField label={isRTL ? 'الاسم' : 'Name'} dir={dir}>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required style={inputStyle(dir)} />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label={isRTL ? 'الفئة' : 'Category'} dir={dir}>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} required style={selectStyle(dir)}>
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{isRTL ? c.ar : c.en}</option>)}
                </select>
              </FormField>
              <FormField label={isRTL ? 'الوحدة' : 'Unit'} dir={dir}>
                <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={selectStyle(dir)}>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label={isRTL ? 'الكمية' : 'Quantity'} dir={dir}>
                <input type="number" min="0" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} required style={inputStyle(dir)} />
              </FormField>
              <FormField label={isRTL ? 'حد التنبيه' : 'Low-stock threshold'} dir={dir}>
                <input type="number" min="0" value={form.low_stock_threshold} onChange={e => setForm({ ...form, low_stock_threshold: e.target.value })} required style={inputStyle(dir)} />
              </FormField>
            </div>

            <FormField label={isRTL ? 'تاريخ آخر تجديد (اختياري)' : 'Last restocked (optional)'} dir={dir}>
              <input type="date" value={form.last_restocked_at} onChange={e => setForm({ ...form, last_restocked_at: e.target.value })} style={inputStyle(dir)} />
            </FormField>

            <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowModal(false)} style={makeBtn('secondary')}>
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button type="submit" className="velo-btn-primary" style={makeBtn('primary')}>
                {editingItem ? (isRTL ? 'حفظ' : 'Save changes') : (isRTL ? 'إضافة' : 'Add item')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
