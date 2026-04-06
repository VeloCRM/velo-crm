import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function CompetitorSetup({ orgId }) {
  const [competitors, setCompetitors] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    industry: '',
    instagram_handle: '',
    google_maps_url: '',
    location: '',
  })

  // ── Fetch competitors ────────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return
    fetchCompetitors()
  }, [orgId])

  async function fetchCompetitors() {
    setLoading(true)
    const { data, error } = await supabase
      .from('competitors')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
    if (error) console.error('Fetch competitors error:', error)
    setCompetitors(data || [])
    setLoading(false)
  }

  // ── Add competitor ───────────────────────────────────────────────────
  async function handleAdd(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    const { error } = await supabase.from('competitors').insert({
      org_id: orgId,
      name: form.name.trim(),
      industry: form.industry.trim(),
      instagram_handle: form.instagram_handle.trim(),
      google_maps_url: form.google_maps_url.trim(),
      location: form.location.trim(),
    })
    if (error) {
      console.error('Add competitor error:', error)
    } else {
      setForm({ name: '', industry: '', instagram_handle: '', google_maps_url: '', location: '' })
      await fetchCompetitors()
    }
    setSaving(false)
  }

  // ── Delete competitor ────────────────────────────────────────────────
  async function handleDelete(id) {
    const { error } = await supabase.from('competitors').delete().eq('id', id)
    if (error) console.error('Delete competitor error:', error)
    else setCompetitors(prev => prev.filter(c => c.id !== id))
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Add Form ──────────────────────────────────────────────────── */}
      <form
        onSubmit={handleAdd}
        className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6"
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          🎯 Add Competitor
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              Name *
            </label>
            <input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. BrightSmile Dental"
              required
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              Industry
            </label>
            <input
              value={form.industry}
              onChange={e => setForm(p => ({ ...p, industry: e.target.value }))}
              placeholder="e.g. Dental, Real Estate"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              Instagram Handle
            </label>
            <input
              value={form.instagram_handle}
              onChange={e => setForm(p => ({ ...p, instagram_handle: e.target.value }))}
              placeholder="@handle"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              Google Maps URL
            </label>
            <input
              value={form.google_maps_url}
              onChange={e => setForm(p => ({ ...p, google_maps_url: e.target.value }))}
              placeholder="https://maps.google.com/..."
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              Location
            </label>
            <input
              value={form.location}
              onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
              placeholder="e.g. Baghdad, Erbil"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving || !form.name.trim()}
          className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Adding...' : '+ Add Competitor'}
        </button>
      </form>

      {/* ── Competitors List ──────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Tracked Competitors
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({competitors.length})
            </span>
          </h2>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Loading...</div>
        ) : competitors.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-sm">No competitors added yet.</p>
            <p className="text-gray-400 text-xs mt-1">
              Add your first competitor above to start tracking.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-750 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Industry</th>
                <th className="px-6 py-3">Instagram</th>
                <th className="px-6 py-3">Location</th>
                <th className="px-6 py-3">Google Maps</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {competitors.map(comp => (
                <tr
                  key={comp.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                >
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                    {comp.name}
                  </td>
                  <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                    {comp.industry || '—'}
                  </td>
                  <td className="px-6 py-4">
                    {comp.instagram_handle ? (
                      <span className="text-pink-600 dark:text-pink-400">
                        @{comp.instagram_handle.replace(/^@/, '')}
                      </span>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                    {comp.location || '—'}
                  </td>
                  <td className="px-6 py-4">
                    {comp.google_maps_url ? (
                      <a
                        href={comp.google_maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-xs"
                      >
                        View Map ↗
                      </a>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDelete(comp.id)}
                      className="text-red-500 hover:text-red-700 text-xs font-medium transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
