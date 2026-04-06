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
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Growth Intelligence
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          تحليل المنافسين · تقارير النمو · AI Marketing Expert
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-6 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
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
