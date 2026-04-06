import { useState } from 'react'
import SocialConnections from './SocialConnections'
import CompetitorSetup from './CompetitorSetup'
import GrowthDashboard from './GrowthDashboard'
import GrowthReports from './GrowthReports'

const tabs = [
  { id: 'dashboard',    label: '📊 Growth Dashboard' },
  { id: 'socials',      label: '🔗 Social Connections' },
  { id: 'competitors',  label: '🎯 Competitors' },
  { id: 'reports',      label: '📋 Reports' },
]

export default function GrowthIntelligence({ orgId }) {
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
          Growth Intelligence
        </h1>
        <p style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
          تحليل المنافسين · تقارير النمو · AI Marketing Expert
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, background: '#0d1420', borderRadius: 10, padding: 3, marginBottom: 24, width: 'fit-content', border: '1px solid rgba(255,255,255,0.06)' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 200ms ease',
              background: activeTab === tab.id ? 'rgba(0,212,255,0.08)' : 'transparent',
              color: activeTab === tab.id ? '#00d4ff' : '#94a3b8',
              borderBottom: activeTab === tab.id ? '2px solid #00d4ff' : '2px solid transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'dashboard'   && <GrowthDashboard orgId={orgId} onGoToSocials={() => setActiveTab('socials')} />}
      {activeTab === 'socials'     && <SocialConnections orgId={orgId} />}
      {activeTab === 'competitors' && <CompetitorSetup orgId={orgId} />}
      {activeTab === 'reports'     && <GrowthReports orgId={orgId} />}
    </div>
  )
}
