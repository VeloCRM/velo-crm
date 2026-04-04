/**
 * WhatsApp Cloud API — Send messages
 */

export async function sendWhatsAppMessage({ phoneNumberId, accessToken, to, text }) {
  if (!phoneNumberId || !accessToken) throw new Error('WhatsApp not configured')

  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `WhatsApp API error: ${res.status}`)
  }

  return res.json()
}

export async function sendWhatsAppTemplate({ phoneNumberId, accessToken, to, templateName, language = 'en', components = [] }) {
  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        components,
      },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `WhatsApp template error: ${res.status}`)
  }

  return res.json()
}

export async function sendWhatsAppImage({ phoneNumberId, accessToken, to, imageUrl, caption }) {
  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { link: imageUrl, caption },
    }),
  })

  if (!res.ok) throw new Error(`WhatsApp image error: ${res.status}`)
  return res.json()
}
