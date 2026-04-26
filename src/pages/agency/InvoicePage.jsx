import { useState, useEffect } from 'react'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import { C, makeBtn } from '../../design'
import { Icons, Modal, FormField, inputStyle, selectStyle } from '../../components/shared'
import { withTimeout } from '../../lib/sanitize'

const STATUS_BADGE = {
  paid: { color: '#00ff88', bg: 'rgba(0,255,136,0.08)', border: 'rgba(0,255,136,0.2)' },
  pending: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
  overdue: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)' },
}

const PLAN_PRICES = {
  free: 0,
  starter: 29,
  pro: 79,
  enterprise: 199,
}

export default function InvoicePage() {
  const [invoices, setInvoices] = useState([])
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const defaultIssue = new Date().toISOString().split('T')[0]
  const defaultDue = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const [form, setForm] = useState({
    org_id: '',
    plan: 'starter',
    amount: 29,
    issue_date: defaultIssue,
    due_date: defaultDue,
    notes: ''
  })
  const [toastMsg, setToastMsg] = useState(null)

  const showToast = (msg) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3000)
  }

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    if (isSupabaseConfigured()) {
      try {
        const [{ data: invs, error: invErr }, { data: orgData, error: orgErr }] = await withTimeout(Promise.all([
          supabase.from('invoices').select('*').order('created_at', { ascending: false }),
          supabase.from('organizations').select('id, name')
        ]), 10000)
        
        if (invErr) throw invErr
        if (orgErr) throw orgErr

        const orgMap = (orgData || []).reduce((acc, org) => {
          acc[org.id] = org.name
          return acc
        }, {})

        const mappedInvoices = (invs || []).map(inv => {
          let status = inv.status
          // Determine if overdue dynamically
          if (status === 'pending' && new Date(inv.due_date) < new Date()) {
            status = 'overdue'
          }
          return {
            ...inv,
            status,
            org_name: orgMap[inv.org_id] || 'Unknown Organization'
          }
        })

        setInvoices(mappedInvoices)
        setOrgs(orgData || [])
      } catch (err) {
        console.error('Failed to fetch data:', err)
        showToast(err.message || 'Timeout loading data')
      }
    } else {
      setInvoices([
        { id: '1', org_id: 'demo-1', org_name: 'Bright Dental Clinic', amount: 79, plan: 'pro', status: 'paid', issue_date: '2026-04-01', due_date: '2026-04-15' },
        { id: '2', org_id: 'demo-2', org_name: 'Glow Beauty Spa', amount: 29, plan: 'starter', status: 'pending', issue_date: '2026-04-05', due_date: '2026-04-19' },
        { id: '3', org_id: 'demo-3', org_name: 'Skyline Real Estate', amount: 199, plan: 'enterprise', status: 'overdue', issue_date: '2026-03-01', due_date: '2026-03-15' },
      ])
      setOrgs([
        { id: 'demo-1', name: 'Bright Dental Clinic' },
        { id: 'demo-2', name: 'Glow Beauty Spa' },
        { id: 'demo-3', name: 'Skyline Real Estate' },
      ])
    }
    setLoading(false)
  }

  const markAsPaid = async (invoiceId) => {
    const today = new Date().toISOString()
    if (isSupabaseConfigured()) {
      try {
        await supabase.from('invoices').update({ status: 'paid', paid_date: today }).eq('id', invoiceId)
        showToast('Invoice marked as paid')
        fetchData()
      } catch (err) {
        console.error('Failed to mark as paid:', err)
      }
    } else {
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, status: 'paid', paid_date: today } : inv))
      showToast('Invoice marked as paid')
    }
  }

  const sendReminder = async (invoiceId) => {
    // Here we'd integrate email delivery. Logging for demo.
    console.log(`Reminder sent for invoice: ${invoiceId}`)
    showToast('Reminder sent to client')
  }

  const deleteInvoice = async (invoiceId) => {
    if (isSupabaseConfigured()) {
      try {
        await supabase.from('invoices').delete().eq('id', invoiceId)
        showToast('Invoice deleted')
        fetchData()
      } catch (err) {
        console.error('Failed to delete invoice:', err)
      }
    } else {
      setInvoices(prev => prev.filter(inv => inv.id !== invoiceId))
      showToast('Invoice deleted')
    }
  }

  const handlePlanChange = (e) => {
    const plan = e.target.value
    setForm(prev => ({ ...prev, plan, amount: PLAN_PRICES[plan] || 0 }))
  }

  const handleCreateInvoice = async () => {
    if (!form.org_id) return alert('Please select an organization')
    
    setSaving(true)
    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('invoices').insert({
          org_id: form.org_id,
          amount: parseFloat(form.amount),
          plan: form.plan,
          status: 'pending',
          issue_date: new Date(form.issue_date).toISOString(),
          due_date: new Date(form.due_date).toISOString(),
          notes: form.notes
        })
        if (error) throw error
        showToast('Invoice created successfully')
        setShowModal(false)
        fetchData()
      } catch (err) {
        console.error('Failed to create invoice:', err)
        alert('Error creating invoice')
      }
    } else {
      // Demo mode
      const selectedOrg = orgs.find(o => o.id === form.org_id)
      const newInv = {
        id: Date.now().toString(),
        org_id: form.org_id,
        org_name: selectedOrg?.name,
        amount: parseFloat(form.amount),
        plan: form.plan,
        status: 'pending',
        issue_date: form.issue_date,
        due_date: form.due_date,
        notes: form.notes
      }
      setInvoices(prev => [newInv, ...prev])
      showToast('Invoice created successfully (Demo)')
      setShowModal(false)
    }
    setSaving(false)
  }

  // Derived Stats
  const totalInvoices = invoices.length
  let pendingAmount = 0
  let paidThisMonth = 0
  let overdueCount = 0

  const currentMonthIdx = new Date().getMonth()

  invoices.forEach(inv => {
    const amt = parseFloat(inv.amount || 0)
    if (inv.status === 'pending') {
      pendingAmount += amt
    } else if (inv.status === 'overdue') {
      pendingAmount += amt
      overdueCount++
    } else if (inv.status === 'paid' && inv.paid_date) {
      const paidMonth = new Date(inv.paid_date).getMonth()
      if (paidMonth === currentMonthIdx) {
        paidThisMonth += amt
      }
    }
  })

  // Theme overrides
  const cardBg = '#101422' // Slate 900
  const cyanAccent = '#00FFB2'
  const textMuted = '#9ca3af' // Slate 400

  return (
    <div style={{ padding: '24px', background: '#0a0f1a', minHeight: '100vh', color: '#e2e8f0', fontFamily: "'Inter', sans-serif" }}>
      {/* Toast Notification */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: '#10b981', color: '#fff',
          padding: '12px 20px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', fontWeight: 600, fontSize: 13,
          animation: 'slideIn 0.3s ease'
        }}>
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#fff' }}>Invoices</h1>
        <button className="velo-btn-primary" style={makeBtn('primary')} onClick={() => setShowModal(true)}>
          {Icons.plus(16)} Create Invoice
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total Invoices', value: totalInvoices, color: cyanAccent },
          { label: 'Pending Amount', value: `$${pendingAmount.toFixed(2)}`, color: '#f59e0b' },
          { label: 'Paid This Month', value: `$${paidThisMonth.toFixed(2)}`, color: '#00ff88' },
          { label: 'Overdue Count', value: overdueCount, color: '#ef4444' },
        ].map((s, i) => (
          <div key={i} style={{ background: cardBg, padding: 20, borderRadius: 12, border: `1px solid rgba(255,255,255,0.05)` }}>
            <div style={{ fontSize: 12, color: textMuted, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Invoices List */}
      <div style={{ background: cardBg, borderRadius: 12, border: `1px solid rgba(255,255,255,0.05)`, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: textMuted }}>Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: textMuted }}>No invoices found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: `1px solid rgba(0,255,178,0.12)` }}>
                  {['Org Name', 'Plan', 'Amount', 'Issue Date', 'Due Date', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 600, color: textMuted, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, idx) => {
                  const sb = STATUS_BADGE[inv.status] || STATUS_BADGE.pending
                  const planColor = inv.plan === 'enterprise' ? '#00ff88' : inv.plan === 'pro' ? '#7c3aed' : inv.plan === 'starter' ? '#00FFB2' : textMuted
                  
                  return (
                    <tr key={inv.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)', transition: 'background 0.2s', '&:hover': { background: 'rgba(255,255,255,0.05)' } }}>
                      <td style={{ padding: '14px 20px', fontWeight: 600, color: '#f3f4f6' }}>{inv.org_name}</td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ color: planColor, background: `${planColor}15`, border: `1px solid ${planColor}30`, padding: '2px 8px', borderRadius: 99, fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>
                          {inv.plan}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', fontWeight: 700, color: '#f3f4f6' }}>${inv.amount}</td>
                      <td style={{ padding: '14px 20px', color: textMuted }}>{new Date(inv.issue_date || inv.created_at).toLocaleDateString()}</td>
                      <td style={{ padding: '14px 20px', color: textMuted }}>{new Date(inv.due_date).toLocaleDateString()}</td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, color: sb.color, background: sb.bg, border: `1px solid ${sb.border}`, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {inv.status}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {inv.status !== 'paid' && (
                            <>
                              <button style={{ ...makeBtn('success', { fontSize: 12, padding: '4px 10px', height: 28 }), background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }} onClick={() => markAsPaid(inv.id)}>
                                {Icons.check(14)} Mark Paid
                              </button>
                              <button className="velo-btn-primary" style={{ ...makeBtn('primary', { fontSize: 12, padding: '4px 10px', height: 28 }), background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.2)' }} onClick={() => sendReminder(inv.id)}>
                                {Icons.mail(14)} Remind
                              </button>
                            </>
                          )}
                          <button style={{ ...makeBtn('ghost', { fontSize: 12, padding: '4px 10px', height: 28, color: '#ef4444' }) }} onClick={() => deleteInvoice(inv.id)} title="Delete Invoice">
                            {Icons.trash(14)}
                          </button>
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

      {/* Create Invoice Modal */}
      {showModal && (
        <Modal onClose={() => setShowModal(false)} width={480}>
          <div style={{ padding: 24, background: cardBg, borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>Create Invoice</h2>
              <button onClick={() => setShowModal(false)} style={makeBtn('ghost', { height: 28, width: 28, padding: 0 })}>
                {Icons.x(16)}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <FormField label="Organization">
                <select
                  value={form.org_id}
                  onChange={e => setForm(p => ({ ...p, org_id: e.target.value }))}
                  style={selectStyle('ltr')}
                >
                  <option value="">Select an organization...</option>
                  {orgs.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </FormField>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <FormField label="Plan">
                  <select
                    value={form.plan}
                    onChange={handlePlanChange}
                    style={selectStyle('ltr')}
                  >
                    <option value="free">Free ($0)</option>
                    <option value="starter">Starter ($29)</option>
                    <option value="pro">Pro ($79)</option>
                    <option value="enterprise">Enterprise ($199)</option>
                  </select>
                </FormField>

                <FormField label="Amount ($)">
                  <input
                    type="number"
                    value={form.amount}
                    onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                    style={inputStyle('ltr')}
                  />
                </FormField>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <FormField label="Issue Date">
                  <input
                    type="date"
                    value={form.issue_date}
                    onChange={e => setForm(p => ({ ...p, issue_date: e.target.value }))}
                    style={inputStyle('ltr')}
                  />
                </FormField>

                <FormField label="Due Date">
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                    style={inputStyle('ltr')}
                  />
                </FormField>
              </div>

              <FormField label="Notes (optional)">
                <textarea
                  value={form.notes}
                  placeholder="Additional invoice details..."
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  style={{ ...inputStyle('ltr'), height: 80, padding: '10px 12px', resize: 'vertical' }}
                />
              </FormField>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
              <button onClick={() => setShowModal(false)} style={makeBtn('secondary')}>Cancel</button>
              <button
                onClick={handleCreateInvoice}
                disabled={saving || !form.org_id}
                className="velo-btn-primary" style={makeBtn('primary', { opacity: saving || !form.org_id ? 0.5 : 1 })}
              >
                {saving ? 'Creating...' : 'Create Invoice'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Global CSS for sliding in toast */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateY(100px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
