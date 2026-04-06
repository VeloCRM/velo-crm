export default function SocialConnections({ orgId }) {
  const platforms = [
    {
      id: 'meta',
      name: 'Meta / Instagram',
      icon: '📸',
      color: 'bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800',
      description:
        'Connect your Instagram Business account to pull follower count, engagement rate, top posts, and audience demographics automatically.',
    },
    {
      id: 'google',
      name: 'Google Maps',
      icon: '📍',
      color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
      description:
        'Connect Google Business Profile to track your star rating, review count, review sentiment, and local search visibility.',
    },
  ]

  return (
    <div className="space-y-4">
      {platforms.map(p => (
        <div
          key={p.id}
          className={`rounded-xl border p-6 ${p.color} flex items-start gap-5`}
        >
          {/* Icon */}
          <span className="text-3xl flex-shrink-0 mt-0.5">{p.icon}</span>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {p.name}
              </h3>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                Coming Soon
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              {p.description}
            </p>
          </div>

          {/* Button */}
          <button
            disabled
            className="flex-shrink-0 px-5 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 text-sm font-medium cursor-not-allowed"
          >
            Connect
          </button>
        </div>
      ))}

      {/* Tip */}
      <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-5 text-center">
        <p className="text-sm text-gray-400 dark:text-gray-500">
          🔒 OAuth integration is under development. Once live, connecting takes one click — no credentials stored on our side.
        </p>
      </div>
    </div>
  )
}
