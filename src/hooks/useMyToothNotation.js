/**
 * useMyToothNotation — the current user's tooth-notation preference
 * ('fdi' | 'palmer'), read from their profiles row. Mirrors useMyRole in
 * DentalTabs.jsx: a self-contained profile fetch, cancel-guarded, defaulting
 * to 'fdi' on absence or error (FDI is the canonical, always-safe rendering).
 */
import { useState, useEffect } from 'react'
import { fetchMyProfile } from '../lib/profiles'

export default function useMyToothNotation() {
  const [notation, setNotation] = useState('fdi')
  useEffect(() => {
    let cancelled = false
    fetchMyProfile()
      .then(p => { if (!cancelled) setNotation(p?.tooth_notation || 'fdi') })
      .catch(() => { if (!cancelled) setNotation('fdi') })
    return () => { cancelled = true }
  }, [])
  return notation
}
