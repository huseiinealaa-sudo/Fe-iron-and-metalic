import { useMemo } from 'react'
import { useStore } from '../store/useStore'
import { chartFor, type ChartSpec } from './chartData'

const W = 480
const H = 250
const PAD = { top: 16, right: 16, bottom: 34, left: 46 }

function tickLabel(v: number, log: boolean | undefined): string {
  if (log) {
    const r = Math.round(v)
    return Math.abs(v - r) < 1e-6 ? `10${sup(r)}` : ''
  }
  const a = Math.abs(v)
  if (a >= 1000) return String(Math.round(v))
  if (a >= 10) return String(Math.round(v))
  if (a >= 1) return v.toFixed(1)
  return v.toFixed(2)
}

const SUPS: Record<string, string> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
}
function sup(n: number): string {
  return String(n).split('').map((c) => SUPS[c] ?? c).join('')
}

function ticks(min: number, max: number, log: boolean | undefined, count = 5): number[] {
  if (log) {
    const out: number[] = []
    for (let v = Math.ceil(min); v <= Math.floor(max); v++) out.push(v)
    return out.length > 1 ? out : [min, max]
  }
  const out: number[] = []
  for (let i = 0; i <= count; i++) out.push(min + ((max - min) * i) / count)
  return out
}

export function Chart() {
  const alloyId = useStore((s) => s.alloyId)
  const modeId = useStore((s) => s.modeId)
  const params = useStore((s) => s.params)
  const spec: ChartSpec = useMemo(() => chartFor(alloyId, modeId, params), [alloyId, modeId, params])

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const sx = (x: number) => PAD.left + ((x - spec.xMin) / (spec.xMax - spec.xMin || 1)) * plotW
  const sy = (y: number) => PAD.top + plotH - ((y - spec.yMin) / (spec.yMax - spec.yMin || 1)) * plotH
  const clampY = (y: number) => Math.max(PAD.top, Math.min(PAD.top + plotH, y))

  const path = (pts: Array<[number, number]>) =>
    pts
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(2)},${clampY(sy(y)).toFixed(2)}`)
      .join(' ')

  if (!spec.series.length) return null

  return (
    <div className="panel p-3 min-w-0 overflow-hidden" dir="rtl">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-steel-300">{spec.titleAr}</h3>
        <div className="flex gap-3 text-2xs flex-wrap justify-end min-w-0">
          {spec.series.map((s, i) => (
            <span key={i} className="flex items-center gap-1" style={{ color: s.color }}>
              <svg width="14" height="4" aria-hidden>
                <line x1="0" y1="2" x2="14" y2="2" stroke={s.color} strokeWidth="2"
                  strokeDasharray={s.dashed ? '3 2' : undefined} />
              </svg>
              {s.labelAr}
            </span>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ direction: 'ltr' }}
        role="img" aria-label={spec.titleAr}>
        {/* failure region */}
        {spec.failAboveY !== undefined && (
          <rect x={PAD.left} y={PAD.top} width={plotW} height={Math.max(0, sy(spec.failAboveY) - PAD.top)}
            fill="#d02f2f" opacity="0.08" />
        )}

        {/* grid and ticks */}
        {ticks(spec.xMin, spec.xMax, spec.xLog).map((t, i) => (
          <g key={`x${i}`}>
            <line x1={sx(t)} y1={PAD.top} x2={sx(t)} y2={PAD.top + plotH} stroke="#1a232e" strokeWidth="1" />
            <text x={sx(t)} y={H - 16} fontSize="9" fill="#5b6c7c" textAnchor="middle">
              {tickLabel(t, modeId === 'fatigue' || modeId === 'creep' || modeId === 'pitting' || modeId === 'igc')}
            </text>
          </g>
        ))}
        {ticks(spec.yMin, spec.yMax, false).map((t, i) => (
          <g key={`y${i}`}>
            <line x1={PAD.left} y1={sy(t)} x2={PAD.left + plotW} y2={sy(t)} stroke="#1a232e" strokeWidth="1" />
            <text x={PAD.left - 5} y={sy(t) + 3} fontSize="9" fill="#5b6c7c" textAnchor="end">
              {tickLabel(t, false)}
            </text>
          </g>
        ))}

        {/* guides */}
        {spec.guides.map((g, i) =>
          g.axis === 'y' ? (
            <g key={`g${i}`}>
              <line x1={PAD.left} y1={clampY(sy(g.value))} x2={PAD.left + plotW} y2={clampY(sy(g.value))}
                stroke={g.color ?? '#3a4856'} strokeWidth="1" strokeDasharray="4 3" />
              <text x={PAD.left + plotW - 2} y={clampY(sy(g.value)) - 3} fontSize="8.5"
                fill={g.color ?? '#5b6c7c'} textAnchor="end">{g.labelAr}</text>
            </g>
          ) : (
            <g key={`g${i}`}>
              <line x1={sx(g.value)} y1={PAD.top} x2={sx(g.value)} y2={PAD.top + plotH}
                stroke={g.color ?? '#3a4856'} strokeWidth="1" strokeDasharray="4 3" />
              <text x={sx(g.value) + 3} y={PAD.top + 9} fontSize="8.5"
                fill={g.color ?? '#5b6c7c'}>{g.labelAr}</text>
            </g>
          ),
        )}

        {/* series */}
        {spec.series.map((s, i) => (
          <path key={`s${i}`} d={path(s.points)} fill="none" stroke={s.color}
            strokeWidth={s.dashed ? 1.5 : 2.2} strokeDasharray={s.dashed ? '4 3' : undefined}
            strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {/* current state */}
        {spec.marker && (
          <g>
            <line x1={sx(spec.marker[0])} y1={PAD.top} x2={sx(spec.marker[0])} y2={PAD.top + plotH}
              stroke="#e9eef3" strokeWidth="0.8" opacity="0.35" />
            <circle cx={sx(spec.marker[0])} cy={clampY(sy(spec.marker[1]))} r="5"
              fill="#0d1117" stroke="#e9eef3" strokeWidth="2" />
          </g>
        )}

        {/* frame */}
        <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="none" stroke="#26323f" />
        <text x={PAD.left + plotW / 2} y={H - 3} fontSize="9" fill="#7c8fa0" textAnchor="middle">{spec.xLabel}</text>
        <text x={11} y={PAD.top + plotH / 2} fontSize="9" fill="#7c8fa0" textAnchor="middle"
          transform={`rotate(-90 11 ${PAD.top + plotH / 2})`}>{spec.yLabel}</text>
      </svg>

      {spec.noteAr && <p className="text-2xs text-steel-500 leading-relaxed mt-1">{spec.noteAr}</p>}
    </div>
  )
}
