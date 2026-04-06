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
  free:       { color: '#64748b', bg: 'rgba(255,255,255,0.04)' },
  starter:    { color: '#00d4ff', bg: 'rgba(0,212,255,0.08)' },
  pro:        { color: '#7c3aed', bg: 'rgba(124,58,237,0.08)' },
  enterprise: { color: '#00ff88', bg: 'rgba(0,255,136,0.08)' },
}

const STATUS_BADGE = {
  active:    { color: '#00ff88', bg: 'rgba(0,255,136,0.08)', border: 'rgba(0,255,136,0.2)' },
  suspended: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
  deleted:   { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)' },
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

  const dataFont = "'JetBrains Mono', 'SF Mono', monospace"

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="velo-grid-bg" style={{ minHeight: '100vh', background: '#080c14', fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif" }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        background: '#0d1420',
        padding: '0 32px',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(0,212,255,0.12)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 15,
            boxShadow: '0 0 16px rgba(0,212,255,0.3)',
          }}>V</div>
          <span style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>
            Velo Agency
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'rgba(0,212,255,0.12)', color: '#00d4ff', letterSpacing: '0.06em', textTransform: 'uppercase', border: '1px solid rgba(0,212,255,0.2)' }}>PRO</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: '#475569', fontSize: 13 }}>{user?.email || 'alialjobory89@gmail.com'}</span>
          <button onClick={onSignOut} style={makeBtn('secondary', { height: 32, fontSize: 13 })}>
            Sign Out
          </button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 32px' }}>

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Agency Dashboard</h1>
            <p style={{ fontSize: 13, color: '#475569', margin: '4px 0 0' }}>
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
            { label: 'Total Organizations', value: totalOrgs, icon: Icons.building(20), color: '#00d4ff', glowClass: 'velo-card-glow-cyan' },
            { label: 'Active', value: totalActive, icon: Icons.check(20), color: '#00ff88', glowClass: 'velo-card-glow-green' },
            { label: 'Total Contacts', value: totalContacts.toLocaleString(), icon: Icons.users(20), color: '#7c3aed', glowClass: 'velo-card-glow-purple' },
            { label: 'Revenue (MRR)', value: '$\u2014', icon: Icons.dollar(20), color: '#f59e0b', glowClass: 'velo-card-glow-yellow' },
          ].map((s, i) => (
            <div key={i} className={`velo-card ${s.glowClass}`} style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, background: `${s.color}12`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, flexShrink: 0,
                border: `1px solid ${s.color}20`,
              }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 12, color: '#475569', fontWeight: 500, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: s.color, fontFamily: dataFont, letterSpacing: '-0.02em' }}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Filter Bar ───────────────────────────────────────────────── */}
        <div className="velo-card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 180 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }}>
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
          <span style={{ fontSize: 13, color: '#475569' }}>
            {filtered.length} organization{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── Organizations Table ──────────────────────────────────────── */}
        <div className="velo-card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#475569', fontSize: 14 }}>
              Loading organizations...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#475569', fontSize: 14 }}>
              {search || statusFilter !== 'all' ? 'No organizations match your filters.' : 'No organizations yet. Add one to get started.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#0d1420', borderBottom: '1px solid rgba(0,212,255,0.12)' }}>
                    {['Org Name', 'Industry', 'Plan', 'Status', 'Contacts', 'Created', 'Actions'].map(h => (
                      <th key={h} style={{
                        padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                        color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap',
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
                        onClick={() => onEnterOrg(org)}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                          cursor: 'pointer',
                          transition: 'background 150ms ease',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,212,255,0.04)'}
                        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'}
                      >
                        {/* Name */}
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 30, height: 30, borderRadius: 6,
                              background: `linear-gradient(135deg, ${pb.bg}, ${pb.color}15)`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: pb.color, fontSize: 13, fontWeight: 700, flexShrink: 0,
                              border: `1px solid ${pb.color}25`,
                            }}>
                              {(org.name || '?')[0].toUpperCase()}
                            </div>
                            {org.name}
                          </div>
                        </td>
                        {/* Industry */}
                        <td style={{ padding: '12px 14px', color: '#94a3b8' }}>
                          {INDUSTRY_LABELS[org.industry] || org.industry || '\u2014'}
                        </td>
                        {/* Plan */}
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 10px', borderRadius: 99,
                            fontSize: 12, fontWeight: 600, color: pb.color, background: pb.bg,
                            border: `1px solid ${pb.color}20`,
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
                        <td style={{ padding: '12px 14px', color: '#94a3b8', fontFamily: dataFont, fontSize: 13 }}>
                          {org.contact_count != null ? org.contact_count.toLocaleString() : '\u2014'}
                        </td>
                        {/* Created */}
                        <td style={{ padding: '12px 14px', color: '#475569', fontSize: 13, whiteSpace: 'nowrap' }}>
                          {org.created_at ? new Date(org.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014'}
                        </td>
                        {/* Actions */}
                        <td style={{ padding: '12px 14px' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                            <button
                              onClick={() => onEnterOrg(org)}
                              style={makeBtn('primary', { height: 28, fontSize: 12, padding: '0 10px' })}
                            >Enter</button>

                            {org.status === 'active' ? (
                              <button
                                onClick={() => updateOrgStatus(org.id, 'suspended')}
                                style={makeBtn('secondary', { height: 28, fontSize: 12, padding: '0 10px', color: '#f59e0b' })}
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
                                border: '1px solid rgba(255,255,255,0.08)', background: '#0d1420',
                                padding: '0 6px', color: '#94a3b8', cursor: 'pointer',
                                fontFamily: 'inherit', outline: 'none',
                              }}
                            >
                              {PLAN_OPTIONS.map(p => (
                                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                              ))}
                            </select>

                            <button
                              onClick={() => setConfirmDelete(org)}
                              style={makeBtn('ghost', { height: 28, fontSize: 12, padding: '0 8px', color: '#ef4444' })}
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
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)',
            fontSize: 13, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 8,
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
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Add Organization</h2>
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
                background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)',
              }}>{Icons.trash(20)}</div>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Delete Organization</h2>
                <p style={{ fontSize: 13, color: '#475569', margin: '2px 0 0' }}>This action cannot be undone.</p>
              </div>
            </div>
            <p style={{ fontSize: 14, color: '#94a3b8', margin: '0 0 20px', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete <strong style={{ color: '#e2e8f0' }}>{confirmDelete.name}</strong> and all its associated data?
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
