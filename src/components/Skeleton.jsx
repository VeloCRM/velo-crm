import { C } from '../design'

export function Skeleton({ width = '100%', height = 16, radius = 6, style = {} }) {
  return (
    <div style={{ width, height, borderRadius: radius, background: `linear-gradient(90deg, ${C.border}40 25%, ${C.border}80 50%, ${C.border}40 75%)`, backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', ...style }}>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
    </div>
  )
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Skeleton width={40} height={40} radius={20} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Skeleton width="60%" height={14} />
          <Skeleton width="40%" height={10} />
        </div>
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={`${85 - i * 15}%`} height={12} />
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 6 }) {
  return (
    <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 16, padding: '12px 16px', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
        {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} width={`${100 / cols}%`} height={12} />)}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} style={{ display: 'flex', gap: 16, padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
          {Array.from({ length: cols }).map((_, col) => <Skeleton key={col} width={`${100 / cols}%`} height={12} />)}
        </div>
      ))}
    </div>
  )
}

export function SkeletonDashboard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><Skeleton width="50%" height={12} /><Skeleton width={38} height={38} radius={10} /></div>
            <Skeleton width="40%" height={28} />
            <Skeleton width="30%" height={12} />
          </div>
        ))}
      </div>
      <SkeletonCard lines={4} />
      <SkeletonCard lines={2} />
    </div>
  )
}
