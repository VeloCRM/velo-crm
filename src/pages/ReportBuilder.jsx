import { useState } from 'react'
import { C, makeBtn, card, STAGE_COLORS } from '../design'
import { Icons, Modal, FormField, inputStyle, selectStyle } from '../components/shared'

const METRICS = [
  { id: 'total_contacts', label: 'Total Contacts', icon: '👥', category: 'contacts' },
  { id: 'new_contacts', label: 'New Contacts', icon: '➕', category: 'contacts' },
  { id: 'contacts_by_status', label: 'Contacts by Status', icon: '📊', category: 'contacts' },
  { id: 'total_deals', label: 'Total Deals', icon: '💼', category: 'deals' },
  { id: 'deals_by_stage', label: 'Deals by Stage', icon: '📈', category: 'deals' },
  { id: 'deal_value', label: 'Total Deal Value', icon: '💰', category: 'deals' },
  { id: 'win_rate', label: 'Win Rate', icon: '🏆', category: 'deals' },
  { id: 'revenue', label: 'Revenue', icon: '💵', category: 'revenue' },
  { id: 'revenue_trend', label: 'Revenue Trend', icon: '📈', category: 'revenue' },
  { id: 'open_tickets', label: 'Open Tickets', icon: '🎫', category: 'tickets' },
  { id: 'tickets_by_priority', label: 'Tickets by Priority', icon: '🔴', category: 'tickets' },
  { id: 'avg_response_time', label: 'Avg Response Time', icon: '⏱️', category: 'tickets' },
  { id: 'resolution_rate', label: 'Resolution Rate', icon: '✅', category: 'tickets' },
]

const VIZ_TYPES = [
  { id: 'number', label: 'Number', icon: '#' },
  { id: 'line', label: 'Line Chart', icon: '📈' },
  { id: 'bar', label: 'Bar Chart', icon: '📊' },
  { id: 'pie', label: 'Pie Chart', icon: '🥧' },
  { id: 'table', label: 'Table', icon: '📋' },
]

const CATEGORIES = ['contacts', 'deals', 'revenue', 'tickets']

export default function ReportBuilder({ t, lang, dir, isRTL, contacts, deals, tickets, onBack }) {
  const [reportName, setReportName] = useState('')
  const [widgets, setWidgets] = useState([])
  const [range, setRange] = useState('30')
  const [showMetricPicker, setShowMetricPicker] = useState(false)
  const [filterCat, setFilterCat] = useState('all')
  const [saved, setSaved] = useState(false)

  const addWidget = (metric) => {
    setWidgets(prev => [...prev, { id: `w${Date.now()}`, metric, viz: 'number' }])
    setShowMetricPicker(false)
  }

  const removeWidget = (id) => setWidgets(prev => prev.filter(w => w.id !== id))
  const setViz = (id, viz) => setWidgets(prev => prev.map(w => w.id === id ? { ...w, viz } : w))

  const computeValue = (metricId) => {
    const fmt$ = n => '$' + n.toLocaleString()
    switch (metricId) {
      case 'total_contacts': return contacts.length
      case 'new_contacts': return contacts.filter(c => { const d = new Date(c.createdAt); return d > new Date(Date.now() - Number(range) * 86400000) }).length
      case 'total_deals': return deals.length
      case 'deal_value': return fmt$(deals.reduce((s, d) => s + (d.value || 0), 0))
      case 'revenue': return fmt$(deals.filter(d => d.stage === 'won').reduce((s, d) => s + (d.value || 0), 0))
      case 'win_rate': return deals.length ? Math.round((deals.filter(d => d.stage === 'won').length / deals.length) * 100) + '%' : '0%'
      case 'open_tickets': return tickets.filter(tk => ['open', 'in_progress'].includes(tk.status)).length
      case 'resolution_rate': return tickets.length ? Math.round((tickets.filter(tk => ['resolved', 'closed'].includes(tk.status)).length / tickets.length) * 100) + '%' : '0%'
      case 'avg_response_time': return '2.4h'
      default: return '—'
    }
  }

  const handleSave = () => {
    const report = { id: reportName.replace(/\s+/g,'_').toLowerCase() || `report_${Date.now()}`, name: reportName || 'Untitled Report', widgets, range, createdAt: new Date().toISOString().slice(0,10) }
    try { const existing = JSON.parse(localStorage.getItem('velo_saved_reports')||'[]'); const updated = existing.filter(r=>r.id!==report.id); updated.push(report); localStorage.setItem('velo_saved_reports', JSON.stringify(updated)) } catch {}
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ direction: dir }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.textSec, display: 'flex' }}>
            {isRTL ? Icons.arrowRight(20) : Icons.arrowLeft(20)}
          </button>
          <div>
            <input value={reportName} onChange={e => setReportName(e.target.value)}
              placeholder={isRTL ? 'اسم التقرير...' : 'Report name...'}
              style={{ border: 'none', outline: 'none', fontSize: 22, fontWeight: 700, color: C.text, fontFamily: 'inherit', background: 'transparent', direction: dir, width: 300 }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', borderRadius: 8, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            {[{ id: '7', l: '7D' }, { id: '30', l: '30D' }, { id: '90', l: '90D' }].map(r => (
              <button key={r.id} onClick={() => setRange(r.id)} style={{ padding: '6px 12px', border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: range === r.id ? C.primary : C.white, color: range === r.id ? '#fff' : C.textSec }}>{r.l}</button>
            ))}
          </div>
          <button onClick={() => setShowMetricPicker(true)} style={makeBtn('primary', { gap: 6 })}>{Icons.plus(14)} {isRTL ? 'إضافة مقياس' : 'Add Metric'}</button>
          <button onClick={handleSave} style={makeBtn(saved ? 'success' : 'secondary', { gap: 6 })}>
            {saved ? Icons.check(14) : Icons.download(14)} {saved ? (isRTL ? 'تم الحفظ' : 'Saved!') : (isRTL ? 'حفظ التقرير' : 'Save Report')}
          </button>
        </div>
      </div>

      {/* Canvas */}
      {widgets.length === 0 ? (
        <div style={{ ...card, padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>
            {isRTL ? 'ابدأ بإضافة مقاييس' : 'Start by adding metrics'}
          </h3>
          <p style={{ fontSize: 13, color: C.textMuted, margin: '0 0 20px' }}>
            {isRTL ? 'اختر مقاييس من المكتبة لبناء تقريرك المخصص' : 'Choose metrics from the library to build your custom report'}
          </p>
          <button onClick={() => setShowMetricPicker(true)} style={makeBtn('primary', { gap: 6 })}>{Icons.plus(14)} {isRTL ? 'إضافة مقياس' : 'Add Metric'}</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {widgets.map(w => {
            const metric = METRICS.find(m => m.id === w.metric)
            if (!metric) return null
            return (
              <div key={w.id} style={{ ...card, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{metric.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{metric.label}</span>
                  </div>
                  <button onClick={() => removeWidget(w.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.textMuted }}>{Icons.x(14)}</button>
                </div>

                {/* Viz selector */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
                  {VIZ_TYPES.map(v => (
                    <button key={v.id} onClick={() => setViz(w.id, v.id)}
                      style={{ padding: '3px 8px', borderRadius: 4, border: 'none', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', background: w.viz === v.id ? C.primary : C.bg, color: w.viz === v.id ? '#fff' : C.textSec }}>
                      {v.icon} {v.label}
                    </button>
                  ))}
                </div>

                {/* Rendered value */}
                {w.viz === 'number' && (
                  <div style={{ fontSize: 36, fontWeight: 800, color: C.text, textAlign: 'center', padding: 16 }}>
                    {computeValue(w.metric)}
                  </div>
                )}
                {w.viz === 'bar' && (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100, padding: '0 8px' }}>
                    {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
                      <div key={i} style={{ flex: 1, height: `${h}%`, background: `${C.primary}${i === 5 ? '' : '80'}`, borderRadius: '4px 4px 0 0', transition: 'height .3s' }} />
                    ))}
                  </div>
                )}
                {w.viz === 'line' && (
                  <svg viewBox="0 0 200 80" style={{ width: '100%', height: 80 }}>
                    <path d="M0,60 L30,45 L60,55 L90,30 L120,40 L150,20 L180,25 L200,10" fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round" />
                    <path d="M0,60 L30,45 L60,55 L90,30 L120,40 L150,20 L180,25 L200,10 L200,80 L0,80 Z" fill={`${C.primary}15`} />
                  </svg>
                )}
                {w.viz === 'pie' && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 8 }}>
                    <svg width="80" height="80" viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="30" fill="none" stroke={C.primary} strokeWidth="12" strokeDasharray="75 113" transform="rotate(-90 40 40)" />
                      <circle cx="40" cy="40" r="30" fill="none" stroke="#8250DF" strokeWidth="12" strokeDasharray="45 143" strokeDashoffset="-75" transform="rotate(-90 40 40)" />
                      <circle cx="40" cy="40" r="30" fill="none" stroke="#D29922" strokeWidth="12" strokeDasharray="30 158" strokeDashoffset="-120" transform="rotate(-90 40 40)" />
                      <circle cx="40" cy="40" r="30" fill="none" stroke={C.border} strokeWidth="12" strokeDasharray="38 150" strokeDashoffset="-150" transform="rotate(-90 40 40)" />
                    </svg>
                  </div>
                )}
                {w.viz === 'table' && (
                  <div style={{ fontSize: 12 }}>
                    {[['Item', 'Value'], ['Q1', '$12,400'], ['Q2', '$18,600'], ['Q3', '$24,200']].map((row, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i === 0 ? `1px solid ${C.border}` : 'none', fontWeight: i === 0 ? 600 : 400, color: i === 0 ? C.textSec : C.text }}>
                        <span>{row[0]}</span><span>{row[1]}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Metric picker modal */}
      {showMetricPicker && (
        <Modal onClose={() => setShowMetricPicker(false)} dir={dir} width={500}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>{isRTL ? 'مكتبة المقاييس' : 'Metrics Library'}</h2>
            <button onClick={() => setShowMetricPicker(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.textMuted }}>{Icons.x(20)}</button>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {['all', ...CATEGORIES].map(cat => (
              <button key={cat} onClick={() => setFilterCat(cat)}
                style={{ padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: filterCat === cat ? C.primary : C.bg, color: filterCat === cat ? '#fff' : C.textSec, textTransform: 'capitalize' }}>
                {cat === 'all' ? (isRTL ? 'الكل' : 'All') : cat}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {METRICS.filter(m => filterCat === 'all' || m.category === filterCat).map(m => (
              <button key={m.id} onClick={() => addWidget(m.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontFamily: 'inherit', textAlign: isRTL ? 'right' : 'left', transition: 'background .1s' }}
                onMouseEnter={e => e.currentTarget.style.background = C.bg}
                onMouseLeave={e => e.currentTarget.style.background = C.white}>
                <span style={{ fontSize: 20 }}>{m.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: C.text, flex: 1 }}>{m.label}</span>
                <span style={{ fontSize: 10, color: C.textMuted, background: C.bg, padding: '2px 6px', borderRadius: 4, textTransform: 'capitalize' }}>{m.category}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
