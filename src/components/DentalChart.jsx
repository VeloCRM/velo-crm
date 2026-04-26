import { useState } from 'react'
import { C, makeBtn, card } from '../design'

const TOOTH_STATUS = {
  healthy:    { color: '#00ff88', bg: 'rgba(0,255,136,0.1)', label: 'Healthy' },
  cavity:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Cavity' },
  crown:      { color: '#00FFB2', bg: 'rgba(0,255,178,0.1)', label: 'Crown' },
  missing:    { color: '#64748b', bg: 'rgba(255,255,255,0.04)', label: 'Missing' },
  implant:    { color: '#7c3aed', bg: 'rgba(124,58,237,0.1)', label: 'Implant' },
  root_canal: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Root Canal' },
}

const UPPER_TEETH = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28]
const LOWER_TEETH = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38]

export default function DentalChart({ teeth, onUpdateTooth, onAddToTreatmentPlan, lang }) {
  const [selectedTooth, setSelectedTooth] = useState(null)
  const isRTL = lang === 'ar'

  const getStatus = (num) => teeth?.[num] || 'healthy'

  const ToothSVG = ({ num, x, y, isUpper }) => {
    const status = getStatus(num)
    const sc = TOOTH_STATUS[status]
    const isMolar = [16,17,18,26,27,28,36,37,38,46,47,48].includes(num)
    const isIncisor = [11,12,21,22,31,32,41,42].includes(num)
    const w = isMolar ? 28 : isIncisor ? 20 : 24
    const h = isMolar ? 30 : 26
    const selected = selectedTooth === num

    return (
      <g onClick={() => setSelectedTooth(selectedTooth === num ? null : num)} style={{ cursor: 'pointer' }}>
        <rect x={x - w/2} y={y - h/2} width={w} height={h} rx={6} ry={6}
          fill={sc.bg} stroke={selected ? '#1F2328' : sc.color} strokeWidth={selected ? 2.5 : 1.5}
          style={{ transition: 'all .15s' }} />
        {status === 'missing' && <line x1={x-w/3} y1={y-h/3} x2={x+w/3} y2={y+h/3} stroke={sc.color} strokeWidth={2} />}
        {status === 'crown' && <circle cx={x} cy={y} r={6} fill="none" stroke={sc.color} strokeWidth={1.5} />}
        {status === 'implant' && <><line x1={x} y1={y-6} x2={x} y2={y+6} stroke={sc.color} strokeWidth={2}/><line x1={x-4} y1={y+3} x2={x+4} y2={y+3} stroke={sc.color} strokeWidth={1.5}/></>}
        {status === 'root_canal' && <circle cx={x} cy={y} r={4} fill={sc.color} />}
        {status === 'cavity' && <circle cx={x} cy={isUpper ? y+3 : y-3} r={5} fill={sc.color} opacity={.5} />}
        <text x={x} y={isUpper ? y - h/2 - 6 : y + h/2 + 12} textAnchor="middle" fontSize={9} fill={C.textMuted} fontWeight={500}>{num}</text>
      </g>
    )
  }

  return (
    <div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {Object.entries(TOOTH_STATUS).map(([key, val]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
            <div style={{ width: 14, height: 14, borderRadius: 4, background: val.bg, border: `1.5px solid ${val.color}` }} />
            <span style={{ color: C.textSec }}>{val.label}</span>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ ...card, padding: 24, textAlign: 'center' }}>
        <svg viewBox="0 0 560 240" style={{ width: '100%', maxWidth: 560, margin: '0 auto', display: 'block' }}>
          {/* Center line */}
          <line x1="280" y1="0" x2="280" y2="240" stroke={C.border} strokeDasharray="4 4" />
          <text x="280" y="118" textAnchor="middle" fontSize="10" fill={C.textMuted}>{isRTL ? 'خط الوسط' : 'Midline'}</text>

          {/* Upper teeth */}
          {UPPER_TEETH.map((num, i) => (
            <ToothSVG key={num} num={num} x={35 + i * 32} y={40} isUpper={true} />
          ))}

          {/* Lower teeth */}
          {LOWER_TEETH.map((num, i) => (
            <ToothSVG key={num} num={num} x={35 + i * 32} y={195} isUpper={false} />
          ))}

          {/* Labels */}
          <text x="140" y="90" textAnchor="middle" fontSize="10" fill={C.textMuted} fontWeight={600}>{isRTL ? 'يمين علوي' : 'Upper Right'}</text>
          <text x="420" y="90" textAnchor="middle" fontSize="10" fill={C.textMuted} fontWeight={600}>{isRTL ? 'يسار علوي' : 'Upper Left'}</text>
          <text x="140" y="160" textAnchor="middle" fontSize="10" fill={C.textMuted} fontWeight={600}>{isRTL ? 'يمين سفلي' : 'Lower Right'}</text>
          <text x="420" y="160" textAnchor="middle" fontSize="10" fill={C.textMuted} fontWeight={600}>{isRTL ? 'يسار سفلي' : 'Lower Left'}</text>
        </svg>
      </div>

      {/* Selected tooth controls */}
      {selectedTooth && (
        <div style={{ ...card, padding: 16, marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
            {isRTL ? `سن رقم ${selectedTooth}` : `Tooth #${selectedTooth}`}:
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(TOOTH_STATUS).map(([key, val]) => (
              <button type="button" key={key} onClick={(e) => { e.preventDefault(); onUpdateTooth(selectedTooth, key) }}
                style={{
                  padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  border: getStatus(selectedTooth) === key ? `2px solid ${val.color}` : `1px solid ${C.border}`,
                  background: getStatus(selectedTooth) === key ? val.bg : C.white, color: val.color,
                  minHeight: 32,
                }}>
                {val.label}
              </button>
            ))}
          </div>
          {/* "Add to Treatment Plan" only shows when the tooth has a non-healthy
              diagnosis AND the parent has wired up the handler. */}
          {onAddToTreatmentPlan && getStatus(selectedTooth) !== 'healthy' && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                onAddToTreatmentPlan(selectedTooth, getStatus(selectedTooth))
                setSelectedTooth(null)
              }}
              style={{
                ...makeBtn('primary', { fontSize: 11, gap: 4 }),
                marginLeft: 'auto',
                minHeight: 32,
              }}>
              {isRTL ? '+ إضافة لخطة العلاج' : '+ Add to Treatment Plan'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
