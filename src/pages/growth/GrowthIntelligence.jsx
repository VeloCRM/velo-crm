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

export default function GrowthIntelligence({ orgId, isOperator }) {
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
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 24, paddingBottom: 0 }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px', borderRadius: '8px 8px 0 0', fontSize: 14, fontWeight: 500,
              minWidth: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 200ms ease',
              background: activeTab === tab.id ? 'rgba(0,255,178,0.08)' : 'transparent',
              color: activeTab === tab.id ? '#00FFB2' : '#94a3b8',
              borderBottom: activeTab === tab.id ? '2px solid #00FFB2' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'dashboard'   && <GrowthDashboard orgId={orgId} onGoToSocials={() => setActiveTab('socials')} isOperator={isOperator} />}
      {activeTab === 'socials'     && <SocialConnections orgId={orgId} />}
      {activeTab === 'competitors' && <CompetitorSetup orgId={orgId} />}
      {activeTab === 'reports'     && <GrowthReports orgId={orgId} />}
    </div>
  )
}
