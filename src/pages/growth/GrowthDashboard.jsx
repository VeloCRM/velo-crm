import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { callClaude, resolveApiKey } from '../../lib/ai'
import { C, card } from '../../design'

const HISTORY_KEY = 'velo_growth_chat'
function loadHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] } }
function saveHistory(h) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-50))) } catch {} }

const SYSTEM_PROMPT = `You are Velo's expert marketing growth agent. You are a senior digital marketing strategist with 15+ years experience. You analyze real data from the client's social media and competitors. You NEVER make up numbers — only analyze data provided to you. If data is missing, say so clearly. You respond in the same language the user writes in (Arabic or English). Your goal: help the client grow faster than their competitors by giving specific, actionable advice.`

export default function GrowthDashboard({ orgId, onGoToSocials, isSuperAdmin }) {
  const [messages, setMessages] = useState(loadHistory)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [dataContext, setDataContext] = useState({ competitors: [], socialMetrics: [], competitorMetrics: [] })
  const [dataLoading, setDataLoading] = useState(true)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  // ── Fetch API key (org-level → agency-level fallback) ────────────────
  useEffect(() => {
    resolveApiKey().then(key => { if (key) setApiKey(key) })
  }, [orgId])

  // ── Fetch org growth data ───────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!orgId || !supabase) { setDataLoading(false); return }
    setDataLoading(true)
    const results = { competitors: [], socialMetrics: [], competitorMetrics: [] }

    const { data: comp } = await supabase
      .from('competitors').select('*').eq('org_id', orgId).order('created_at', { ascending: false })
    if (comp) results.competitors = comp

    // These tables may not exist yet — query gracefully
    const { data: sm } = await supabase
      .from('social_metrics').select('*').eq('org_id', orgId)
      .order('recorded_at', { ascending: false }).limit(100)
      .then(res => res, () => ({ data: null }))
    if (sm) results.socialMetrics = sm

    const { data: cm } = await supabase
      .from('competitor_metrics').select('*').eq('org_id', orgId)
      .order('recorded_at', { ascending: false }).limit(100)
      .then(res => res, () => ({ data: null }))
    if (cm) results.competitorMetrics = cm

    setDataContext(results)
    setDataLoading(false)
  }, [orgId])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Auto-scroll ─────────────────────────────────────────────────────
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  // ── Build context string for Claude ─────────────────────────────────
  function buildContext() {
    const parts = []
    const { competitors, socialMetrics, competitorMetrics } = dataContext

    if (competitors.length > 0) {
      parts.push('COMPETITORS:\n' + competitors.map(c =>
        `- ${c.name}${c.industry ? ` (${c.industry})` : ''}${c.instagram_handle ? ` | IG: @${c.instagram_handle.replace(/^@/, '')}` : ''}${c.location ? ` | Location: ${c.location}` : ''}${c.google_maps_url ? ` | Google Maps: ${c.google_maps_url}` : ''}`
      ).join('\n'))
    }

    if (socialMetrics.length > 0) {
      parts.push('YOUR SOCIAL METRICS (recent):\n' + JSON.stringify(socialMetrics.slice(0, 20), null, 2))
    }

    if (competitorMetrics.length > 0) {
      parts.push('COMPETITOR METRICS (recent):\n' + JSON.stringify(competitorMetrics.slice(0, 20), null, 2))
    }

    if (parts.length === 0) {
      parts.push('No growth data loaded yet. The user may need to add competitors in the Competitors tab and connect social accounts in Social Connections.')
    }

    return parts.join('\n\n')
  }

  // ── Send message ────────────────────────────────────────────────────
  const send = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    const userMsg = { role: 'user', content: msg }
    const next = [...messages, userMsg]
    setMessages(next); saveHistory(next)
    setInput(''); setLoading(true); setError('')

    try {
      const contextBlock = buildContext()
      const system = SYSTEM_PROMPT + '\n\nDATA CONTEXT:\n' + contextBlock
      const history = next.slice(-12)
      const reply = await callClaude({ apiKey, messages: history, system, maxTokens: 2048 })
      const updated = [...next, { role: 'assistant', content: reply }]
      setMessages(updated); saveHistory(updated)
    } catch (err) {
      setError(err.message || 'Failed to get a response. Check your API key and network.')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const clearChat = () => { setMessages([]); saveHistory([]); setError('') }

  const totalDataPoints = dataContext.competitors.length + dataContext.socialMetrics.length + dataContext.competitorMetrics.length

  // ── No API key ──────────────────────────────────────────────────────
  if (!apiKey) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 16px' }}>
        <div style={{ maxWidth: 480, width: '100%', padding: 32, textAlign: 'center', background: 'linear-gradient(135deg, #0C0E1A 0%, #101422 100%)', border: '1px solid rgba(0,255,178,0.2)', borderRadius: 16, boxShadow: '0 0 30px rgba(0,0,0,0.4), 0 0 40px rgba(0,255,178,0.03)' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(0,255,178,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', border: '1px solid rgba(0,255,178,0.15)' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00FFB2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          {isSuperAdmin ? (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', margin: '0 0 8px' }}>
                Set Up Agency AI Key
              </h2>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, margin: '0 0 6px' }}>
                Add your Anthropic API key in <strong style={{ color: '#e2e8f0' }}>Settings → Agency AI</strong> to power the Growth Agent for all organizations.
              </p>
              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(0,255,178,0.06)', fontSize: 12, color: '#00FFB2', lineHeight: 1.5, border: '1px solid rgba(0,255,178,0.1)', marginTop: 16 }}>
                Get your API key from <strong>console.anthropic.com</strong>
              </div>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', margin: '0 0 8px' }}>
                Velo Growth Agent
              </h2>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, margin: '0 0 6px' }}>
                The AI Growth Agent is powered by Velo Agency. Contact your agency administrator to enable AI features.
              </p>
              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(124,58,237,0.06)', fontSize: 12, color: '#7c3aed', lineHeight: 1.5, border: '1px solid rgba(124,58,237,0.1)', marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/></svg>
                AI powered by Velo Agency
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Main chat UI ────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)', minHeight: 400, maxHeight: 700 }}>
      {/* Header bar */}
      <div style={{ ...card, borderRadius: '8px 8px 0 0', borderBottom: 'none', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${C.primary}, ${C.purple})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Velo Growth Agent</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>AI Marketing Strategist</div>
        </div>

        {/* Data context badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {dataLoading ? (
            <span style={{ fontSize: 11, color: C.textMuted }}>Loading data...</span>
          ) : (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 20,
              background: totalDataPoints > 0 ? C.successBg : C.warningBg,
              color: totalDataPoints > 0 ? C.success : C.warning,
              fontSize: 11, fontWeight: 600,
              border: `1px solid ${totalDataPoints > 0 ? C.successBorder : C.warningBorder}`,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                {totalDataPoints > 0
                  ? <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>
                  : <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
              </svg>
              {dataContext.competitors.length} competitor{dataContext.competitors.length !== 1 ? 's' : ''}
              {dataContext.socialMetrics.length > 0 && ` · ${dataContext.socialMetrics.length} metrics`}
            </span>
          )}
          {messages.length > 0 && (
            <button onClick={clearChat} style={{ border: 'none', background: 'transparent', color: C.textMuted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 8px', borderRadius: 4 }}
              onMouseEnter={e => e.currentTarget.style.color = C.danger}
              onMouseLeave={e => e.currentTarget.style.color = C.textMuted}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: C.bg, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, borderLeft: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}` }}>

        {/* Empty state with suggestions */}
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center', padding: '24px 0' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, rgba(0,255,178,0.08), rgba(124,58,237,0.08))', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, border: '1px solid rgba(0,255,178,0.1)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
              </svg>
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 6px' }}>Growth Agent Ready</h3>
            <p style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, margin: '0 0 20px', maxWidth: 340 }}>
              Ask me anything about your marketing strategy, competitors, or growth opportunities. I analyze your real data to give specific advice.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 500 }}>
              {[
                'Analyze my competitors and find gaps I can exploit',
                'What content strategy would help me grow fastest?',
                'حلل منافسيّ واقترح خطة للتفوق عليهم',
                'Create a 30-day growth action plan',
              ].map((q, i) => (
                <button key={i} onClick={() => send(q)} style={{
                  padding: '8px 14px', borderRadius: 8,
                  border: '1px solid rgba(0,255,178,0.12)', background: '#101422',
                  color: '#94a3b8', fontSize: 12, cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'all 150ms ease',
                  lineHeight: 1.4,
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,255,178,0.3)'; e.currentTarget.style.background = 'rgba(0,255,178,0.06)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,255,178,0.12)'; e.currentTarget.style.background = '#101422' }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 8 }}>
            {msg.role === 'assistant' && (
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg, ${C.primary}, ${C.purple})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
              </div>
            )}
            <div style={{
              maxWidth: '75%', padding: '10px 14px', borderRadius: 12,
              background: msg.role === 'user' ? 'linear-gradient(135deg, #00FFB2, #4DA6FF)' : '#0C0E1A',
              color: msg.role === 'user' ? '#080c14' : '#e2e8f0',
              border: msg.role === 'user' ? 'none' : '1px solid rgba(0,255,178,0.12)',
              fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg, ${C.primary}, ${C.purple})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
            </div>
            <div style={{ display: 'flex', gap: 4, padding: '10px 14px', background: '#0C0E1A', border: '1px solid rgba(0,255,178,0.12)', borderRadius: 12 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: C.primary, opacity: 0.4, animation: `growthPulse 0.6s ease ${i * 0.15}s infinite alternate` }} />
              ))}
              <style>{`@keyframes growthPulse { to { opacity: 1; transform: translateY(-2px) } }`}</style>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, fontSize: 12, color: C.danger, lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input area */}
      <div style={{ ...card, borderRadius: '0 0 8px 8px', borderTop: 'none', padding: '12px 20px', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Ask about growth strategy, competitors, content ideas..."
          rows={1}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 8,
            border: `1px solid ${C.border}`, fontSize: 13, color: C.text,
            fontFamily: 'inherit', outline: 'none', background: C.bg,
            resize: 'none', lineHeight: 1.5, minHeight: 40, maxHeight: 120,
          }}
          onFocus={e => e.currentTarget.style.borderColor = C.primary}
          onBlur={e => e.currentTarget.style.borderColor = C.border}
          onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }}
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          style={{
            width: 40, height: 40, borderRadius: 8, border: 'none',
            background: input.trim() ? `linear-gradient(135deg, ${C.primary}, ${C.purple})` : C.border,
            color: '#fff', cursor: input.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            transition: 'all 150ms ease', opacity: loading ? 0.6 : 1,
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
