export default function GrowthReports({ orgId }) {
  const reports = [
    { title: 'Weekly Report', date: 'Coming Apr 13', type: 'weekly' },
    { title: 'Monthly Report', date: 'Coming May 1', type: 'monthly' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 16px' }}>
      {/* Icon */}
      <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>

      {/* Title */}
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', margin: '0 0 6px', textAlign: 'center' }}>
        Growth Reports
      </h2>
      <p style={{ fontSize: 13, color: '#475569', margin: '0 0 32px', textAlign: 'center', maxWidth: 380 }}>
        Weekly and monthly reports will appear here automatically once your social accounts are connected and competitor tracking is active.
      </p>

      {/* Placeholder report cards */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: 560 }}>
        {reports.map((r, i) => (
          <div key={i} style={{
            flex: '1 1 240px', padding: 20, borderRadius: 10,
            background: '#111827', border: '1px solid rgba(0,212,255,0.15)',
            boxShadow: '0 0 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{r.title}</span>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 99,
                background: 'rgba(0,212,255,0.08)', color: '#00d4ff',
                border: '1px solid rgba(0,212,255,0.2)',
              }}>Scheduled</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              <span style={{ fontSize: 12, color: '#475569' }}>{r.date}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
