import { useState } from 'react'
import { C, makeBtn, card } from '../design'
import { Icons } from '../components/shared'

const INTEGRATIONS = [
  { id: 'whatsapp', name: 'WhatsApp Business', desc: 'Send and receive WhatsApp messages directly from Velo inbox', category: 'communication', connected: true, color: '#25D366', initial: 'W' },
  { id: 'gmail', name: 'Gmail', desc: 'Sync emails, track opens, and send from your Gmail account', category: 'communication', connected: true, color: '#EA4335', initial: 'G' },
  { id: 'twilio', name: 'Twilio SMS', desc: 'Send SMS notifications and alerts to contacts', category: 'communication', connected: false, color: '#F22F46', initial: 'T' },
  { id: 'facebook', name: 'Facebook Messenger', desc: 'Manage Facebook conversations and leads in one place', category: 'social', connected: false, color: '#1877F2', initial: 'f' },
  { id: 'instagram', name: 'Instagram DM', desc: 'Reply to Instagram messages and manage social interactions', category: 'social', connected: false, color: '#E4405F', initial: 'I' },
  { id: 'gcalendar', name: 'Google Calendar', desc: 'Sync appointments and events with Google Calendar', category: 'calendar', connected: false, color: '#4285F4', initial: 'G' },
  { id: 'meta_ads', name: 'Meta Ads', desc: 'Import leads from Facebook and Instagram ad campaigns', category: 'marketing', connected: false, color: '#0668E1', initial: 'M' },
  { id: 'zapier', name: 'Zapier', desc: 'Connect Velo to 5000+ apps with automated workflows', category: 'automation', connected: false, color: '#FF4A00', initial: 'Z' },
  { id: 'make', name: 'Make (Integromat)', desc: 'Build advanced automation scenarios with visual builder', category: 'automation', connected: false, color: '#6D00CC', initial: 'M' },
  { id: 'stripe', name: 'Stripe', desc: 'Process payments, track invoices, and manage subscriptions', category: 'payments', connected: false, color: '#635BFF', initial: 'S' },
]

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'communication', label: 'Communication' },
  { id: 'social', label: 'Social' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'automation', label: 'Automation' },
  { id: 'payments', label: 'Payments' },
]

export default function IntegrationsPage({ t, lang, dir, isRTL }) {
  const [integrations, setIntegrations] = useState(INTEGRATIONS)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const toggleConnection = (id) => setIntegrations(prev => prev.map(i => i.id === id ? { ...i, connected: !i.connected } : i))
  const connectedCount = integrations.filter(i => i.connected).length

  const filtered = integrations.filter(i => {
    const matchCat = filter === 'all' || i.category === filter
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  return (
    <div style={{ direction: dir }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>{t.integrations}</h1>
          <p style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>{connectedCount} {t.connected || 'connected'} &middot; {integrations.length} {t.availableIntegrations || 'available'}</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.white, borderRadius: 8, padding: '7px 12px', border: `1px solid ${C.border}`, flex: 1, maxWidth: 300 }}>
          <span style={{ color: C.textMuted, display: 'flex' }}>{Icons.search(14)}</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.searchIntegrations || 'Search integrations...'} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: C.text, flex: 1, fontFamily: 'inherit', direction: dir }} />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setFilter(cat.id)}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: filter === cat.id ? C.primary : C.bg, color: filter === cat.id ? '#fff' : C.textSec, transition: 'all .15s' }}>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Integration cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320, 1fr))', gap: 16 }}>
        {filtered.map(ig => (
          <div key={ig.id} style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
            {ig.connected && <div style={{ position: 'absolute', top: 14, right: 14, width: 10, height: 10, borderRadius: '50%', background: '#25D366', border: '2px solid #fff', boxShadow: '0 0 0 1px #DAFBE1' }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${ig.color}15`, color: ig.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, flexShrink: 0 }}>
                {ig.initial}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{ig.name}</div>
                <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'capitalize' }}>{ig.category}</div>
              </div>
            </div>
            <p style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5, margin: 0, flex: 1 }}>{ig.desc}</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: ig.connected ? '#DAFBE1' : C.bg, color: ig.connected ? '#1A7F37' : C.textMuted }}>
                {ig.connected ? (t.connected || 'Connected') : (lang === 'ar' ? 'غير متصل' : 'Not connected')}
              </span>
              <button onClick={() => toggleConnection(ig.id)}
                style={ig.connected ? makeBtn('secondary', { fontSize: 12, padding: '5px 12px' }) : makeBtn('primary', { fontSize: 12, padding: '5px 12px' })}>
                {ig.connected ? (t.disconnect || 'Disconnect') : (t.connect || 'Connect')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
