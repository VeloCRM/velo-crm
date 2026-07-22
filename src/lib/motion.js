import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
gsap.registerPlugin(useGSAP)

/* ── Pure helpers (unit-tested, no DOM) ───────────────────────────────── */

// IQD display format: thousands-separated, never decimals.
export function formatIQD(n) {
  const v = Math.floor(Number(n) || 0)
  return v.toLocaleString('en-US')
}

export function clampPct(n) {
  const v = Number(n)
  if (Number.isNaN(v)) return 0
  return Math.min(100, Math.max(0, v))
}

// Single decision point the wrappers consume so reduced-motion behaviour is
// testable without a browser.
export function resolveMotion(prefersReduced) {
  return { instant: !!prefersReduced }
}

/* ── GSAP wrappers (browser-verified) ─────────────────────────────────── */
// Each wrapper uses gsap.matchMedia so the reduced-motion branch sets final
// state instantly and never blocks interaction. Callers pass a scoped root
// element/selector; the returned matchMedia can be reverted on cleanup.

const RM = { reduce: '(prefers-reduced-motion: reduce)', ok: '(prefers-reduced-motion: no-preference)' }

// Page-level entrance choreography. Consumers tag elements with
// data-anim="title" | "card" | "row".
export function entrance(scope) {
  const mm = gsap.matchMedia(scope)
  mm.add(RM, (ctx) => {
    const q = gsap.utils.selector(scope)
    const els = [q('[data-anim="title"]'), q('[data-anim="card"]'), q('[data-anim="row"]')]
    if (ctx.conditions.reduce) {
      gsap.set(els, { clearProps: 'all', opacity: 1, y: 0 })
      return
    }
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } })
    tl.from(q('[data-anim="title"]'), { opacity: 0, y: 12, duration: 0.25 })
      .from(q('[data-anim="card"]'), { opacity: 0, y: 16, duration: 0.25, stagger: 0.06 }, '-=0.1')
      .from(q('[data-anim="row"]'),  { opacity: 0, y: 12, duration: 0.22, stagger: 0.05 }, '-=0.12')
  })
  return mm
}

export function countUp(el, target, { format = formatIQD } = {}) {
  const mm = gsap.matchMedia()
  const obj = { v: 0 }
  mm.add(RM, (ctx) => {
    if (ctx.conditions.reduce) { el.textContent = format(target); return }
    gsap.to(obj, { v: target, duration: 0.9, ease: 'power1.out',
      onUpdate: () => { el.textContent = format(obj.v) } })
  })
  return mm
}

export function progressBar(el, pct) {
  const target = clampPct(pct)
  const mm = gsap.matchMedia()
  mm.add(RM, (ctx) => {
    if (ctx.conditions.reduce) { el.style.width = target + '%'; return }
    gsap.fromTo(el, { width: '0%' }, { width: target + '%', duration: 0.7, ease: 'power2.out' })
  })
  return mm
}

// Live-state pulse ("In chair" only). Max one pulsing element per view —
// caller-enforced.
export function pulse(el) {
  const mm = gsap.matchMedia()
  mm.add(RM, (ctx) => {
    if (ctx.conditions.reduce) return
    gsap.to(el, { opacity: 0.55, duration: 0.9, ease: 'sine.inOut', yoyo: true, repeat: -1 })
  })
  return mm
}

export function pressFeedback(el) {
  const mm = gsap.matchMedia()
  mm.add({ ok: '(prefers-reduced-motion: no-preference)' }, () => {
    gsap.to(el, { scale: 0.96, duration: 0.08, yoyo: true, repeat: 1, ease: 'power1.inOut' })
  })
  return mm
}

export function toast(el) {
  const mm = gsap.matchMedia()
  mm.add(RM, (ctx) => {
    if (ctx.conditions.reduce) { gsap.set(el, { opacity: 1, y: 0 }); return }
    gsap.timeline()
      .fromTo(el, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' })
      .to(el, { opacity: 0, y: -8, duration: 0.3, ease: 'power2.in', delay: 2.2 })
  })
  return mm
}
