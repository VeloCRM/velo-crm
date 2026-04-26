import { useState, useEffect } from 'react'
import { C, makeBtn, card } from '../design'
import { Icons, Modal, FormField, inputStyle, selectStyle } from '../components/shared'
import { isPositiveNumber, sanitizeText, withTimeout } from '../lib/sanitize'
import { fetchAllPayments, fetchOrganizations } from '../lib/database'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const CURRENCY_SYMBOLS = { USD:'$', EUR:'€', GBP:'£', IQD:'IQD ', AED:'AED ', SAR:'SAR ' }
const fmtMoney = (n, c) => (CURRENCY_SYMBOLS[c] || '$') + Number(n||0).toLocaleString()

const EXPENSE_CATEGORIES = [
  { id:'rent', en:'Rent', ar:'إيجار', color:'#2563EB', bg:C.primaryBg },
  { id:'salaries', en:'Salaries', ar:'رواتب', color:'#7C3AED', bg:C.purpleBg },
  { id:'marketing', en:'Marketing', ar:'تسويق', color:'#E16F24', bg:'#FFF1E5' },
  { id:'software', en:'Software', ar:'برمجيات', color:'#0D9488', bg:'#D5F5F0' },
  { id:'equipment', en:'Equipment', ar:'معدات', color:'#D97706', bg:C.warningBg },
  { id:'other', en:'Other', ar:'أخرى', color:'#9CA3AF', bg:C.bg },
]

const PAYMENT_METHODS_LABELS = { cash:'Cash', bank_transfer:'Bank Transfer', card:'Card', zaincash:'ZainCash', fib:'FIB', asia_hawala:'Asia Hawala' }

function loadExpenses() { try { return JSON.parse(localStorage.getItem('velo_expenses')||'[]') } catch { return [] } }
function saveExpenses(e) { localStorage.setItem('velo_expenses', JSON.stringify(e)) }

function resolveStatus(p) {
  if (p.status === 'cancelled' || p.status === 'paid') return p.status
  if (p.status === 'pending' && p.dueDate && new Date(p.dueDate) < new Date()) return 'overdue'
  return p.status
}

const thStyle = (isRTL) => ({
  padding: '10px 16px',
  textAlign: isRTL ? 'right' : 'left',
  fontWeight: 500,
  color: '#374151',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
})

const SUBSCRIPTION_PRICING = { free: 0, starter: 29, pro: 79, enterprise: 199 }

export default function FinancePage({ t, lang, dir, isRTL, contacts, currency, toast, showConfirm, isSuperAdmin, orgPayments }) {
  const [tab, setTab] = useState('overview')
  const [expenses, setExpenses] = useState(loadExpenses)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [expenseForm, setExpenseForm] = useState({ amount:'', currency: currency||'USD', category:'other', date:new Date().toISOString().slice(0,10), description:'', receipt:'' })
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [orgs, setOrgs] = useState([])

  // Fetch data: subscription orgs for agency view, payments for org view
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        if (isSuperAdmin) {
          // Agency view — fetch organizations for subscription revenue
          const data = await withTimeout(fetchOrganizations(), 10000)
          if (!cancelled) setOrgs(data)
        } else if (orgPayments) {
          if (!cancelled) setPayments(orgPayments)
        } else if (isSupabaseConfigured()) {
          const data = await withTimeout(fetchAllPayments(), 10000)
          if (!cancelled) setPayments(data)
        }
      } catch (err) {
        console.error('Finance load error:', err)
        toast(err.message || 'Timeout loading financial data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [isSuperAdmin, orgPayments])

  // Map contact names onto payments
  const contactMap = Object.fromEntries(contacts.map(c => [c.id, c.name]))
  const allPayments = payments.map(p => ({
    ...p,
    contactName: p.contactName || contactMap[p.contactId] || '',
    _resolved: resolveStatus(p),
  }))

  // Group totals by currency
  const currencies = [...new Set(allPayments.map(p => p.currency || 'USD'))]
  if (currencies.length === 0) currencies.push(currency || 'USD')

  const totalsByCurrency = {}
  currencies.forEach(cur => {
    const forCur = allPayments.filter(p => (p.currency || 'USD') === cur)
    totalsByCurrency[cur] = {
      paid: forCur.filter(p => p._resolved === 'paid').reduce((s, p) => s + Number(p.amount || 0), 0),
      pending: forCur.filter(p => p._resolved === 'pending' || p._resolved === 'overdue').reduce((s, p) => s + Number(p.amount || 0), 0),
      overdue: forCur.filter(p => p._resolved === 'overdue').reduce((s, p) => s + Number(p.amount || 0), 0),
    }
  })

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0)

  const paidPayments = allPayments.filter(p => p._resolved === 'paid').sort((a, b) => (b.paymentDate || b.createdAt || '').localeCompare(a.paymentDate || a.createdAt || ''))
  const pendingPayments = allPayments.filter(p => p._resolved === 'pending' || p._resolved === 'overdue').sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9'))

  const addExpense = () => {
    if (!expenseForm.amount || !isPositiveNumber(expenseForm.amount)) return
    const next = [...expenses, { ...expenseForm, id: `exp_${Date.now()}`, amount: Math.max(0, Number(expenseForm.amount) || 0), description: sanitizeText(expenseForm.description || '', 500), receipt: sanitizeText(expenseForm.receipt || '', 200) }]
    setExpenses(next); saveExpenses(next)
    setExpenseForm({ amount: '', currency: currency || 'USD', category: 'other', date: new Date().toISOString().slice(0, 10), description: '', receipt: '' })
    setShowExpenseForm(false)
  }
  const deleteExpense = (id) => { const next = expenses.filter(e => e.id !== id); setExpenses(next); saveExpenses(next) }

  // Chart data: revenue by method
  const methodTotals = {}
  paidPayments.forEach(p => { const m = p.method || 'cash'; methodTotals[m] = (methodTotals[m] || 0) + Number(p.amount || 0) })
  const methodEntries = Object.entries(methodTotals).sort((a, b) => b[1] - a[1])
  const methodColors = [C.primary, C.success, C.purple, C.warning, C.danger, '#E16F24']

  // Top contacts by revenue
  const contactRevenue = {}
  paidPayments.forEach(p => { if (p.contactName) contactRevenue[p.contactName] = (contactRevenue[p.contactName] || 0) + Number(p.amount || 0) })
  const topContacts = Object.entries(contactRevenue).sort((a, b) => b[1] - a[1]).slice(0, 5)

  // ─── Agency subscription revenue view ──────────────────────────────────
  if (isSuperAdmin) {
    const activeOrgs = orgs.filter(o => o.status === 'active' || !o.status)
    const totalMRR = activeOrgs.reduce((sum, o) => sum + (SUBSCRIPTION_PRICING[o.plan] || 0), 0)
    const planBadge = { free: { color: C.textMuted, bg: C.bg }, starter: { color: C.primary, bg: C.primaryBg }, pro: { color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' }, enterprise: { color: C.success, bg: C.successBg } }
    const statusBadge = { active: { color: '#00ff88', bg: 'rgba(0,255,136,0.1)' }, suspended: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' }, deleted: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)' } }

    return (
      <div style={{ direction: dir }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0, fontFamily: 'DM Sans,Inter,sans-serif' }}>{isRTL ? 'المالية' : 'Finance'}</h1>
            <p style={{ fontSize: 12, color: C.primary, fontWeight: 600, margin: '4px 0 0' }}>{isRTL ? 'إيرادات الاشتراكات — عرض الوكالة' : 'Subscription Revenue — Agency View'}</p>
          </div>
          <button type="button" onClick={() => {
            const rows = ['Organization,Plan,Monthly Fee,Status']
            orgs.forEach(o => rows.push(`"${o.name}",${o.plan || 'free'},$${SUBSCRIPTION_PRICING[o.plan] || 0},${o.status || 'active'}`))
            rows.push(`\nTotal MRR,,$${totalMRR},`)
            const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'velo-subscription-revenue.csv'; a.click()
          }} style={makeBtn('secondary', { gap: 6 })}>{Icons.download(14)} {isRTL ? 'تصدير CSV' : 'Export CSV'}</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.textMuted, fontSize: 14 }}>{isRTL ? 'جاري التحميل...' : 'Loading...'}</div>
        ) : (
          <>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
              {[
                { label: isRTL ? 'الإيرادات الشهرية' : 'Total MRR', value: `$${totalMRR.toLocaleString()}`, color: C.success, bg: C.successBg },
                { label: isRTL ? 'الإيرادات السنوية' : 'Annual Revenue', value: `$${(totalMRR * 12).toLocaleString()}`, color: C.primary, bg: C.primaryBg },
                { label: isRTL ? 'اشتراكات نشطة' : 'Active Subscriptions', value: activeOrgs.length, color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
                { label: isRTL ? 'متوسط الإيراد' : 'Avg Revenue / Org', value: activeOrgs.length ? `$${Math.round(totalMRR / activeOrgs.length)}` : '$0', color: C.warning, bg: C.warningBg },
              ].map((s, i) => (
                <div key={i} style={{ ...card, padding: 18, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: s.color, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Subscriptions table */}
            <div style={{ ...card, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead><tr style={{ background: '#0C0E1A', borderBottom: `1px solid ${C.border}` }}>
                  {[isRTL ? 'المؤسسة' : 'Organization', isRTL ? 'الخطة' : 'Plan', isRTL ? 'الرسوم الشهرية' : 'Monthly Fee', isRTL ? 'الحالة' : 'Status'].map((h, i) => (
                    <th key={i} style={thStyle(isRTL)}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {orgs.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: C.textMuted }}>{isRTL ? 'لا توجد مؤسسات' : 'No organizations yet'}</td></tr>
                  ) : orgs.map(org => {
                    const fee = SUBSCRIPTION_PRICING[org.plan] || 0
                    const pb = planBadge[org.plan] || planBadge.free
                    const sb = statusBadge[org.status] || statusBadge.active
                    return (
                      <tr key={org.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: pb.bg, color: pb.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{(org.name || '?')[0].toUpperCase()}</div>
                            <div>
                              <div style={{ fontWeight: 600, color: C.text }}>{org.name}</div>
                              <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'capitalize' }}>{org.industry || 'general'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, color: pb.color, background: pb.bg, textTransform: 'capitalize' }}>{org.plan || 'free'}</span>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: fee > 0 ? C.success : C.textMuted }}>{fee > 0 ? `$${fee}/mo` : isRTL ? 'مجاني' : 'Free'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, color: sb.color, background: sb.bg, textTransform: 'capitalize' }}>{org.status || 'active'}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {orgs.length > 0 && (
                  <tfoot>
                    <tr style={{ background: '#0C0E1A', borderTop: `2px solid ${C.border}` }}>
                      <td colSpan={2} style={{ padding: '12px 16px', fontWeight: 700, color: C.text, fontSize: 13 }}>{isRTL ? 'إجمالي الإيرادات الشهرية' : 'Total Monthly Revenue'}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: C.success, fontSize: 16 }}>${totalMRR.toLocaleString()}/mo</td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: C.textSec, fontSize: 12 }}>{activeOrgs.length} {isRTL ? 'نشط' : 'active'} / {orgs.length} {isRTL ? 'إجمالي' : 'total'}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>
    )
  }

  // ─── Regular org finance view (normal user or impersonating) ──────────

  const tabs = [
    { id: 'overview', label: isRTL ? 'نظرة عامة' : 'Overview' },
    { id: 'income', label: isRTL ? 'الدخل' : 'Income' },
    { id: 'pending', label: isRTL ? 'المعلق' : 'Pending' },
    { id: 'expenses', label: isRTL ? 'المصروفات' : 'Expenses' },
  ]

  return (
    <div style={{ direction: dir }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0, fontFamily: 'DM Sans,Inter,sans-serif' }}>{isRTL ? 'المالية' : 'Finance'}</h1>
        </div>
        <button type="button" onClick={() => {
          const rows = ['Contact,Amount,Currency,Method,Status,Date,Description']
          allPayments.forEach(p => rows.push(`"${p.contactName}",${p.amount},${p.currency || 'USD'},${p.method},${p._resolved},${p.paymentDate || p.createdAt || ''},${p.description || ''}`))
          const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'velo-finance-report.csv'; a.click()
        }} style={makeBtn('secondary', { gap: 6 })}>{Icons.download(14)} {isRTL ? 'تصدير CSV' : 'Export CSV'}</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: `2px solid ${C.border}` }}>
        {tabs.map(tb => (
          <button type="button" key={tb.id} onClick={() => setTab(tb.id)} style={{ padding: '8px 20px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: tab === tb.id ? 700 : 500, color: tab === tb.id ? C.primary : C.textSec, borderBottom: tab === tb.id ? `2px solid ${C.primary}` : '2px solid transparent', marginBottom: -2, fontFamily: 'inherit', transition: 'all 150ms ease' }}>{tb.label}</button>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: C.textMuted, fontSize: 14 }}>
          {isRTL ? 'جاري تحميل البيانات المالية...' : 'Loading financial data...'}
        </div>
      )}

      {!loading && (
        <>
          {/* Summary cards grouped by currency */}
          {currencies.map(cur => {
            const totals = totalsByCurrency[cur]
            const netBalance = totals.paid - (cur === (currency || 'USD') ? totalExpenses : 0)
            return (
              <div key={cur} style={{ marginBottom: 20 }}>
                {currencies.length > 1 && (
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.textSec, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: cur === 'IQD' ? C.warning : C.primary, display: 'inline-block' }} />
                    {cur}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 4 }}>
                  {[
                    { label: isRTL ? 'إجمالي المدفوع' : 'Total Paid', value: totals.paid, color: C.success, bg: C.successBg },
                    { label: isRTL ? 'معلق' : 'Total Pending', value: totals.pending, color: C.warning, bg: C.warningBg },
                    { label: isRTL ? 'متأخر' : 'Overdue', value: totals.overdue, color: C.danger, bg: C.dangerBg },
                    { label: isRTL ? 'صافي الرصيد' : 'Net Balance', value: netBalance, color: C.primary, bg: C.primaryBg },
                  ].map((s, i) => (
                    <div key={i} style={{ ...card, padding: 16, textAlign: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: s.color, marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{fmtMoney(s.value, cur)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Super Admin: Organization Breakdown */}
          {isSuperAdmin && orgBreakdown.length > 0 && tab === 'overview' && (
            <div style={{ ...card, padding: 20, marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 16px', fontFamily: 'DM Sans,Inter,sans-serif' }}>{isRTL ? 'إيرادات حسب المؤسسة' : 'Revenue by Organization'}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {orgBreakdown.map(([orgName, data]) => {
                  const maxVal = orgBreakdown[0]?.[1]?.total || 1
                  return (
                    <div key={orgName}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 6, background: C.primaryBg, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{orgName.charAt(0)}</div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{orgName}</div>
                            <div style={{ fontSize: 11, color: C.textMuted }}>{data.count} {isRTL ? 'عملية' : 'payments'}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.success }}>{fmtMoney(data.paid, currency || 'USD')}</div>
                          {data.pending > 0 && <div style={{ fontSize: 11, color: C.warning }}>{fmtMoney(data.pending, currency || 'USD')} {isRTL ? 'معلق' : 'pending'}</div>}
                        </div>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: C.bg }}>
                        <div style={{ height: '100%', borderRadius: 2, background: C.primary, width: `${(data.total / maxVal) * 100}%`, transition: 'width 300ms ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="fade-in" key={tab}>
            {/* OVERVIEW */}
            {tab === 'overview' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* Revenue by method */}
                <div style={{ ...card, padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 16px', fontFamily: 'DM Sans,Inter,sans-serif' }}>{isRTL ? 'الإيرادات حسب طريقة الدفع' : 'Revenue by Payment Method'}</h3>
                  {methodEntries.length === 0 ? <p style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', padding: 16 }}>{isRTL ? 'لا توجد بيانات' : 'No data'}</p> : (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                      <svg width="140" height="140" viewBox="0 0 140 140">
                        {(() => { let off = 0; const total = methodEntries.reduce((s, e) => s + e[1], 0) || 1; return methodEntries.map(([m, v], i) => { const pct = v / total; const dash = pct * 377; const el = <circle key={m} cx="70" cy="70" r="60" fill="none" stroke={methodColors[i % methodColors.length]} strokeWidth="18" strokeDasharray={`${dash} ${377 - dash}`} strokeDashoffset={-off} transform="rotate(-90 70 70)" />; off += dash; return el }) })()}
                        <text x="70" y="66" textAnchor="middle" fontSize="14" fontWeight="700" fill={C.text}>{allPayments.filter(p => p._resolved === 'paid').length}</text>
                        <text x="70" y="82" textAnchor="middle" fontSize="9" fill={C.textMuted}>{isRTL ? 'مدفوعات' : 'payments'}</text>
                      </svg>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {methodEntries.map(([m, v], i) => (
                      <div key={m} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: methodColors[i % methodColors.length] }} /><span style={{ color: C.textSec }}>{PAYMENT_METHODS_LABELS[m] || m}</span></div>
                        <span style={{ fontWeight: 600, color: C.text }}>{fmtMoney(v, currency || 'USD')}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Top contacts */}
                <div style={{ ...card, padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 16px', fontFamily: 'DM Sans,Inter,sans-serif' }}>{isRTL ? 'أعلى العملاء إيراداً' : 'Top Paying Contacts'}</h3>
                  {topContacts.length === 0 ? <p style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', padding: 16 }}>{isRTL ? 'لا توجد بيانات' : 'No data'}</p> : topContacts.map(([name, val]) => {
                    const maxVal = topContacts[0]?.[1] || 1
                    return (
                      <div key={name} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span style={{ color: C.text, fontWeight: 500 }}>{name}</span><span style={{ fontWeight: 600, color: C.text }}>{fmtMoney(val, currency || 'USD')}</span></div>
                        <div style={{ height: 6, borderRadius: 4, background: C.bg }}><div style={{ height: '100%', borderRadius: 4, background: C.primary, width: `${(val / maxVal) * 100}%`, transition: 'all 150ms ease' }} /></div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* INCOME */}
            {tab === 'income' && (
              <div style={{ ...card, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead><tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                    {[isRTL ? 'جهة الاتصال' : 'Contact', isRTL ? 'المبلغ' : 'Amount', isRTL ? 'العملة' : 'Currency', isRTL ? 'الطريقة' : 'Method', isRTL ? 'التاريخ' : 'Date', isRTL ? 'الوصف' : 'Description', ...(isSuperAdmin ? [isRTL ? 'المؤسسة' : 'Organization'] : [])].map((h, i) => <th key={i} style={thStyle(isRTL)}>{h}</th>)}
                  </tr></thead>
                  <tbody>{paidPayments.length === 0 ? <tr><td colSpan={isSuperAdmin ? 7 : 6} style={{ padding: 32, textAlign: 'center', color: C.textMuted }}>{isRTL ? 'لا يوجد دخل' : 'No income recorded'}</td></tr> : paidPayments.map(p => (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}`, transition: 'all 150ms ease' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 500, color: C.text }}>{p.contactName || '—'}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 700, color: C.success }}>{fmtMoney(p.amount, p.currency || 'USD')}</td>
                      <td style={{ padding: '10px 16px', color: C.textSec, fontSize: 12 }}><span style={{ padding: '2px 8px', borderRadius: 4, background: C.bg, fontWeight: 600 }}>{p.currency || 'USD'}</span></td>
                      <td style={{ padding: '10px 16px', color: C.textSec }}>{PAYMENT_METHODS_LABELS[p.method] || p.method}</td>
                      <td style={{ padding: '10px 16px', color: C.textMuted, fontSize: 13 }}>{p.paymentDate || p.createdAt?.slice(0, 10) || ''}</td>
                      <td style={{ padding: '10px 16px', color: C.textMuted, fontSize: 13 }}>{p.description || '—'}</td>
                      {isSuperAdmin && <td style={{ padding: '10px 16px', color: C.textSec, fontSize: 12 }}><span style={{ padding: '2px 8px', borderRadius: 4, background: C.primaryBg, color: C.primary, fontWeight: 600, fontSize: 11 }}>{p.orgName || '—'}</span></td>}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            {/* PENDING */}
            {tab === 'pending' && (
              <div style={{ ...card, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead><tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                    {[isRTL ? 'جهة الاتصال' : 'Contact', isRTL ? 'المبلغ' : 'Amount', isRTL ? 'العملة' : 'Currency', isRTL ? 'الاستحقاق' : 'Due Date', isRTL ? 'الحالة' : 'Status', isRTL ? 'الوصف' : 'Description', ...(isSuperAdmin ? [isRTL ? 'المؤسسة' : 'Organization'] : [])].map((h, i) => <th key={i} style={thStyle(isRTL)}>{h}</th>)}
                  </tr></thead>
                  <tbody>{pendingPayments.length === 0 ? <tr><td colSpan={isSuperAdmin ? 7 : 6} style={{ padding: 32, textAlign: 'center', color: C.textMuted }}>{isRTL ? 'لا توجد مدفوعات معلقة' : 'No pending payments'}</td></tr> : pendingPayments.map(p => {
                    const isOverdue = p._resolved === 'overdue'
                    return (
                      <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}`, background: isOverdue ? `${C.dangerBg}08` : 'transparent', transition: 'all 150ms ease' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 500, color: C.text }}>{p.contactName || '—'}</td>
                        <td style={{ padding: '10px 16px', fontWeight: 700, color: isOverdue ? C.danger : C.warning }}>{fmtMoney(p.amount, p.currency || 'USD')}</td>
                        <td style={{ padding: '10px 16px', color: C.textSec, fontSize: 12 }}><span style={{ padding: '2px 8px', borderRadius: 4, background: C.bg, fontWeight: 600 }}>{p.currency || 'USD'}</span></td>
                        <td style={{ padding: '10px 16px', color: isOverdue ? C.danger : C.textMuted, fontSize: 13, fontWeight: isOverdue ? 600 : 400 }}>{p.dueDate || '—'}</td>
                        <td style={{ padding: '10px 16px' }}><span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: isOverdue ? C.dangerBg : C.warningBg, color: isOverdue ? C.danger : C.warning }}>{isOverdue ? (isRTL ? 'متأخر' : 'Overdue') : (isRTL ? 'معلق' : 'Pending')}</span></td>
                        <td style={{ padding: '10px 16px', color: C.textMuted, fontSize: 13 }}>{p.description || '—'}</td>
                        {isSuperAdmin && <td style={{ padding: '10px 16px', color: C.textSec, fontSize: 12 }}><span style={{ padding: '2px 8px', borderRadius: 4, background: C.primaryBg, color: C.primary, fontWeight: 600, fontSize: 11 }}>{p.orgName || '—'}</span></td>}
                      </tr>
                    )
                  })}</tbody>
                </table>
              </div>
            )}

            {/* EXPENSES */}
            {tab === 'expenses' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                  <button type="button" onClick={() => setShowExpenseForm(true)} className="velo-btn-primary" style={makeBtn('primary', { gap: 6 })}>{Icons.plus(14)} {isRTL ? 'إضافة مصروف' : 'Add Expense'}</button>
                </div>
                <div style={{ ...card, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead><tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                      {[isRTL ? 'الفئة' : 'Category', isRTL ? 'المبلغ' : 'Amount', isRTL ? 'التاريخ' : 'Date', isRTL ? 'الوصف' : 'Description', ''].map((h, i) => <th key={i} style={thStyle(isRTL)}>{h}</th>)}
                    </tr></thead>
                    <tbody>{expenses.length === 0 ? <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: C.textMuted }}>{isRTL ? 'لا توجد مصروفات' : 'No expenses recorded'}</td></tr> : expenses.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(e => {
                      const cat = EXPENSE_CATEGORIES.find(c => c.id === e.category) || EXPENSE_CATEGORIES[5]
                      return (
                        <tr key={e.id} style={{ borderBottom: `1px solid ${C.border}`, transition: 'all 150ms ease' }}>
                          <td style={{ padding: '10px 16px' }}><span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: cat.bg, color: cat.color }}>{isRTL ? cat.ar : cat.en}</span></td>
                          <td style={{ padding: '10px 16px', fontWeight: 700, color: C.danger }}>{fmtMoney(e.amount, e.currency || currency || 'USD')}</td>
                          <td style={{ padding: '10px 16px', color: C.textMuted, fontSize: 13 }}>{e.date}</td>
                          <td style={{ padding: '10px 16px', color: C.textSec, fontSize: 13 }}>{e.description || '—'}</td>
                          <td style={{ padding: '10px 16px' }}><button type="button" onClick={() => deleteExpense(e.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.textMuted, transition: 'all 150ms ease' }}>{Icons.trash(14)}</button></td>
                        </tr>
                      )
                    })}</tbody>
                  </table>
                </div>

                {showExpenseForm && (
                  <Modal onClose={() => setShowExpenseForm(false)} dir={dir} width={460}>
                    <form onSubmit={ev => { ev.preventDefault(); addExpense() }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 16px', fontFamily: 'DM Sans,Inter,sans-serif' }}>{isRTL ? 'إضافة مصروف' : 'Add Expense'}</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                        <FormField label={isRTL ? 'المبلغ' : 'Amount'} dir={dir}><input value={expenseForm.amount} onChange={e => setExpenseForm(p => ({ ...p, amount: e.target.value }))} type="number" step="0.01" style={inputStyle(dir)} /></FormField>
                        <FormField label={isRTL ? 'العملة' : 'Currency'} dir={dir}>
                          <select value={expenseForm.currency} onChange={e => setExpenseForm(p => ({ ...p, currency: e.target.value }))} style={selectStyle(dir)}>
                            {Object.entries(CURRENCY_SYMBOLS).map(([k, v]) => <option key={k} value={k}>{k} ({v.trim()})</option>)}
                          </select>
                        </FormField>
                        <FormField label={isRTL ? 'الفئة' : 'Category'} dir={dir}>
                          <select value={expenseForm.category} onChange={e => setExpenseForm(p => ({ ...p, category: e.target.value }))} style={selectStyle(dir)}>
                            {EXPENSE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{isRTL ? c.ar : c.en}</option>)}
                          </select>
                        </FormField>
                        <FormField label={isRTL ? 'التاريخ' : 'Date'} dir={dir}><input value={expenseForm.date} onChange={e => setExpenseForm(p => ({ ...p, date: e.target.value }))} type="date" style={inputStyle(dir)} /></FormField>
                      </div>
                      <FormField label={isRTL ? 'الوصف' : 'Description'} dir={dir}><input value={expenseForm.description} onChange={e => setExpenseForm(p => ({ ...p, description: e.target.value }))} style={inputStyle(dir)} /></FormField>
                      <FormField label={isRTL ? 'اسم الإيصال' : 'Receipt filename'} dir={dir}><input value={expenseForm.receipt} onChange={e => setExpenseForm(p => ({ ...p, receipt: e.target.value }))} placeholder="receipt.pdf" style={inputStyle(dir)} /></FormField>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                        <button type="button" onClick={() => setShowExpenseForm(false)} style={makeBtn('secondary')}>{isRTL ? 'إلغاء' : 'Cancel'}</button>
                        <button type="submit" className="velo-btn-primary" style={makeBtn('primary')}>{isRTL ? 'إضافة' : 'Add'}</button>
                      </div>
                    </form>
                  </Modal>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
