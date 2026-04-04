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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
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

export function SkeletonContacts() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Skeleton width={200} height={32} radius={8} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Skeleton width={120} height={36} radius={8} />
          <Skeleton width={120} height={36} radius={8} />
        </div>
      </div>
      <SkeletonTable rows={8} cols={6} />
    </div>
  )
}

export function SkeletonPipeline() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} width={80} height={32} radius={8} />)}
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Skeleton width="100%" height={40} radius={8} />
            {Array.from({ length: 3 - col }).map((_, j) => (
              <SkeletonCard key={j} lines={2} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonInbox() {
  return (
    <div style={{ display: 'flex', gap: 0, background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', minHeight: 500 }}>
      <div style={{ width: 340, borderRight: `1px solid ${C.border}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Skeleton width="100%" height={36} radius={8} />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: 10 }}>
            <Skeleton width={40} height={40} radius={20} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Skeleton width="70%" height={13} />
              <Skeleton width="90%" height={10} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Skeleton width="40%" height={20} />
        <Skeleton width="100%" height={1} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, justifyContent: i % 2 === 0 ? 'flex-start' : 'flex-end' }}>
            <Skeleton width="60%" height={48} radius={12} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonCalendar() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Skeleton width={200} height={28} radius={8} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Skeleton width={160} height={36} radius={8} />
          <Skeleton width={100} height={36} radius={8} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0 }}>
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} style={{ padding: 8, textAlign: 'center', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                  <Skeleton width={30} height={12} style={{ margin: '0 auto' }} />
                </div>
              ))}
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} style={{ minHeight: 70, padding: 6, borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}` }}>
                  <Skeleton width={20} height={14} radius={10} />
                  {i % 5 === 0 && <Skeleton width="80%" height={8} radius={3} style={{ marginTop: 4 }} />}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ width: 260 }}>
          <SkeletonCard lines={4} />
        </div>
      </div>
    </div>
  )
}

export function SkeletonGeneric() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><Skeleton width={200} height={24} radius={6} /><Skeleton width={300} height={14} radius={6} style={{ marginTop: 8 }} /></div>
        <Skeleton width={120} height={36} radius={8} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} lines={2} />)}
      </div>
    </div>
  )
}
