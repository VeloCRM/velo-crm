export default function GrowthReports({ orgId }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      {/* Icon */}
      <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-5">
        <svg
          className="w-8 h-8 text-gray-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>

      {/* Message */}
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        No reports yet
      </h2>
      <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm">
        Reports generate automatically every week once your social accounts are
        connected and competitor tracking is active.
      </p>
    </div>
  )
}
