/**
 * Velo CRM — AI Service (Claude API)
 * Uses the org's own Anthropic API key stored in the organizations table.
 */

export async function callClaude({ apiKey, messages, system, maxTokens = 1024 }) {
  if (!apiKey) throw new Error('No Anthropic API key configured. Go to Settings → AI to add your key.')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: system || 'You are a helpful CRM assistant for Velo CRM. Be concise and professional.',
      messages,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const rawMsg = err.error?.message || ''
    // Sanitize error message to never leak the API key
    const safeMsg = apiKey && rawMsg.includes(apiKey) ? `Claude API error: ${res.status}` : (rawMsg || `Claude API error: ${res.status}`)
    throw new Error(safeMsg)
  }

  const data = await res.json()
  return data.content?.[0]?.text || ''
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

export async function generateAutoReply({ apiKey, knowledgeBase, personality, contactName, messageHistory }) {
  const system = buildAutoReplySystem(knowledgeBase, personality, contactName)
  const messages = messageHistory.map(m => ({
    role: m.sender === 'me' ? 'assistant' : 'user',
    content: m.text || m.content,
  }))

  return callClaude({ apiKey, messages, system, maxTokens: 512 })
}

export async function askAssistant({ apiKey, question, context, history = [] }) {
  const system = buildAssistantSystem(context)
  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: question },
  ]

  return callClaude({ apiKey, messages, system, maxTokens: 1024 })
}

export function calculateLeadScore(contact, deals, activities) {
  let score = 30 // base score

  // Deal value factor (0-25 points)
  const contactDeals = deals.filter(d => d.contactId === contact.id)
  const totalValue = contactDeals.reduce((s, d) => s + (d.value || 0), 0)
  if (totalValue > 50000) score += 25
  else if (totalValue > 20000) score += 20
  else if (totalValue > 5000) score += 12
  else if (totalValue > 0) score += 5

  // Status factor (0-15 points)
  if (contact.status === 'active') score += 15
  else if (contact.status === 'lead') score += 8

  // Category factor (0-10 points)
  if (contact.category === 'client') score += 10
  else if (contact.category === 'prospect') score += 6
  else if (contact.category === 'partner') score += 8

  // Deal stage factor (0-15 points)
  const bestStage = contactDeals.reduce((best, d) => {
    const stages = { lead: 1, qualified: 2, proposal: 3, negotiation: 4, won: 5 }
    return Math.max(best, stages[d.stage] || 0)
  }, 0)
  score += bestStage * 3

  // Recency factor (0-10 points)
  if (contact.createdAt) {
    const daysSinceCreated = (Date.now() - new Date(contact.createdAt).getTime()) / 86400000
    if (daysSinceCreated < 7) score += 10
    else if (daysSinceCreated < 30) score += 6
    else if (daysSinceCreated < 90) score += 3
  }

  // Tags bonus
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
