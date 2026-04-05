import { useState, useEffect } from 'react'
import { C, makeBtn, card } from '../design'
import { Icons, Modal, FormField, inputStyle, selectStyle } from '../components/shared'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

// ─── Constants ──────────────────────────────────────────────────────────────

const INDUSTRY_LABELS = {
  general: 'General',
  dental: 'Dental',
  real_estate: 'Real Estate',
  beauty: 'Beauty & Spa',
  legal: 'Legal',
  restaurant: 'Restaurant',
}

const INDUSTRY_OPTIONS = Object.entries(INDUSTRY_LABELS)

const PLAN_OPTIONS = ['free', 'starter', 'pro', 'enterprise']

const PLAN_BADGE = {
  free:       { color: C.textMuted, bg: C.bg },
  starter:    { color: C.primary,   bg: C.primaryBg },
  pro:        { color: C.purple,    bg: C.purpleBg },
  enterprise: { color: C.success,   bg: C.successBg },
}

const STATUS_BADGE = {
  active:    { color: '#166534', bg: '#F0FDF4', border: '#BBF7D0' },
  suspended: { color: '#92400E', bg: '#FFFBEB', border: '#FDE68A' },
  deleted:   { color: '#991B1B', bg: '#FEF2F2', border: '#FECACA' },
}

const SAMPLE_ORGS = [
  { id: 'demo-1', name: 'Bright Dental Clinic', industry: 'dental', plan: 'pro', status: 'active', created_at: '2025-11-01T10:00:00Z', contact_count: 234 },
  { id: 'demo-2', name: 'Skyline Real Estate', industry: 'real_estate', plan: 'enterprise', status: 'active', created_at: '2025-09-15T08:30:00Z', contact_count: 1120 },
  { id: 'demo-3', name: 'Glow Beauty Spa', industry: 'beauty', plan: 'starter', status: 'active', created_at: '2025-12-20T14:00:00Z', contact_count: 87 },
  { id: 'demo-4', name: 'Justice Partners LLP', industry: 'legal', plan: 'pro', status: 'suspended', created_at: '2026-01-05T09:00:00Z', contact_count: 542 },
  { id: 'demo-5', name: 'Mama Rosa Restaurant', industry: 'restaurant', plan: 'free', status: 'active', created_at: '2026-02-14T12:00:00Z', contact_count: 45 },
  { id: 'demo-6', name: 'Ali Consulting Group', industry: 'general', plan: 'starter', status: 'deleted', created_at: '2025-06-10T16:45:00Z', contact_count: 0 },
]

// ─── Component ──────────────────────────────────────────────────────────────

export default function AgencyDashboard({ user, onEnterOrg, onSignOut }) {
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [newOrg, setNewOrg] = useState({ name: '', industry: 'general', plan: 'free', admin_email: '' })
  const [saving, setSaving] = useState(false)

  // ── Fetch organizations ─────────────────────────────────────────────────

  useEffect(() => { fetchOrgs() }, [])

  async function fetchOrgs() {
    setLoading(true)
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase
          .from('organizations')
          .select('*')
          .order('created_at', { ascending: false })
        if (error) throw error
        // Try to fetch contact counts per org
        const enriched = await Promise.all((data || []).map(async (org) => {
          try {
            const { count } = await supabase
              .from('contacts')
              .select('id', { count: 'exact', head: true })
              .eq('org_id', org.id)
            return { ...org, contact_count: count || 0 }
          } catch {
            return { ...org, contact_count: null }
          }
        }))
        setOrgs(enriched)
      } catch (err) {
        console.error('Failed to fetch orgs:', err)
        setOrgs(SAMPLE_ORGS)
      }
    } else {
      setOrgs(SAMPLE_ORGS)
    }
    setLoading(false)
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  async function updateOrgStatus(orgId, status) {
    if (isSupabaseConfigured()) {
      const { error } = await supabase
        .from('organizations')
        .update({ status })
        .eq('id', orgId)
      if (error) { console.error(error); return }
    }
    setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, status } : o))
  }

  async function updateOrgPlan(orgId, plan) {
    if (isSupabaseConfigured()) {
      const { error } = await supabase
        .from('organizations')
        .update({ plan })
        .eq('id', orgId)
      if (error) { console.error(error); return }
    }
    setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, plan } : o))
  }

  async function deleteOrg(orgId) {
    if (isSupabaseConfigured()) {
      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', orgId)
      if (error) { console.error(error); return }
    }
    setOrgs(prev => prev.filter(o => o.id !== orgId))
    setConfirmDelete(null)
  }

  async function handleAddOrg() {
    if (!newOrg.name.trim()) return
    setSaving(true)
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase
          .from('organizations')
          .insert({
            name: newOrg.name.trim(),
            industry: newOrg.industry,
            plan: newOrg.plan,
            status: 'active',
          })
          .select()
          .single()
        if (error) throw error
        // Create profile entry for invited admin email
        if (newOrg.admin_email.trim()) {
          await supabase.from('profiles').insert({
            email: newOrg.admin_email.trim(),
            org_id: data.id,
            role: 'admin',
          })
        }
        setOrgs(prev => [{ ...data, contact_count: 0 }, ...prev])
      } catch (err) {
        console.error('Failed to create org:', err)
      }
    } else {
      // Demo mode — add locally
      const demo = {
        id: 'demo-' + Date.now(),
        name: newOrg.name.trim(),
        industry: newOrg.industry,
        plan: newOrg.plan,
        status: 'active',
        created_at: new Date().toISOString(),
        contact_count: 0,
      }
      setOrgs(prev => [demo, ...prev])
    }
    setSaving(false)
    setNewOrg({ name: '', industry: 'general', plan: 'free', admin_email: '' })
    setShowAddModal(false)
  }

  // ── Derived data ────────────────────────────────────────────────────────

  const filtered = orgs.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        (o.name || '').toLowerCase().includes(q) ||
        (o.industry || '').toLowerCase().includes(q) ||
        (o.plan || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  const totalOrgs = orgs.length
  const totalActive = orgs.filter(o => o.status === 'active').length
  const totalContacts = orgs.reduce((sum, o) => sum + (o.contact_count || 0), 0)

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif" }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #111827 0%, #1F2937 100%)',
        padding: '0 32px',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 15,
          }}>S</div>
          <span style={{ color: '#F9FAFB', fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>
            SupCRM Agency
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: '#9CA3AF', fontSize: 13 }}>{user?.email || 'alialjobory89@gmail.com'}</span>
          <button onClick={onSignOut} style={makeBtn('secondary', { height: 32, fontSize: 13, color: '#D1D5DB', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' })}>
            Sign Out
          </button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 32px' }}>

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>Agency Dashboard</h1>
            <p style={{ fontSize: 13, color: C.textMuted, margin: '4px 0 0' }}>
              Manage all organizations, plans, and access
            </p>
          </div>
          <button onClick={() => setShowAddModal(true)} style={makeBtn('primary', { height: 38, fontSize: 14 })}>
            {Icons.plus(15)}
            Add Organization
          </button>
        </div>

        {/* ── Stats Cards ──────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Total Organizations', value: totalOrgs, icon: Icons.building(20), color: C.primary, bg: C.primaryBg },
            { label: 'Active', value: totalActive, icon: Icons.check(20), color: C.success, bg: C.successBg },
            { label: 'Total Contacts', value: totalContacts.toLocaleString(), icon: Icons.users(20), color: C.purple, bg: C.purpleBg },
            { label: 'Revenue (MRR)', value: '$—', icon: Icons.dollar(20), color: C.warning, bg: C.warningBg },
          ].map((s, i) => (
            <div key={i} style={{ ...card, padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, background: s.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, flexShrink: 0,
              }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 500, marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Filter Bar ───────────────────────────────────────────────── */}
        <div style={{ ...card, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 180 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textMuted }}>
              {Icons.search(15)}
            </span>
            <input
              placeholder="Search organizations..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle(), paddingLeft: 32, width: '100%' }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ ...selectStyle(), width: 140 }}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deleted">Deleted</option>
          </select>
          <span style={{ fontSize: 13, color: C.textMuted }}>
            {filtered.length} organization{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── Organizations Table ──────────────────────────────────────── */}
        <div style={{ ...card, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: C.textMuted, fontSize: 14 }}>
              Loading organizations...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: C.textMuted, fontSize: 14 }}>
              {search || statusFilter !== 'all' ? 'No organizations match your filters.' : 'No organizations yet. Add one to get started.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: `1px solid ${C.border}` }}>
                    {['Org Name', 'Industry', 'Plan', 'Status', 'Contacts', 'Created', 'Actions'].map(h => (
                      <th key={h} style={{
                        padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600,
                        color: C.textLabel, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((org, idx) => {
                    const sb = STATUS_BADGE[org.status] || STATUS_BADGE.active
                    const pb = PLAN_BADGE[org.plan] || PLAN_BADGE.free
                    return (
                      <tr
                        key={org.id}
                        onClick={() => onEnterOrg(org.id)}
                        style={{
                          borderBottom: `1px solid ${C.borderLight}`,
                          background: idx % 2 === 0 ? C.white : '#FAFBFC',
                          cursor: 'pointer',
                          transition: 'background 120ms ease',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = C.primaryBg}
                        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? C.white : '#FAFBFC'}
                      >
                        {/* Name */}
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: C.text, whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 30, height: 30, borderRadius: 6,
                              background: `linear-gradient(135deg, ${pb.bg}, ${pb.color}22)`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: pb.color, fontSize: 13, fontWeight: 700, flexShrink: 0,
                            }}>
                              {(org.name || '?')[0].toUpperCase()}
                            </div>
                            {org.name}
                          </div>
                        </td>
                        {/* Industry */}
                        <td style={{ padding: '12px 14px', color: C.textSec }}>
                          {INDUSTRY_LABELS[org.industry] || org.industry || '—'}
                        </td>
                        {/* Plan */}
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 10px', borderRadius: 99,
                            fontSize: 12, fontWeight: 600, color: pb.color, background: pb.bg,
                          }}>
                            {(org.plan || 'free').charAt(0).toUpperCase() + (org.plan || 'free').slice(1)}
                          </span>
                        </td>
                        {/* Status */}
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 10px', borderRadius: 99,
                            fontSize: 12, fontWeight: 600, color: sb.color, background: sb.bg,
                            border: `1px solid ${sb.border}`,
                          }}>
                            {(org.status || 'active').charAt(0).toUpperCase() + (org.status || 'active').slice(1)}
                          </span>
                        </td>
                        {/* Contacts */}
                        <td style={{ padding: '12px 14px', color: C.textSec, fontVariantNumeric: 'tabular-nums' }}>
                          {org.contact_count != null ? org.contact_count.toLocaleString() : '—'}
                        </td>
                        {/* Created */}
                        <td style={{ padding: '12px 14px', color: C.textMuted, fontSize: 13, whiteSpace: 'nowrap' }}>
                          {org.created_at ? new Date(org.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </td>
                        {/* Actions */}
                        <td style={{ padding: '12px 14px' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                            <button
                              onClick={() => onEnterOrg(org.id)}
                              style={makeBtn('primary', { height: 28, fontSize: 12, padding: '0 10px' })}
                            >Enter</button>

                            {org.status === 'active' ? (
                              <button
                                onClick={() => updateOrgStatus(org.id, 'suspended')}
                                style={makeBtn('secondary', { height: 28, fontSize: 12, padding: '0 10px', color: C.warning })}
                              >Suspend</button>
                            ) : org.status === 'suspended' ? (
                              <button
                                onClick={() => updateOrgStatus(org.id, 'active')}
                                style={makeBtn('success', { height: 28, fontSize: 12, padding: '0 10px' })}
                              >Activate</button>
                            ) : null}

                            <select
                              value={org.plan || 'free'}
                              onChange={e => updateOrgPlan(org.id, e.target.value)}
                              style={{
                                height: 28, fontSize: 12, borderRadius: 6,
                                border: `1px solid ${C.border}`, background: C.white,
                                padding: '0 6px', color: C.textSec, cursor: 'pointer',
                                fontFamily: 'inherit', outline: 'none',
                              }}
                            >
                              {PLAN_OPTIONS.map(p => (
                                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                              ))}
                            </select>

                            <button
                              onClick={() => setConfirmDelete(org)}
                              style={makeBtn('ghost', { height: 28, fontSize: 12, padding: '0 8px', color: C.danger })}
                              title="Delete organization"
                            >{Icons.trash(14)}</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Demo mode notice */}
        {!isSupabaseConfigured() && (
          <div style={{
            marginTop: 16, padding: '10px 16px', borderRadius: 8,
            background: C.warningBg, border: `1px solid ${C.warningBorder}`,
            fontSize: 13, color: C.warningText, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {Icons.bolt(15)}
            Running in demo mode with sample data. Connect Supabase to manage real organizations.
          </div>
        )}
      </div>

      {/* ── Add Organization Modal ─────────────────────────────────────── */}
      {showAddModal && (
        <Modal onClose={() => setShowAddModal(false)} width={480}>
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>Add Organization</h2>
              <button onClick={() => setShowAddModal(false)} style={makeBtn('ghost', { height: 28, width: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' })}>
                {Icons.x(16)}
              </button>
            </div>

            <FormField label="Organization Name">
              <input
                placeholder="e.g. Bright Dental Clinic"
                value={newOrg.name}
                onChange={e => setNewOrg(p => ({ ...p, name: e.target.value }))}
                style={inputStyle()}
                autoFocus
              />
            </FormField>

            <FormField label="Industry">
              <select
                value={newOrg.industry}
                onChange={e => setNewOrg(p => ({ ...p, industry: e.target.value }))}
                style={selectStyle()}
              >
                {INDUSTRY_OPTIONS.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Plan">
              <select
                value={newOrg.plan}
                onChange={e => setNewOrg(p => ({ ...p, plan: e.target.value }))}
                style={selectStyle()}
              >
                {PLAN_OPTIONS.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Admin Email (invite)">
              <input
                type="email"
                placeholder="admin@example.com"
                value={newOrg.admin_email}
                onChange={e => setNewOrg(p => ({ ...p, admin_email: e.target.value }))}
                style={inputStyle()}
              />
            </FormField>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
              <button onClick={() => setShowAddModal(false)} style={makeBtn('secondary')}>Cancel</button>
              <button
                onClick={handleAddOrg}
                disabled={saving || !newOrg.name.trim()}
                style={makeBtn('primary', { opacity: saving || !newOrg.name.trim() ? 0.5 : 1 })}
              >
                {saving ? 'Creating...' : 'Create Organization'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete Confirm Modal ───────────────────────────────────────── */}
      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)} width={420}>
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: C.dangerBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.danger,
              }}>{Icons.trash(20)}</div>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>Delete Organization</h2>
                <p style={{ fontSize: 13, color: C.textMuted, margin: '2px 0 0' }}>This action cannot be undone.</p>
              </div>
            </div>
            <p style={{ fontSize: 14, color: C.textSec, margin: '0 0 20px', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete <strong>{confirmDelete.name}</strong> and all its associated data?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setConfirmDelete(null)} style={makeBtn('secondary')}>Cancel</button>
              <button onClick={() => deleteOrg(confirmDelete.id)} style={makeBtn('danger')}>
                {Icons.trash(14)} Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
