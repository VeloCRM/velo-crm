import { useState } from 'react'
import { C, makeBtn, card } from '../design'
import { Icons, Modal, FormField, inputStyle, selectStyle } from '../components/shared'

const CURRENCY_SYMBOLS = { USD:'$', EUR:'€', GBP:'£', IQD:'IQD ', AED:'AED ', SAR:'SAR ' }
const fmtMoney = (n, c) => (CURRENCY_SYMBOLS[c] || '$') + Number(n||0).toLocaleString()

const EXPENSE_CATEGORIES = [
  { id:'rent', en:'Rent', ar:'إيجار', color:'#0969DA', bg:'#DDF4FF' },
  { id:'salaries', en:'Salaries', ar:'رواتب', color:'#8250DF', bg:'#FBEFFF' },
  { id:'marketing', en:'Marketing', ar:'تسويق', color:'#E16F24', bg:'#FFF1E5' },
  { id:'software', en:'Software', ar:'برمجيات', color:'#0D9488', bg:'#D5F5F0' },
  { id:'equipment', en:'Equipment', ar:'معدات', color:'#D29922', bg:'#FFF8C5' },
  { id:'other', en:'Other', ar:'أخرى', color:'#8C959F', bg:'#F6F8FA' },
]

const PAYMENT_METHODS_LABELS = { cash:'Cash', bank_transfer:'Bank Transfer', card:'Card', zaincash:'ZainCash', fib:'FIB', asia_hawala:'Asia Hawala' }

function loadExpenses() { try { return JSON.parse(localStorage.getItem('velo_expenses')||'[]') } catch { return [] } }
function saveExpenses(e) { localStorage.setItem('velo_expenses', JSON.stringify(e)) }

function getAllPayments(contacts) {
  const all = []
  for (const c of contacts) {
    try {
      const s = localStorage.getItem(`velo_payments_${c.id}`)
      if (s) { const payments = JSON.parse(s); payments.forEach(p => all.push({ ...p, contactName: c.name, contactId: c.id })) }
    } catch {}
  }
  return all
}

function resolveStatus(p) {
  if (p.status === 'cancelled' || p.status === 'paid') return p.status
  if (p.status === 'pending' && p.dueDate && new Date(p.dueDate) < new Date()) return 'overdue'
  return p.status
}

export default function FinancePage({ t, lang, dir, isRTL, contacts, currency }) {
  const [tab, setTab] = useState('overview')
  const [range, setRange] = useState('month')
  const [expenses, setExpenses] = useState(loadExpenses)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [expenseForm, setExpenseForm] = useState({ amount:'', currency: currency||'USD', category:'other', date:new Date().toISOString().slice(0,10), description:'', receipt:'' })

  const allPayments = getAllPayments(contacts).map(p => ({ ...p, _resolved: resolveStatus(p) }))
  const totalRevenue = allPayments.filter(p=>p._resolved==='paid').reduce((s,p)=>s+Number(p.amount||0),0)
  const totalPending = allPayments.filter(p=>p._resolved==='pending'||p._resolved==='overdue').reduce((s,p)=>s+Number(p.amount||0),0)
  const totalOverdue = allPayments.filter(p=>p._resolved==='overdue').reduce((s,p)=>s+Number(p.amount||0),0)
  const totalExpenses = expenses.reduce((s,e)=>s+Number(e.amount||0),0)
  const netBalance = totalRevenue - totalExpenses

  const paidPayments = allPayments.filter(p=>p._resolved==='paid').sort((a,b)=>(b.paymentDate||b.date||'').localeCompare(a.paymentDate||a.date||''))
  const pendingPayments = allPayments.filter(p=>p._resolved==='pending'||p._resolved==='overdue').sort((a,b)=>(a.dueDate||'9').localeCompare(b.dueDate||'9'))

  const addExpense = () => {
    if (!expenseForm.amount) return
    const next = [...expenses, { ...expenseForm, id:`exp_${Date.now()}`, amount:Number(expenseForm.amount)||0 }]
    setExpenses(next); saveExpenses(next)
    setExpenseForm({ amount:'', currency:currency||'USD', category:'other', date:new Date().toISOString().slice(0,10), description:'', receipt:'' })
    setShowExpenseForm(false)
  }
  const deleteExpense = (id) => { const next = expenses.filter(e=>e.id!==id); setExpenses(next); saveExpenses(next) }

  // Chart data: revenue by method
  const methodTotals = {}
  paidPayments.forEach(p => { const m = p.method||'cash'; methodTotals[m] = (methodTotals[m]||0) + Number(p.amount||0) })
  const methodEntries = Object.entries(methodTotals).sort((a,b)=>b[1]-a[1])
  const methodColors = ['#0969DA','#1A7F37','#8250DF','#D29922','#CF222E','#E16F24']

  // Top contacts by revenue
  const contactRevenue = {}
  paidPayments.forEach(p => { contactRevenue[p.contactName] = (contactRevenue[p.contactName]||0) + Number(p.amount||0) })
  const topContacts = Object.entries(contactRevenue).sort((a,b)=>b[1]-a[1]).slice(0,5)

  const cur = currency || 'USD'

  const tabs = [
    { id:'overview', label:isRTL?'نظرة عامة':'Overview' },
    { id:'income', label:isRTL?'الدخل':'Income' },
    { id:'pending', label:isRTL?'المعلق':'Pending' },
    { id:'expenses', label:isRTL?'المصروفات':'Expenses' },
  ]

  return (
    <div style={{ direction:dir }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <h1 style={{ fontSize:24, fontWeight:700, color:C.text, margin:0 }}>{isRTL?'المالية':'Finance'}</h1>
        <button type="button" onClick={()=>{
          const rows = ['Contact,Amount,Currency,Method,Status,Date,Description']
          allPayments.forEach(p=>rows.push(`"${p.contactName}",${p.amount},${p.currency||cur},${p.method},${p._resolved},${p.date||''},${p.description||''}`))
          const blob = new Blob([rows.join('\n')],{type:'text/csv'})
          const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='velo-finance-report.csv'; a.click()
        }} style={makeBtn('secondary',{gap:6})}>{Icons.download(14)} {isRTL?'تصدير CSV':'Export CSV'}</button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:0, marginBottom:20, borderBottom:`2px solid ${C.border}` }}>
        {tabs.map(tb => (
          <button type="button" key={tb.id} onClick={()=>setTab(tb.id)} style={{ padding:'10px 20px', border:'none', background:'transparent', cursor:'pointer', fontSize:13, fontWeight:tab===tb.id?700:500, color:tab===tb.id?C.primary:C.textSec, borderBottom:tab===tb.id?`2px solid ${C.primary}`:'2px solid transparent', marginBottom:-2, fontFamily:'inherit' }}>{tb.label}</button>
        ))}
      </div>

      {/* Summary cards — always visible */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, marginBottom:24 }}>
        {[
          { label:isRTL?'إجمالي الإيرادات':'Total Revenue', value:totalRevenue, color:'#1A7F37', bg:'#DAFBE1' },
          { label:isRTL?'معلق':'Total Pending', value:totalPending, color:'#D29922', bg:'#FFF8C5' },
          { label:isRTL?'متأخر':'Overdue', value:totalOverdue, color:'#CF222E', bg:'#FFEBE9' },
          { label:isRTL?'صافي الرصيد':'Net Balance', value:netBalance, color:C.primary, bg:C.primaryBg },
        ].map((s,i) => (
          <div key={i} style={{ ...card, padding:16, textAlign:'center' }}>
            <div style={{ fontSize:10, fontWeight:600, color:s.color, marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{fmtMoney(s.value, cur)}</div>
          </div>
        ))}
      </div>

      <div className="fade-in" key={tab}>
        {/* OVERVIEW */}
        {tab === 'overview' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
            {/* Revenue by method */}
            <div style={{ ...card, padding:20 }}>
              <h3 style={{ fontSize:14, fontWeight:600, color:C.text, margin:'0 0 16px' }}>{isRTL?'الإيرادات حسب طريقة الدفع':'Revenue by Payment Method'}</h3>
              {methodEntries.length === 0 ? <p style={{ fontSize:12, color:C.textMuted, textAlign:'center', padding:16 }}>{isRTL?'لا توجد بيانات':'No data'}</p> : (
                <div style={{ display:'flex', justifyContent:'center', marginBottom:16 }}>
                  <svg width="140" height="140" viewBox="0 0 140 140">
                    {(()=>{let off=0;const total=methodEntries.reduce((s,e)=>s+e[1],0)||1;return methodEntries.map(([m,v],i)=>{const pct=v/total;const dash=pct*377;const el=<circle key={m} cx="70" cy="70" r="60" fill="none" stroke={methodColors[i%methodColors.length]} strokeWidth="18" strokeDasharray={`${dash} ${377-dash}`} strokeDashoffset={-off} transform="rotate(-90 70 70)"/>;off+=dash;return el})})()}
                    <text x="70" y="66" textAnchor="middle" fontSize="18" fontWeight="700" fill={C.text}>{fmtMoney(totalRevenue,cur)}</text>
                    <text x="70" y="82" textAnchor="middle" fontSize="9" fill={C.textMuted}>{isRTL?'إجمالي':'Total'}</text>
                  </svg>
                </div>
              )}
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {methodEntries.map(([m,v],i) => (
                  <div key={m} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:12 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}><div style={{ width:10, height:10, borderRadius:3, background:methodColors[i%methodColors.length] }}/><span style={{ color:C.textSec }}>{PAYMENT_METHODS_LABELS[m]||m}</span></div>
                    <span style={{ fontWeight:600, color:C.text }}>{fmtMoney(v,cur)}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Top contacts */}
            <div style={{ ...card, padding:20 }}>
              <h3 style={{ fontSize:14, fontWeight:600, color:C.text, margin:'0 0 16px' }}>{isRTL?'أعلى العملاء إيراداً':'Top Paying Contacts'}</h3>
              {topContacts.length === 0 ? <p style={{ fontSize:12, color:C.textMuted, textAlign:'center', padding:16 }}>{isRTL?'لا توجد بيانات':'No data'}</p> : topContacts.map(([name,val],i) => {
                const maxVal = topContacts[0]?.[1] || 1
                return (
                  <div key={name} style={{ marginBottom:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}><span style={{ color:C.text, fontWeight:500 }}>{name}</span><span style={{ fontWeight:600, color:C.text }}>{fmtMoney(val,cur)}</span></div>
                    <div style={{ height:6, borderRadius:3, background:C.bg }}><div style={{ height:'100%', borderRadius:3, background:C.primary, width:`${(val/maxVal)*100}%` }}/></div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* INCOME */}
        {tab === 'income' && (
          <div style={{ ...card, overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead><tr style={{ background:C.bg, borderBottom:`1px solid ${C.border}` }}>
                {[isRTL?'جهة الاتصال':'Contact', isRTL?'المبلغ':'Amount', isRTL?'الطريقة':'Method', isRTL?'التاريخ':'Date', isRTL?'الوصف':'Description'].map((h,i)=><th key={i} style={{ padding:'10px 14px', textAlign:isRTL?'right':'left', fontWeight:600, color:C.textSec, fontSize:11 }}>{h}</th>)}
              </tr></thead>
              <tbody>{paidPayments.length===0 ? <tr><td colSpan={5} style={{ padding:32, textAlign:'center', color:C.textMuted }}>{isRTL?'لا يوجد دخل':'No income recorded'}</td></tr> : paidPayments.map(p => (
                <tr key={p.id} style={{ borderBottom:`1px solid ${C.border}` }}>
                  <td style={{ padding:'10px 14px', fontWeight:500 }}>{p.contactName}</td>
                  <td style={{ padding:'10px 14px', fontWeight:700, color:'#1A7F37' }}>{fmtMoney(p.amount, p.currency||cur)}</td>
                  <td style={{ padding:'10px 14px', color:C.textSec }}>{PAYMENT_METHODS_LABELS[p.method]||p.method}</td>
                  <td style={{ padding:'10px 14px', color:C.textMuted, fontSize:12 }}>{p.paymentDate||p.date}</td>
                  <td style={{ padding:'10px 14px', color:C.textMuted, fontSize:12 }}>{p.description||'—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* PENDING */}
        {tab === 'pending' && (
          <div style={{ ...card, overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead><tr style={{ background:C.bg, borderBottom:`1px solid ${C.border}` }}>
                {[isRTL?'جهة الاتصال':'Contact', isRTL?'المبلغ':'Amount', isRTL?'الاستحقاق':'Due Date', isRTL?'الحالة':'Status', isRTL?'الوصف':'Description'].map((h,i)=><th key={i} style={{ padding:'10px 14px', textAlign:isRTL?'right':'left', fontWeight:600, color:C.textSec, fontSize:11 }}>{h}</th>)}
              </tr></thead>
              <tbody>{pendingPayments.length===0 ? <tr><td colSpan={5} style={{ padding:32, textAlign:'center', color:C.textMuted }}>{isRTL?'لا توجد مدفوعات معلقة':'No pending payments'}</td></tr> : pendingPayments.map(p => {
                const isOverdue = p._resolved === 'overdue'
                return (
                  <tr key={p.id} style={{ borderBottom:`1px solid ${C.border}`, background: isOverdue?'#FFEBE905':'transparent' }}>
                    <td style={{ padding:'10px 14px', fontWeight:500 }}>{p.contactName}</td>
                    <td style={{ padding:'10px 14px', fontWeight:700, color: isOverdue?'#CF222E':'#D29922' }}>{fmtMoney(p.amount, p.currency||cur)}</td>
                    <td style={{ padding:'10px 14px', color: isOverdue?'#CF222E':C.textMuted, fontSize:12, fontWeight: isOverdue?600:400 }}>{p.dueDate||'—'}</td>
                    <td style={{ padding:'10px 14px' }}><span style={{ fontSize:10, fontWeight:600, padding:'2px 6px', borderRadius:4, background: isOverdue?'#FFEBE9':'#FFF8C5', color: isOverdue?'#CF222E':'#D29922' }}>{isOverdue?(isRTL?'متأخر':'Overdue'):(isRTL?'معلق':'Pending')}</span></td>
                    <td style={{ padding:'10px 14px', color:C.textMuted, fontSize:12 }}>{p.description||'—'}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        )}

        {/* EXPENSES */}
        {tab === 'expenses' && (
          <div>
            <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
              <button type="button" onClick={()=>setShowExpenseForm(true)} style={makeBtn('primary',{gap:6})}>{Icons.plus(14)} {isRTL?'إضافة مصروف':'Add Expense'}</button>
            </div>
            <div style={{ ...card, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead><tr style={{ background:C.bg, borderBottom:`1px solid ${C.border}` }}>
                  {[isRTL?'الفئة':'Category', isRTL?'المبلغ':'Amount', isRTL?'التاريخ':'Date', isRTL?'الوصف':'Description', ''].map((h,i)=><th key={i} style={{ padding:'10px 14px', textAlign:isRTL?'right':'left', fontWeight:600, color:C.textSec, fontSize:11 }}>{h}</th>)}
                </tr></thead>
                <tbody>{expenses.length===0 ? <tr><td colSpan={5} style={{ padding:32, textAlign:'center', color:C.textMuted }}>{isRTL?'لا توجد مصروفات':'No expenses recorded'}</td></tr> : expenses.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(e => {
                  const cat = EXPENSE_CATEGORIES.find(c=>c.id===e.category) || EXPENSE_CATEGORIES[5]
                  return (
                    <tr key={e.id} style={{ borderBottom:`1px solid ${C.border}` }}>
                      <td style={{ padding:'10px 14px' }}><span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:5, background:cat.bg, color:cat.color }}>{isRTL?cat.ar:cat.en}</span></td>
                      <td style={{ padding:'10px 14px', fontWeight:700, color:'#CF222E' }}>{fmtMoney(e.amount, e.currency||cur)}</td>
                      <td style={{ padding:'10px 14px', color:C.textMuted, fontSize:12 }}>{e.date}</td>
                      <td style={{ padding:'10px 14px', color:C.textSec, fontSize:12 }}>{e.description||'—'}{e.receipt?` 📎 ${e.receipt}`:''}</td>
                      <td style={{ padding:'10px 14px' }}><button type="button" onClick={()=>deleteExpense(e.id)} style={{ border:'none', background:'transparent', cursor:'pointer', color:C.textMuted }}>{Icons.trash(14)}</button></td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>

            {showExpenseForm && (
              <Modal onClose={()=>setShowExpenseForm(false)} dir={dir} width={460}>
                <form onSubmit={ev=>{ev.preventDefault();addExpense()}}>
                  <h3 style={{ fontSize:16, fontWeight:700, color:C.text, margin:'0 0 16px' }}>{isRTL?'إضافة مصروف':'Add Expense'}</h3>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 12px' }}>
                    <FormField label={isRTL?'المبلغ':'Amount'} dir={dir}><input value={expenseForm.amount} onChange={e=>setExpenseForm(p=>({...p,amount:e.target.value}))} type="number" step="0.01" style={inputStyle(dir)} /></FormField>
                    <FormField label={isRTL?'العملة':'Currency'} dir={dir}>
                      <select value={expenseForm.currency} onChange={e=>setExpenseForm(p=>({...p,currency:e.target.value}))} style={selectStyle(dir)}>
                        {Object.entries(CURRENCY_SYMBOLS).map(([k,v])=><option key={k} value={k}>{k} ({v.trim()})</option>)}
                      </select>
                    </FormField>
                    <FormField label={isRTL?'الفئة':'Category'} dir={dir}>
                      <select value={expenseForm.category} onChange={e=>setExpenseForm(p=>({...p,category:e.target.value}))} style={selectStyle(dir)}>
                        {EXPENSE_CATEGORIES.map(c=><option key={c.id} value={c.id}>{isRTL?c.ar:c.en}</option>)}
                      </select>
                    </FormField>
                    <FormField label={isRTL?'التاريخ':'Date'} dir={dir}><input value={expenseForm.date} onChange={e=>setExpenseForm(p=>({...p,date:e.target.value}))} type="date" style={inputStyle(dir)} /></FormField>
                  </div>
                  <FormField label={isRTL?'الوصف':'Description'} dir={dir}><input value={expenseForm.description} onChange={e=>setExpenseForm(p=>({...p,description:e.target.value}))} style={inputStyle(dir)} /></FormField>
                  <FormField label={isRTL?'اسم الإيصال':'Receipt filename'} dir={dir}><input value={expenseForm.receipt} onChange={e=>setExpenseForm(p=>({...p,receipt:e.target.value}))} placeholder="receipt.pdf" style={inputStyle(dir)} /></FormField>
                  <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8 }}>
                    <button type="button" onClick={()=>setShowExpenseForm(false)} style={makeBtn('secondary')}>{isRTL?'إلغاء':'Cancel'}</button>
                    <button type="submit" style={makeBtn('primary')}>{isRTL?'إضافة':'Add'}</button>
                  </div>
                </form>
              </Modal>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
