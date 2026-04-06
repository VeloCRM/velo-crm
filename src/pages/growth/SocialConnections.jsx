export default function SocialConnections({ orgId }) {
  const platforms = [
    {
      id: 'meta',
      name: 'Meta / Instagram',
      icon: '📸',
      accent: '#e879a8',
      accentBg: 'rgba(232,121,168,0.08)',
      accentBorder: 'rgba(232,121,168,0.15)',
      description:
        'Connect your Instagram Business account to pull follower count, engagement rate, top posts, and audience demographics automatically.',
    },
    {
      id: 'google',
      name: 'Google Maps',
      icon: '📍',
      accent: '#00d4ff',
      accentBg: 'rgba(0,212,255,0.08)',
      accentBorder: 'rgba(0,212,255,0.15)',
      description:
        'Connect Google Business Profile to track your star rating, review count, review sentiment, and local search visibility.',
    },
  ]

  const cardStyle = {
    background: '#111827', borderRadius: 10, padding: 24,
    border: '1px solid rgba(255,255,255,0.06)',
    boxShadow: '0 0 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
    display: 'flex', alignItems: 'flex-start', gap: 20,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {platforms.map(p => (
        <div key={p.id} style={{ ...cardStyle, borderLeft: `3px solid ${p.accent}` }}>
          {/* Icon */}
          <span style={{ fontSize: 28, flexShrink: 0, marginTop: 2 }}>{p.icon}</span>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
                {p.name}
              </h3>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                background: 'rgba(245,158,11,0.08)', color: '#f59e0b',
                border: '1px solid rgba(245,158,11,0.15)',
              }}>
                Coming Soon
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
              {p.description}
            </p>
          </div>

          {/* Button */}
          <button disabled style={{
            flexShrink: 0, padding: '8px 18px', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)', color: '#475569',
            border: '1px solid rgba(255,255,255,0.06)',
            fontSize: 13, fontWeight: 500, cursor: 'not-allowed', fontFamily: 'inherit',
          }}>
            Connect
          </button>
        </div>
      ))}

      {/* Tip */}
      <div style={{
        background: '#111827', borderRadius: 10, padding: 20, textAlign: 'center',
        border: '1px dashed rgba(255,255,255,0.08)',
      }}>
        <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>
          🔒 OAuth integration is under development. Once live, connecting takes one click — no credentials stored on our side.
        </p>
      </div>
    </div>
  )
}
