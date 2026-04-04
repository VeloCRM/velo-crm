import { useState } from 'react'
import { C, makeBtn, card, STAGE_COLORS } from '../design'
import { Icons } from '../components/shared'

const RANGES = [
  { id: '7', label: '7 Days' },
  { id: '30', label: '30 Days' },
  { id: '90', label: '90 Days' },
]

export default function ReportsPage({ t, lang, dir, isRTL, contacts, deals, tickets, onOpenBuilder }) {
  const [range, setRange] = useState('30')
  const fmt$ = (n) => '$' + n.toLocaleString()

  const totalContacts = contacts.length
  const newContacts = contacts.filter(c => { const d = new Date(c.createdAt); return d > new Date(Date.now() - Number(range) * 86400000) }).length
  const dealsWon = deals.filter(d => d.stage === 'won')
  const revenue = dealsWon.reduce((s, d) => s + d.value, 0)
  const resolvedTickets = tickets.filter(tk => ['resolved', 'closed'].includes(tk.status)).length
  const openDeals = deals.filter(d => !['won', 'lost'].includes(d.stage))

  // Chart data
  const stages = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost']
  const stageData = stages.map(s => ({ stage: s, count: deals.filter(d => d.stage === s).length, label: t[`stage${s.charAt(0).toUpperCase() + s.slice(1)}`] || s }))
  const maxStageCount = Math.max(...stageData.map(s => s.count), 1)

  // Revenue trend (mock)
  const revTrend = [3200, 4100, 3800, 5200, 4700, 6100, 5800, 7200, 6500, 8100, 7600, 9600]
  const revMax = Math.max(...revTrend)

  // Ticket priority breakdown
  const priorities = ['low', 'medium', 'high', 'urgent']
  const priorityColors = { low: C.success, medium: C.warning, high: '#E16F24', urgent: C.danger }
  const priorityData = priorities.map(p => ({ p, count: tickets.filter(tk => tk.priority === p).length }))
  const totalTickets = tickets.length || 1

  // Top contacts
  const topContacts = contacts.slice(0, 5).map(c => {
    const contactDeals = deals.filter(d => d.contactId === c.id)
    const totalValue = contactDeals.reduce((s, d) => s + d.value, 0)
    return { ...c, totalValue, dealCount: contactDeals.length }
  }).sort((a, b) => b.totalValue - a.totalValue)

  const metrics = [
    { label: t.totalContacts, value: totalContacts, icon: Icons.users, color: C.primary, bg: C.primaryBg },
    { label: t.contactsAdded || 'New Contacts', value: newContacts, icon: Icons.plus, color: C.success, bg: C.successBg },
    { label: t.dealsWon || 'Deals Won', value: dealsWon.length, icon: Icons.check, color: C.purple, bg: C.purpleBg },
    { label: t.revenue || 'Revenue', value: fmt$(revenue), icon: Icons.dollar, color: C.warning, bg: C.warningBg },
    { label: lang === 'ar' ? 'تذاكر محلولة' : 'Tickets Resolved', value: resolvedTickets, icon: Icons.check, color: C.success, bg: C.successBg },
    { label: lang === 'ar' ? 'متوسط وقت الرد' : 'Avg Response', value: '2.4h', icon: Icons.clock, color: C.primary, bg: C.primaryBg },
  ]

  return (
    <div style={{ direction: dir }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0, fontFamily: 'DM Sans,Inter,sans-serif' }}>{t.reports}</h1>
          <p style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>{lang === 'ar' ? 'نظرة عامة على الأداء' : 'Performance overview'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', borderRadius: 8, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            {RANGES.map(r => (
              <button key={r.id} onClick={() => setRange(r.id)} style={{ padding: '6px 16px', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: range === r.id ? C.primary : C.white, color: range === r.id ? '#fff' : C.textSec, transition: 'all 150ms ease' }}>{r.label}</button>
            ))}
          </div>
          <button style={makeBtn('secondary', { gap: 6 })}>{Icons.download(14)} {lang === 'ar' ? 'تصدير PDF' : 'Export PDF'}</button>
          {onOpenBuilder && <button onClick={onOpenBuilder} style={makeBtn('primary', { gap: 6 })}>{Icons.plus(14)} {lang === 'ar' ? 'تقرير مخصص' : 'Custom Report'}</button>}
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 16, marginBottom: 24 }}>
        {metrics.map((m, i) => (
          <div key={i} style={{ ...card, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 500 }}>{m.label}</span>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: m.bg, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{m.icon(14)}</div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Revenue trend */}
        <div style={{ ...card, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 16px', fontFamily: 'DM Sans,Inter,sans-serif' }}>{t.monthlyRevenue || 'Revenue Trend'}</h3>
          <svg width="100%" viewBox="0 0 500 160" style={{ display: 'block' }}>
            <defs><linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.primary} stopOpacity=".15" /><stop offset="100%" stopColor={C.primary} stopOpacity=".01" /></linearGradient></defs>
            {[0, .25, .5, .75, 1].map((p, i) => <line key={i} x1="30" y1={10 + 130 * (1 - p)} x2="490" y2={10 + 130 * (1 - p)} stroke={C.border} strokeDasharray="4 4" />)}
            {(() => {
              const pts = revTrend.map((v, i) => ({ x: 30 + (i / (revTrend.length - 1)) * 460, y: 10 + 130 - (v / revMax) * 130 }))
              const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
              const area = `${line} L${pts[pts.length - 1].x},140 L${pts[0].x},140 Z`
              return <><path d={area} fill="url(#revGrad)" /><path d={line} fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round" />{pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill={C.primary} stroke="#fff" strokeWidth="2" />)}</>
            })()}
          </svg>
        </div>

        {/* Deals by stage */}
        <div style={{ ...card, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 16px', fontFamily: 'DM Sans,Inter,sans-serif' }}>{t.dealsByStage || 'Deals by Stage'}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {stageData.map(s => {
              const sc = STAGE_COLORS[s.stage]
              return (
                <div key={s.stage} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.textSec, width: 80, textAlign: isRTL ? 'right' : 'left' }}>{s.label}</span>
                  <div style={{ flex: 1, height: 24, background: C.bg, borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 6, background: sc.accent, width: `${(s.count / maxStageCount) * 100}%`, transition: 'all 150ms ease', display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
                      {s.count > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{s.count}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
        {/* Tickets by priority */}
        <div style={{ ...card, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 16px', fontFamily: 'DM Sans,Inter,sans-serif' }}>{lang === 'ar' ? 'التذاكر حسب الأولوية' : 'Tickets by Priority'}</h3>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <svg width="140" height="140" viewBox="0 0 140 140">
              {(() => {
                let offset = 0
                return priorityData.map(({ p, count }) => {
                  const pct = count / totalTickets
                  const dash = pct * 377
                  const gap = 377 - dash
                  const el = <circle key={p} cx="70" cy="70" r="60" fill="none" stroke={priorityColors[p]} strokeWidth="18" strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" />
                  offset += dash
                  return el
                })
              })()}
              <text x="70" y="66" textAnchor="middle" fontSize="22" fontWeight="700" fill={C.text}>{tickets.length}</text>
              <text x="70" y="82" textAnchor="middle" fontSize="10" fill={C.textMuted}>{lang === 'ar' ? 'تذكرة' : 'tickets'}</text>
            </svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {priorityData.map(({ p, count }) => (
              <div key={p} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: priorityColors[p] }} />
                  <span style={{ color: C.textSec, textTransform: 'capitalize' }}>{t[`priority${p.charAt(0).toUpperCase() + p.slice(1)}`] || p}</span>
                </div>
                <span style={{ fontWeight: 600, color: C.text }}>{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top contacts */}
        <div style={{ ...card, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 16px', fontFamily: 'DM Sans,Inter,sans-serif' }}>{t.topContacts || 'Top Contacts by Value'}</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {[t.name, t.company, lang === 'ar' ? 'الصفقات' : 'Deals', t.value].map((h, i) => (
                  <th key={i} style={{ padding: '8px 12px', textAlign: isRTL ? 'right' : 'left', fontWeight: 500, color: '#374151', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topContacts.map(c => (
                <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}`, transition: 'all 150ms ease' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: C.text }}>{c.name}</td>
                  <td style={{ padding: '10px 12px', color: C.textSec }}>{c.company}</td>
                  <td style={{ padding: '10px 12px', color: C.textSec }}>{c.dealCount}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: C.text }}>{fmt$(c.totalValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
