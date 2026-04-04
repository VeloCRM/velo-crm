import { useState, useRef, useEffect } from 'react'
import { C, makeBtn } from '../design'
import { askAssistant } from '../lib/ai'

const HISTORY_KEY = 'velo_ai_chat_history'
function loadHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] } }
function saveHistory(h) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-50))) } catch {} }

function getStoredAnthropicKey() {
  try { return JSON.parse(localStorage.getItem('velo_api_keys') || '{}').anthropic || '' } catch { return '' }
}

export default function AIAssistant({ open, onClose, apiKey, context, lang, knowledgeBase, contacts, deals, tickets, onNavigateToApiKeys }) {
  const [messages, setMessages] = useState(loadHistory)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef(null)
  const isRTL = lang === 'ar'

  // Resolve the active key: prop from orgSettings first, then localStorage fallback
  const resolvedKey = apiKey || getStoredAnthropicKey()

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
      const reply = await askAssistant({ apiKey: resolvedKey, question: msg, context: fullContext, history: messages.slice(-10) })
      const updated = [...next, { role: 'assistant', content: reply }]
      setMessages(updated); saveHistory(updated)
    } catch (err) { setError(isRTL ? 'حدث خطأ أثناء الاتصال بالذكاء الاصطناعي. تحقق من مفتاح API والشبكة.' : 'Failed to reach the AI service. Please check your API key and network connection.') }
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

  // No API key — show setup prompt
  const noKey = !resolvedKey

  return (
    <div style={{ position:'fixed', bottom:24, [isRTL?'left':'right']:24, width:400, maxWidth:'calc(100vw - 48px)', height:540, maxHeight:'calc(100vh - 100px)', background:C.white, borderRadius:16, border:`1px solid ${C.border}`, boxShadow:'0 16px 48px rgba(0,0,0,.15)', zIndex:1800, display:'flex', flexDirection:'column', overflow:'hidden', direction:isRTL?'rtl':'ltr' }}>
      {/* Header */}
      <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:32, height:32, borderRadius:8, background:`linear-gradient(135deg,${C.primary},#8250DF)`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        </div>
        <div style={{ flex:1 }}><div style={{ fontSize:14, fontWeight:700, color:C.text }}>Velo AI</div><div style={{ fontSize:10, color:C.textMuted }}>{isRTL?'مساعد CRM الذكي':'CRM Assistant'}</div></div>
        {!noKey && <button type="button" onClick={clearHistory} style={{ border:'none', background:'transparent', cursor:'pointer', color:C.textMuted, fontSize:11, fontFamily:'inherit' }}>{isRTL?'مسح':'Clear'}</button>}
        <button type="button" onClick={onClose} style={{ border:'none', background:'transparent', cursor:'pointer', color:C.textMuted, display:'flex', fontSize:18 }}>&times;</button>
      </div>

      {noKey ? (
        /* ── No API key: Setup prompt ────────────────────── */
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 24px', textAlign:'center' }}>
          <div style={{ width:72, height:72, borderRadius:20, background:'linear-gradient(135deg, #DDF4FF, #FBEFFF)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20 }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#8250DF" strokeWidth="1.5" strokeLinecap="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h3 style={{ fontSize:16, fontWeight:700, color:C.text, margin:'0 0 8px' }}>
            {isRTL ? 'إعداد مساعد الذكاء الاصطناعي' : 'Set Up AI Assistant'}
          </h3>
          <p style={{ fontSize:13, color:C.textSec, lineHeight:1.6, margin:'0 0 8px', maxWidth:300 }}>
            {isRTL
              ? 'لتفعيل مساعد الذكاء الاصطناعي، أضف مفتاح Anthropic API الخاص بك في الإعدادات.'
              : 'To enable the AI Assistant, add your Anthropic API key in Settings.'}
          </p>
          <p style={{ fontSize:12, color:C.textMuted, margin:'0 0 24px' }}>
            {isRTL ? 'الإعدادات → مفاتيح API → مفتاح Anthropic' : 'Settings → API Keys → Anthropic API Key'}
          </p>
          <button onClick={() => { if (onNavigateToApiKeys) onNavigateToApiKeys(); onClose() }} style={{
            display:'inline-flex', alignItems:'center', gap:8,
            padding:'12px 24px', borderRadius:10, border:'none',
            background:`linear-gradient(135deg, ${C.primary}, #8250DF)`, color:'#fff',
            fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
            boxShadow:'0 4px 12px rgba(9,105,218,.3)',
            transition:'transform .15s, box-shadow .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(9,105,218,.4)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(9,105,218,.3)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            {isRTL ? 'الذهاب إلى الإعدادات' : 'Go to Settings'}
          </button>
          <div style={{ marginTop:20, padding:'10px 14px', borderRadius:8, background:'#DDF4FF', fontSize:11, color:'#0969DA', lineHeight:1.5 }}>
            💡 {isRTL ? 'احصل على مفتاح API من' : 'Get your API key from'} <strong>console.anthropic.com</strong>
          </div>
        </div>
      ) : (
        /* ── Chat interface (key configured) ─────────────── */
        <>
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
        </>
      )}
    </div>
  )
}
