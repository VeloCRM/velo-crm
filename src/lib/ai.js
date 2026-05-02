/**
 * Velo CRM — Client-side AI helpers.
 *
 * As of Phase 4 (Sprint 0), the Anthropic key never lives in the browser.
 * All Claude calls go through the server proxy at POST /api/ai/chat, which:
 *   - validates the caller's Supabase JWT,
 *   - resolves their org_id,
 *   - rate-limits per org,
 *   - wraps user-supplied content in <patient_message> tags for prompt-
 *     injection protection,
 *   - and returns sanitized error text on failure.
 *
 * Existing call-site signatures are preserved. The legacy `apiKey` argument
 * is silently ignored — it's accepted via JS object spread so we don't have
 * to chase down every caller.
 */

import { supabase } from './supabase'

async function getAccessToken() {
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Not signed in')
  }
  return session.access_token
}

/**
 * Send a chat completion request to the server proxy.
 * @param {object} opts
 * @param {Array<{role: 'user'|'assistant', content: string}>} opts.messages
 * @param {string} [opts.system]
 * @param {number} [opts.maxTokens=1024]
 * @returns {Promise<string>} The assistant's text reply.
 */
export async function callClaude({ messages, system, maxTokens = 1024 }) {
  const token = await getAccessToken()

  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ messages, system, maxTokens }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const msg = typeof body?.error === 'string' && body.error
      ? body.error
      : `AI request failed (${res.status})`
    throw new Error(msg)
  }

  const data = await res.json().catch(() => ({}))
  return typeof data?.text === 'string' ? data.text : ''
}

export function buildAutoReplySystem(knowledgeBase, personality, contactName) {
  const tones = {
    professional: 'Respond in a professional, business-appropriate tone.',
    friendly: 'Respond in a warm, friendly, approachable tone while staying professional.',
    formal: 'Respond in a formal, respectful tone suitable for corporate communication.',
  }

  return `You are an AI customer service agent for a business using Velo CRM.
${tones[personality] || tones.professional}
The customer's name is ${contactName || 'the customer'}.
Keep responses concise (1-3 sentences max unless the question requires more detail).
If you don't know the answer, say you'll check with the team.
Never make up information about products, pricing, or policies.

${knowledgeBase ? `KNOWLEDGE BASE:\n${knowledgeBase}` : 'No specific knowledge base provided — answer based on general customer service best practices.'}`
}

export function buildAssistantSystem(context) {
  return `You are Velo AI, an internal CRM assistant. You help team members with:
- Summarizing contact history and deal status
- Drafting emails and messages
- Analyzing CRM data and suggesting next actions
- Translating between English and Arabic

${context ? `CURRENT CONTEXT:\n${context}` : ''}
Be concise and actionable. Format responses with bullet points when listing multiple items.`
}

export async function generateAutoReply({ knowledgeBase, personality, contactName, messageHistory }) {
  const system = buildAutoReplySystem(knowledgeBase, personality, contactName)
  const messages = messageHistory.map(m => ({
    role: m.sender === 'me' ? 'assistant' : 'user',
    content: m.text || m.content,
  }))
  return callClaude({ messages, system, maxTokens: 512 })
}

export async function askAssistant({ question, context, history = [] }) {
  const system = buildAssistantSystem(context)
  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: question },
  ]
  return callClaude({ messages, system, maxTokens: 1024 })
}

// ── Legacy compatibility stubs ───────────────────────────────────────────
// Phase 4 moved key resolution to the server. These exports remain so
// existing call sites (SettingsPage, GrowthDashboard) keep linking; they all
// just resolve to "no client-side key" now.

export async function getAgencyApiKey() { return null }
export function clearAgencyKeyCache() { /* no-op — server has the key */ }
export async function resolveApiKey() { return null }

// ── Pure local computation (no API call) ─────────────────────────────────
// Note: call sites historically passed an `activities` array as the third
// arg; it was never used and is silently ignored by JS spread.
export function calculateLeadScore(contact, deals) {
  let score = 30

  const contactDeals = deals.filter(d => d.contactId === contact.id)
  const totalValue = contactDeals.reduce((s, d) => s + (d.value || 0), 0)
  if (totalValue > 50000) score += 25
  else if (totalValue > 20000) score += 20
  else if (totalValue > 5000) score += 12
  else if (totalValue > 0) score += 5

  if (contact.status === 'active') score += 15
  else if (contact.status === 'lead') score += 8

  if (contact.category === 'client') score += 10
  else if (contact.category === 'prospect') score += 6
  else if (contact.category === 'partner') score += 8

  const bestStage = contactDeals.reduce((best, d) => {
    const stages = { lead: 1, qualified: 2, proposal: 3, negotiation: 4, won: 5 }
    return Math.max(best, stages[d.stage] || 0)
  }, 0)
  score += bestStage * 3

  if (contact.createdAt) {
    const daysSinceCreated = (Date.now() - new Date(contact.createdAt).getTime()) / 86400000
    if (daysSinceCreated < 7) score += 10
    else if (daysSinceCreated < 30) score += 6
    else if (daysSinceCreated < 90) score += 3
  }

  if ((contact.tags || []).some(t => ['enterprise', 'high-value', 'vip'].includes(t.toLowerCase()))) score += 5

  const clamped = Math.min(100, Math.max(0, score))
  const tier = clamped >= 70 ? 'hot' : clamped >= 40 ? 'warm' : 'cold'

  const reasons = []
  if (totalValue > 0) reasons.push(`$${totalValue.toLocaleString()} in deals`)
  if (contact.status === 'active') reasons.push('Active status')
  if (bestStage >= 3) reasons.push('Advanced deal stage')
  if ((contact.tags || []).length > 0) reasons.push(`Tags: ${contact.tags.join(', ')}`)

  return { score: clamped, tier, reasons }
}
