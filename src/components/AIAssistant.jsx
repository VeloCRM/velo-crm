import { useState, useRef, useEffect } from 'react'
import { C, makeBtn } from '../design'
import { askAssistant } from '../lib/ai'

const HISTORY_KEY = 'velo_ai_chat_history'
function loadHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] } }
function saveHistory(h) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-50))) } catch {} }

export default function AIAssistant({ open, onClose, apiKey, context, lang, knowledgeBase, contacts, deals, tickets }) {
  const [messages, setMessages] = useState(loadHistory)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef(null)
  const isRTL = lang === 'ar'

  useEffect(() => { if (endRef.current && open) endRef.current.scrollIntoView({ behavior: 'smooth' }) }, [messages, open])

  const fullContext = [
    context,
    knowledgeBase ? `\nKNOWLEDGE BASE:\n${knowledgeBase.slice(0, 3000)}` : '',
    contacts?.length ? `\nTop contacts: ${contacts.slice(0,5).map(c=>`${c.name} (${c.company})`).join(', ')}` : '',
    deals?.length ? `\nActive deals: ${deals.filter(d=>!['won','lost'].includes(d.stage)).slice(0,5).map(d=>`${d.name}: $${d.value}`).join(', ')}` : '',
    tickets?.length ? `\nOpen tickets: ${tickets.filter(t=>['open','in_progress'].includes(t.status)).length}` : '',
  ].filter(Boolean).join('\n')

  const send = async (text) => {
    const msg = text || input.trim()
    if (!msg || loading) return
    const userMsg = { role: 'user', content: msg }
    const next = [...messages, userMsg]
    setMessages(next); saveHistory(next)
    setInput(''); setLoading(true); setError('')
    try {
      const reply = await askAssistant({ apiKey, question: msg, context: fullContext, history: messages.slice(-10) })
      const updated = [...next, { role: 'assistant', content: reply }]
      setMessages(updated); saveHistory(updated)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const clearHistory = () => { setMessages([]); saveHistory([]) }

  if (!open) return null

  const suggestions = [
    isRTL ? 'ما هي الصفقات التي تُغلق هذا الشهر؟' : 'What deals are closing this month?',
    isRTL ? 'لخص نشاط اليوم' : "Summarize today's tasks",
    isRTL ? 'صِغ رسالة متابعة' : 'Draft a follow-up email',
    isRTL ? 'ترجم إلى العربية' : 'Translate to Arabic',
  ]

  return (
    <div style={{ position:'fixed', bottom:24, [isRTL?'left':'right']:24, width:400, maxWidth:'calc(100vw - 48px)', height:540, maxHeight:'calc(100vh - 100px)', background:C.white, borderRadius:16, border:`1px solid ${C.border}`, boxShadow:'0 16px 48px rgba(0,0,0,.15)', zIndex:1800, display:'flex', flexDirection:'column', overflow:'hidden', direction:isRTL?'rtl':'ltr' }}>
      {/* Header */}
      <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:32, height:32, borderRadius:8, background:`linear-gradient(135deg,${C.primary},#8250DF)`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        </div>
        <div style={{ flex:1 }}><div style={{ fontSize:14, fontWeight:700, color:C.text }}>Velo AI</div><div style={{ fontSize:10, color:C.textMuted }}>{isRTL?'مساعد CRM الذكي':'CRM Assistant'}</div></div>
        <button type="button" onClick={clearHistory} style={{ border:'none', background:'transparent', cursor:'pointer', color:C.textMuted, fontSize:11, fontFamily:'inherit' }}>{isRTL?'مسح':'Clear'}</button>
        <button type="button" onClick={onClose} style={{ border:'none', background:'transparent', cursor:'pointer', color:C.textMuted, display:'flex', fontSize:18 }}>&times;</button>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflow:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:10 }}>
        {messages.length === 0 && (
          <div style={{ textAlign:'center', padding:24 }}>
            <div style={{ fontSize:36, marginBottom:10 }}>✨</div>
            <h3 style={{ fontSize:14, fontWeight:700, color:C.text, margin:'0 0 6px' }}>{isRTL?'مرحباً! كيف يمكنني مساعدتك؟':'Hi! How can I help?'}</h3>
            <p style={{ fontSize:11, color:C.textMuted, lineHeight:1.5, margin:'0 0 16px' }}>{isRTL?'يمكنني تلخيص البيانات، صياغة الرسائل، والإجابة عن أسئلتك':'I can summarize data, draft messages, and answer your questions'}</p>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {suggestions.map((q,i) => (
                <button type="button" key={i} onClick={() => send(q)} style={{ padding:'8px 12px', borderRadius:8, border:`1px solid ${C.border}`, background:C.bg, color:C.textSec, fontSize:11, cursor:'pointer', fontFamily:'inherit', textAlign:isRTL?'right':'left', transition:'background .1s' }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.primaryBg} onMouseLeave={e=>e.currentTarget.style.background=C.bg}>{q}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg,i) => (
          <div key={i} style={{ display:'flex', justifyContent:msg.role==='user'?'flex-end':'flex-start' }}>
            <div style={{ maxWidth:'85%', padding:'10px 14px', borderRadius:12, background:msg.role==='user'?C.primary:C.bg, color:msg.role==='user'?'#fff':C.text, border:msg.role==='user'?'none':`1px solid ${C.border}`, fontSize:13, lineHeight:1.5, whiteSpace:'pre-wrap' }}>{msg.content}</div>
          </div>
        ))}
        {loading && <div style={{ display:'flex', gap:4, padding:'8px 14px' }}>{[0,1,2].map(i=><div key={i} style={{ width:8, height:8, borderRadius:'50%', background:C.primary, opacity:.4, animation:`pulse .6s ease ${i*.15}s infinite alternate` }}/>)}<style>{`@keyframes pulse { to { opacity: 1 } }`}</style></div>}
        {error && <div style={{ padding:'8px 12px', borderRadius:8, background:'#FFEBE9', fontSize:11, color:'#CF222E' }}>{error}</div>}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{ padding:'10px 14px', borderTop:`1px solid ${C.border}`, display:'flex', gap:8 }}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder={isRTL?'اسأل Velo AI...':'Ask Velo AI...'} style={{ flex:1, padding:'9px 12px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, color:C.text, fontFamily:'inherit', outline:'none', direction:isRTL?'rtl':'ltr', background:C.bg }} />
        <button type="button" onClick={()=>send()} disabled={loading||!input.trim()} style={{ width:38, height:38, borderRadius:8, border:'none', background:input.trim()?C.primary:C.border, color:'#fff', cursor:input.trim()?'pointer':'default', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  )
}
