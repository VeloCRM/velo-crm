import React, { useState, useEffect } from 'react'
import { C, card, makeBtn } from '../design'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  fetchInventoryItems,
  insertInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from '../lib/inventory'

// Icons
const Icons = {
  plus: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  search: (s=18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  alert: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  box: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  dollar: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  edit: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
  code: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
}

const CATEGORIES = ['Consumables', 'Equipment', 'Medications', 'Lab Materials', 'Sterilization', 'Other']
const UNITS = ['pcs', 'box', 'bottle', 'roll', 'pack']

const SQL_SCHEMA = `
-- Supabase SQL to create the inventory items table
create table public.items (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  name text not null,
  category text not null,
  quantity numeric default 0 not null,
  unit text not null,
  min_quantity numeric default 0 not null,
  cost_price numeric default 0,
  supplier text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS Policies
alter table public.items enable row level security;

create policy "Users can view items in their org" on public.items for select 
using ( org_id in (select org_id from public.profiles where id = auth.uid()) );

create policy "Users can insert items in their org" on public.items for insert 
with check ( org_id in (select org_id from public.profiles where id = auth.uid()) );

create policy "Users can update items in their org" on public.items for update 
using ( org_id in (select org_id from public.profiles where id = auth.uid()) );

create policy "Users can delete items in their org" on public.items for delete 
using ( org_id in (select org_id from public.profiles where id = auth.uid()) );
`

export default function InventoryPage({ t, lang, dir, isRTL, toast, orgId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('All')
  
  const [showModal, setShowModal] = useState(false)
  const [showSql, setShowSql] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  
  const [formData, setFormData] = useState({
    name: '', category: 'Consumables', quantity: 0, unit: 'pcs',
    min_quantity: 5, cost_price: 0, supplier: '', notes: ''
  })

  // Load items
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      if (isSupabaseConfigured() && orgId) {
        try {
          const data = await fetchInventoryItems()
          if (!cancelled) setItems(data)
        } catch (e) {
          // 42P01 = relation does not exist, treated as "no inventory yet"
          if (e?.code !== '42P01') console.error('Fetch items error:', e)
          if (!cancelled) setItems([])
        }
      } else {
        // Mock data
        if (!cancelled) {
          setItems([
            { id: '1', name: 'Latex Gloves (Medium)', category: 'Consumables', quantity: 12, min_quantity: 20, unit: 'box', cost_price: 15, supplier: 'MedSupply Co', notes: 'Late pickup last time' },
            { id: '2', name: 'Dental Syringes', category: 'Equipment', quantity: 150, min_quantity: 50, unit: 'pcs', cost_price: 0.5, supplier: 'MedSupply Co', notes: '' },
            { id: '3', name: 'Lidocaine 2%', category: 'Medications', quantity: 5, min_quantity: 10, unit: 'bottle', cost_price: 25, supplier: 'PharmaPlus', notes: 'Check expiration dates' },
          ])
        }
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [orgId])

  const handleSave = async (e) => {
    e.preventDefault()
    
    // Prepare payload
    const payload = {
      ...formData,
      quantity: Number(formData.quantity) || 0,
      min_quantity: Number(formData.min_quantity) || 0,
      cost_price: Number(formData.cost_price) || 0,
      org_id: orgId
    }

    if (isSupabaseConfigured() && orgId) {
      try {
        if (editingItem) {
          await updateInventoryItem(editingItem.id, payload)
          setItems(prev => prev.map(i => i.id === editingItem.id ? { ...i, ...payload } : i))
          toast('Item updated successfully', 'success')
        } else {
          const data = await insertInventoryItem(payload)
          if (data) setItems(prev => [data, ...prev].sort((a, b) => a.name.localeCompare(b.name)))
          toast('Item added successfully', 'success')
        }
        setShowModal(false)
      } catch (err) {
        console.error(err)
        if (err?.code === '42P01') {
          handleLocalSave(payload)
        } else {
          toast(err.message || 'Error saving item', 'error')
        }
      }
    } else {
      handleLocalSave(payload)
    }
  }

  const handleLocalSave = (payload) => {
    if (editingItem) {
      setItems(prev => prev.map(i => i.id === editingItem.id ? { ...i, ...payload } : i))
    } else {
      setItems(prev => [{ ...payload, id: Math.random().toString(36).substr(2, 9) }, ...prev].sort((a,b) => a.name.localeCompare(b.name)))
    }
    setShowModal(false)
    toast(editingItem ? 'Item updated (Local)' : 'Item added (Local)', 'success')
  }

  const handleDelete = async (id) => {
    if (isSupabaseConfigured() && orgId) {
      try { await deleteInventoryItem(id) }
      catch (err) {
        console.error(err)
        toast?.(err.message || 'Failed to delete item', 'error')
        return
      }
    }
    setItems(prev => prev.filter(i => i.id !== id))
    toast('Item deleted', 'success')
  }

  const openNew = () => {
    setFormData({ name: '', category: 'Consumables', quantity: 0, unit: 'pcs', min_quantity: 5, cost_price: 0, supplier: '', notes: '' })
    setEditingItem(null)
    setShowModal(true)
  }

  const openEdit = (item) => {
    setFormData({ 
      name: item.name, category: item.category, quantity: item.quantity, 
      unit: item.unit, min_quantity: item.min_quantity, cost_price: item.cost_price, 
      supplier: item.supplier || '', notes: item.notes || '' 
    })
    setEditingItem(item)
    setShowModal(true)
  }

  // Derived state
  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    const matchesSearch = !q || i.name.toLowerCase().includes(q) || (i.supplier||'').toLowerCase().includes(q)
    const matchesCat = filterCat === 'All' || i.category === filterCat
    return matchesSearch && matchesCat
  })
  
  const lowStockItems = items.filter(i => i.quantity <= i.min_quantity)
  const totalValue = items.reduce((sum, i) => sum + (i.quantity * i.cost_price), 0)

  // Styling helpers
  const inputStyle = {
    width: '100%', padding: '0 12px', height: 36, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)',
    fontSize: 14, color: C.text, outline: 'none', background: '#0C0E1A', transition: 'border-color 150ms ease'
  }

  const fieldDiv = (label, name, type = 'text', opts = {}) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.textLabel, marginBottom: 6 }}>{label}</label>
      {type === 'select' ? (
        <select style={{...inputStyle, appearance: 'auto'}} value={formData[name]} onChange={e => setFormData({...formData, [name]: e.target.value})} required={opts.required}>
          {opts.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea style={{...inputStyle, height: 60, paddingTop: 8, resize: 'vertical'}} value={formData[name]} onChange={e => setFormData({...formData, [name]: e.target.value})} />
      ) : (
        <input type={type} style={inputStyle} value={formData[name]} onChange={e => setFormData({...formData, [name]: e.target.value})} required={opts.required} step={type === 'number' ? 'any' : undefined} />
      )}
    </div>
  )

  return (
    <div style={{ direction: dir, maxWidth: 1200, margin: '0 auto' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: C.primary }}>📦</span> Clinic Inventory
          </h1>
          <p style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>Manage supplies, equipment, and medications</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowSql(true)} style={makeBtn('secondary', { gap: 6, color: C.primary })}>
            {Icons.code(16)} SQL Schema
          </button>
          <button onClick={openNew} className="velo-btn-primary" style={makeBtn('primary', { gap: 6 })}>
            {Icons.plus()} Add Item
          </button>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 8, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ color: '#ef4444' }}>{Icons.alert(20)}</div>
          <div style={{ flex: 1, fontSize: 13, color: C.text }}>
            <strong style={{ color: '#ef4444' }}>Low Stock Alert:</strong> {lowStockItems.length} item(s) are below minimum required quantity limit.
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ ...card, padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: C.primaryBg, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {Icons.box(24)}
          </div>
          <div>
            <div style={{ fontSize: 13, color: C.textSec, fontWeight: 500, marginBottom: 4 }}>Total Items</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{items.length}</div>
          </div>
        </div>
        
        <div style={{ ...card, padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: lowStockItems.length > 0 ? 'rgba(239,68,68,0.1)' : C.successBg, color: lowStockItems.length > 0 ? '#ef4444' : C.success, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {Icons.alert(24)}
          </div>
          <div>
            <div style={{ fontSize: 13, color: C.textSec, fontWeight: 500, marginBottom: 4 }}>Low Stock Items</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: lowStockItems.length > 0 ? '#ef4444' : C.text }}>{lowStockItems.length}</div>
          </div>
        </div>

        <div style={{ ...card, padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: C.purpleBg, color: C.purple, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {Icons.dollar(24)}
          </div>
          <div>
            <div style={{ fontSize: 13, color: C.textSec, fontWeight: 500, marginBottom: 4 }}>Total Value</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>${totalValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ ...card, display: 'flex', flexDirection: 'column', minHeight: 400 }}>
        {/* Toolbar */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.borderLight}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0C0E1A', borderRadius: 8, padding: '6px 12px', border: `1px solid rgba(255,255,255,0.08)`, flex: 1, maxWidth: 300 }}>
            <span style={{ color: C.textSec }}>{Icons.search(16)}</span>
            <input type="text" placeholder="Search items or suppliers..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', color: C.text, fontSize: 14, width: '100%' }} />
          </div>
          
          <select style={{ ...inputStyle, width: 'auto', appearance: 'auto', background: C.bg }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="All">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${C.borderLight}` }}>
                {['Item Name', 'Category', 'Quantity', 'Unit', 'Min Qt.', 'Cost/Unit', 'Supplier'].map(th => (
                  <th key={th} style={{ padding: '12px 20px', fontSize: 12, fontWeight: 600, color: C.textLabel, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{th}</th>
                ))}
                <th style={{ padding: '12px 20px', width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ padding: 40, textAlign: 'center', color: C.textSec }}>Loading inventory...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="8" style={{ padding: 40, textAlign: 'center', color: C.textSec }}>No items found.</td></tr>
              ) : (
                filtered.map(i => {
                  const isLow = i.quantity <= i.min_quantity
                  return (
                    <tr key={i.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                      <td style={{ padding: '12px 20px' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{i.name}</div>
                        {i.notes && <div style={{ fontSize: 11, color: C.textSec, marginTop: 4 }}>{i.notes}</div>}
                      </td>
                      <td style={{ padding: '12px 20px' }}>
                        <span style={{ fontSize: 11, fontWeight: 500, padding: '4px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: C.textSec }}>
                          {i.category}
                        </span>
                      </td>
                      <td style={{ padding: '12px 20px' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: isLow ? '#ef4444' : C.text, background: isLow ? 'rgba(239,68,68,0.1)' : 'transparent', padding: '4px 8px', borderRadius: 4 }}>
                          {i.quantity}
                        </span>
                      </td>
                      <td style={{ padding: '12px 20px', fontSize: 13, color: C.textSec }}>{i.unit}</td>
                      <td style={{ padding: '12px 20px', fontSize: 13, color: C.textSec }}>{i.min_quantity}</td>
                      <td style={{ padding: '12px 20px', fontSize: 13, color: C.textSec }}>${Number(i.cost_price).toFixed(2)}</td>
                      <td style={{ padding: '12px 20px', fontSize: 13, color: C.textSec }}>{i.supplier || '—'}</td>
                      <td style={{ padding: '12px 20px' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button onClick={() => openEdit(i)} style={{ background: 'transparent', border: 'none', color: C.primary, cursor: 'pointer', padding: 4, borderRadius: 4 }} title="Edit">
                            {Icons.edit(15)}
                          </button>
                          <button onClick={() => handleDelete(i.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4, borderRadius: 4 }} title="Delete">
                            {Icons.trash(15)}
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

      {/* SQL Modal */}
      {showSql && (
        <div className="modal-overlay" onClick={() => setShowSql(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: 640 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <h2 style={{ fontSize:18, fontWeight:700, color:C.text }}>Supabase SQL Schema</h2>
              <button onClick={() => setShowSql(false)} style={{ border:'none', background:'transparent', color:C.textMuted, cursor:'pointer' }}>{Icons.x(20)}</button>
            </div>
            <p style={{ fontSize: 13, color: C.textSec, marginBottom: 16 }}>
              Run this SQL in your Supabase SQL Editor to create the tables required for the Inventory module.
            </p>
            <div style={{ background: '#080c14', padding: 16, borderRadius: 8, border: `1px solid rgba(255,255,255,0.08)`, overflowX: 'auto' }}>
              <pre style={{ margin: 0, fontSize: 12, color: '#e2e8f0', fontFamily: '"JetBrains Mono", monospace' }}>
                {SQL_SCHEMA.trim()}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: 500 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
              <h2 style={{ fontSize:18, fontWeight:700, color:C.text }}>{editingItem ? 'Edit Item' : 'Add Inventory Item'}</h2>
              <button onClick={() => setShowModal(false)} style={{ border:'none', background:'transparent', color:C.textMuted, cursor:'pointer' }}>{Icons.x(20)}</button>
            </div>
            
            <form onSubmit={handleSave}>
              {fieldDiv('Item Name', 'name', 'text', { required: true })}
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {fieldDiv('Category', 'category', 'select', { options: CATEGORIES, required: true })}
                {fieldDiv('Unit', 'unit', 'select', { options: UNITS, required: true })}
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {fieldDiv('Quantity in Stock', 'quantity', 'number', { required: true })}
                {fieldDiv('Min Stock Alert', 'min_quantity', 'number', { required: true })}
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {fieldDiv('Cost Price ($)', 'cost_price', 'number', { required: true })}
                {fieldDiv('Supplier', 'supplier', 'text')}
              </div>
              
              {fieldDiv('Notes', 'notes', 'textarea')}
              
              <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} style={makeBtn('secondary')}>Cancel</button>
                <button type="submit" className="velo-btn-primary" style={makeBtn('primary')}>{editingItem ? 'Save Changes' : 'Add Item'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
