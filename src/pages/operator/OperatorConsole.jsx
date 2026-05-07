import { useState, useEffect } from 'react'
import { makeBtn, card } from '../../design'
import { Icons, Modal, FormField, inputStyle, selectStyle } from '../../components/shared'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import { withTimeout } from '../../lib/sanitize'

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  active:    { color: '#00FFB2', bg: 'rgba(0,255,178,0.08)', border: 'rgba(0,255,178,0.2)' },
  suspended: { color: '#FFB347', bg: 'rgba(255,179,71,0.08)', border: 'rgba(255,179,71,0.2)' },
  deleted:   { color: '#FF6B6B', bg: 'rgba(255,107,107,0.08)', border: 'rgba(255,107,107,0.2)' },
}

const SAMPLE_ORGS = [
  { id: 'demo-1', name: 'Bright Dental Clinic',  status: 'active',    created_at: '2025-11-01T10:00:00Z' },
  { id: 'demo-2', name: 'Skyline Real Estate',   status: 'active',    created_at: '2025-09-15T08:30:00Z' },
  { id: 'demo-3', name: 'Glow Beauty Spa',       status: 'active',    created_at: '2025-12-20T14:00:00Z' },
  { id: 'demo-4', name: 'Justice Partners LLP',  status: 'suspended', created_at: '2026-01-05T09:00:00Z' },
  { id: 'demo-5', name: 'Mama Rosa Restaurant',  status: 'active',    created_at: '2026-02-14T12:00:00Z' },
  { id: 'demo-6', name: 'Ali Consulting Group',  status: 'deleted',   created_at: '2025-06-10T16:45:00Z' },
]

const AVATAR_TINT = { color: '#A78BFA', bg: 'rgba(167,139,250,0.08)' }

// ─── Component ──────────────────────────────────────────────────────────────

export default function OperatorConsole({ user, onEnterOrg, onSignOut }) {
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [newOrg, setNewOrg] = useState({ name: '', admin_email: '' })
  const [saving, setSaving] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState(null)
  // shape: null | { orgName: string, email: string, inviteUrl: string }
  const [copied, setCopied] = useState(false)

  // ── Fetch organizations ─────────────────────────────────────────────────

  useEffect(() => { fetchOrgs() }, [])

  async function fetchOrgs() {
    setLoading(true)
    if (isSupabaseConfigured()) {
      try {
        const fetchOrgsLogic = async () => {
          const { data, error } = await supabase
            .from('orgs')
            .select('*')
            .order('created_at', { ascending: false })
          if (error) throw error
          return data || []
        }
        const rows = await withTimeout(fetchOrgsLogic(), 10000)
        setOrgs(rows)
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
      const { data: session } = await supabase.auth.getSession()
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.session?.access_token}` },
        body: JSON.stringify({ action: 'updateOrgStatus', payload: { id: orgId, status } })
      })
      if (!res.ok) { console.error(await res.text()); return }
    }
    setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, status } : o))
  }

  async function deleteOrg(orgId) {
    if (isSupabaseConfigured()) {
      const { data: session } = await supabase.auth.getSession()
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.session?.access_token}` },
        body: JSON.stringify({ action: 'deleteOrg', payload: { id: orgId } })
      })
      if (!res.ok) { console.error(await res.text()); return }
    }
    setOrgs(prev => prev.filter(o => o.id !== orgId))
    setConfirmDelete(null)
  }

  async function handleAddOrg() {
    const name = newOrg.name.trim()
    if (!name) return
    setSaving(true)
    if (isSupabaseConfigured()) {
      try {
        const { data: session } = await supabase.auth.getSession()
        const res = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.session?.access_token}` },
          body: JSON.stringify({ action: 'createOrg', payload: { name, admin_email: newOrg.admin_email } })
        })
        const result = await res.json()
        if (!res.ok) throw new Error(result.error || 'Failed to create org')

        setOrgs(prev => [result.org, ...prev])
        if (result.invite?.url) {
          setInviteSuccess({
            orgName: result.org.name,
            email: newOrg.admin_email,
            inviteUrl: result.invite.url,
          })
        }
      } catch (err) {
        console.error('Failed to create org:', err)
      }
    } else {
      const demo = {
        id: 'demo-' + Date.now(),
        name,
        status: 'active',
        created_at: new Date().toISOString(),
      }
      setOrgs(prev => [demo, ...prev])
    }
    setSaving(false)
    setNewOrg({ name: '', admin_email: '' })
    setShowAddModal(false)
  }

  async function copyInviteUrl() {
    if (!inviteSuccess?.inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteSuccess.inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.warn('Clipboard write failed:', err)
      const el = document.getElementById('velo-operator-invite-link-input')
      if (el && el.select) el.select()
    }
  }

  // ── Derived data ────────────────────────────────────────────────────────

  const filtered = orgs.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (o.name || '').toLowerCase().includes(q)
    }
    return true
  })

  const totalOrgs = orgs.length
  const totalActive = orgs.filter(o => o.status === 'active').length

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="velo-grid-bg" style={{ minHeight: '100vh', background: '#07080E', fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif" }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        background: '#0C0E1A',
        padding: '0 32px',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(0,255,178,0.12)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: 'linear-gradient(135deg, #00FFB2, #A78BFA)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 15,
            boxShadow: '0 0 16px rgba(0,255,178,0.3)',
          }}>V</div>
          <span style={{ color: '#E8EAF5', fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>
            Velo Agency
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'rgba(0,255,178,0.12)', color: '#00FFB2', letterSpacing: '0.06em', textTransform: 'uppercase', border: '1px solid rgba(0,255,178,0.2)' }}>PRO</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: '#3A3D55', fontSize: 13 }}>{user?.email || ''}</span>
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
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, letterSpacing: '-0.03em', color: '#E8EAF5', margin: 0 }}>Agency Dashboard</h1>
            <p style={{ fontSize: 13, color: '#3A3D55', margin: '4px 0 0' }}>
              Manage all organizations and access
            </p>
          </div>
          <button onClick={() => setShowAddModal(true)} className="velo-btn-primary" style={makeBtn('primary', { height: 38, fontSize: 14 })}>
            {Icons.plus(15)}
            Add Organization
          </button>
        </div>

        {/* ── Stats Cards ──────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Total Organizations', value: totalOrgs, icon: Icons.building(20), color: '#00FFB2', glowClass: 'velo-card-glow-cyan' },
            { label: 'Active', value: totalActive, icon: Icons.check(20), color: '#00FFB2', glowClass: 'velo-card-glow-green' },
            { label: 'Revenue (MRR)', value: '$\u2014', icon: Icons.dollar(20), color: '#FFB347', glowClass: 'velo-card-glow-yellow' },
          ].map((s, i) => (
            <div key={i} className={`velo-card ${s.glowClass}`} style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, background: `${s.color}12`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, flexShrink: 0,
                border: `1px solid ${s.color}20`,
              }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 12, color: '#3A3D55', fontWeight: 500, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 800, color: s.color, letterSpacing: '-0.02em' }}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Filter Bar ───────────────────────────────────────────────── */}
        <div className="velo-card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 180 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#3A3D55' }}>
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
          <span style={{ fontSize: 13, color: '#3A3D55' }}>
            {filtered.length} organization{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── Organizations Table ──────────────────────────────────────── */}
        <div className="velo-card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#3A3D55', fontSize: 14 }}>
              Loading organizations...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#3A3D55', fontSize: 14 }}>
              {search || statusFilter !== 'all' ? 'No organizations match your filters.' : 'No organizations yet. Add one to get started.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#0C0E1A', borderBottom: '1px solid rgba(0,255,178,0.12)' }}>
                    {['Org Name', 'Status', 'Created', 'Actions'].map(h => (
                      <th key={h} style={{
                        padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                        color: '#3A3D55', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((org, idx) => {
                    const sb = STATUS_BADGE[org.status] || STATUS_BADGE.active
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
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,255,178,0.04)'}
                        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'}
                      >
                        {/* Name */}
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#E8EAF5', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 30, height: 30, borderRadius: 6,
                              background: `linear-gradient(135deg, ${AVATAR_TINT.bg}, ${AVATAR_TINT.color}15)`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: AVATAR_TINT.color, fontSize: 13, fontWeight: 700, flexShrink: 0,
                              border: `1px solid ${AVATAR_TINT.color}25`,
                            }}>
                              {(org.name || '?')[0].toUpperCase()}
                            </div>
                            {org.name}
                          </div>
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
                        {/* Created */}
                        <td style={{ padding: '12px 14px', color: '#3A3D55', fontSize: 13, whiteSpace: 'nowrap' }}>
                          {org.created_at ? new Date(org.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014'}
                        </td>
                        {/* Actions */}
                        <td style={{ padding: '12px 14px' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                            <button
                              onClick={() => onEnterOrg(org)}
                              className="velo-btn-primary" style={makeBtn('primary', { height: 28, fontSize: 12, padding: '0 10px' })}
                            >Enter</button>

                            {org.status === 'active' ? (
                              <button
                                onClick={() => updateOrgStatus(org.id, 'suspended')}
                                style={makeBtn('secondary', { height: 28, fontSize: 12, padding: '0 10px', color: '#FFB347' })}
                              >Suspend</button>
                            ) : org.status === 'suspended' ? (
                              <button
                                onClick={() => updateOrgStatus(org.id, 'active')}
                                style={makeBtn('success', { height: 28, fontSize: 12, padding: '0 10px' })}
                              >Activate</button>
                            ) : null}

                            <button
                              onClick={() => setConfirmDelete(org)}
                              style={makeBtn('ghost', { height: 28, fontSize: 12, padding: '0 8px', color: '#FF6B6B' })}
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
            background: 'rgba(255,179,71,0.08)', border: '1px solid rgba(255,179,71,0.15)',
            fontSize: 13, color: '#FFB347', display: 'flex', alignItems: 'center', gap: 8,
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
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#E8EAF5', margin: 0 }}>Add Organization</h2>
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
                className="velo-btn-primary" style={makeBtn('primary', { opacity: saving || !newOrg.name.trim() ? 0.5 : 1 })}
              >
                {saving ? 'Creating...' : 'Create Organization'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Invite Success Modal ───────────────────────────────────────── */}
      {inviteSuccess && (
        <Modal onClose={() => setInviteSuccess(null)} width={480}>
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#E8EAF5', margin: 0 }}>Organization created</h2>
              <button onClick={() => setInviteSuccess(null)} style={makeBtn('ghost', { height: 28, width: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' })}>
                {Icons.x(16)}
              </button>
            </div>

            <p style={{ fontSize: 13, color: '#7B7F9E', margin: '0 0 16px', lineHeight: 1.5 }}>
              <strong style={{ color: '#E8EAF5' }}>{inviteSuccess.orgName}</strong> is ready. Send this invite link to <strong style={{ color: '#E8EAF5' }}>{inviteSuccess.email}</strong> to onboard them as owner. Link expires in 7 days.
            </p>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                id="velo-operator-invite-link-input"
                type="text"
                readOnly
                value={inviteSuccess.inviteUrl}
                onClick={e => e.target.select()}
                style={{ ...inputStyle(), flex: 1, fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace", fontSize: 12 }}
              />
              <button
                onClick={copyInviteUrl}
                style={makeBtn('primary', { height: 42, fontSize: 14, minWidth: 88 })}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                onClick={() => setInviteSuccess(null)}
                style={makeBtn('secondary', { height: 38, fontSize: 14 })}
              >
                Done
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
                background: 'rgba(255,107,107,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#FF6B6B', border: '1px solid rgba(255,107,107,0.15)',
              }}>{Icons.trash(20)}</div>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#E8EAF5', margin: 0 }}>Delete Organization</h2>
                <p style={{ fontSize: 13, color: '#3A3D55', margin: '2px 0 0' }}>This action cannot be undone.</p>
              </div>
            </div>
            <p style={{ fontSize: 14, color: '#7B7F9E', margin: '0 0 20px', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete <strong style={{ color: '#E8EAF5' }}>{confirmDelete.name}</strong> and all its associated data?
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
