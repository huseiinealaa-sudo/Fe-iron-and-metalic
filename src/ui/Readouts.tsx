import { useStore } from '../store/useStore'
import { useTestState } from './useTestState'

const TONE_CLASS: Record<string, string> = {
  ok: 'text-stress-ok',
  warn: 'text-stress-warn',
  fail: 'text-stress-fail',
  info: 'text-steel-500',
}

export function Readouts() {
  const st = useTestState()
  const showStress = useStore((s) => s.showStress)

  return (
    <div className="panel p-3 flex flex-col gap-2 min-w-0 overflow-hidden">
      {/* stage banner */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${
            st.stageTone === 'fail' ? 'bg-stress-fail'
              : st.stageTone === 'warn' ? 'bg-stress-warn'
              : st.stageTone === 'ok' ? 'bg-stress-ok' : 'bg-steel-600'
          }`}
        />
        <span className={`text-sm font-semibold ${TONE_CLASS[st.stageTone]}`}>{st.stageAr}</span>
      </div>

      {/* progress toward failure */}
      <div>
        <div className="flex justify-between text-2xs text-steel-500 mb-1">
          <span>التقدّم نحو الفشل</span>
          <span className="ltr tabular-nums">{Math.round(st.progress * 100)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-shell-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-150 ${
              st.progress > 0.85 ? 'bg-stress-fail' : st.progress > 0.5 ? 'bg-stress-warn' : 'bg-stress-ok'
            }`}
            style={{ width: `${Math.min(100, st.progress * 100)}%` }}
          />
        </div>
      </div>

      <p className="text-xs leading-relaxed text-steel-400 border-r-2 border-accent/50 pr-2">
        {st.verdictAr}
      </p>

      <dl className="grid grid-cols-1 gap-y-1 pt-1 border-t border-shell-700/50">
        {st.readouts.map((r, i) => (
          <div key={i} className="flex items-baseline justify-between gap-1 min-w-0">
            <dt className="text-2xs text-steel-500 min-w-0">{r.labelAr}</dt>
            <dd className={`ltr text-xs tabular-nums whitespace-nowrap ${TONE_CLASS[r.tone ?? 'ok'] ?? ''}`}>
              {r.value}
              {r.unit ? <span className="text-steel-600"> {r.unit}</span> : null}
            </dd>
          </div>
        ))}
      </dl>

      {showStress && st.mode.family === 'mechanical' && <StressLegend />}
    </div>
  )
}

function StressLegend() {
  return (
    <div className="pt-1 border-t border-shell-700/50">
      <div className="flex items-center gap-2">
        <span className="text-2xs text-steel-500 whitespace-nowrap">خريطة الإجهاد</span>
        <div
          className="h-2 flex-1 rounded-full"
          style={{
            background:
              'linear-gradient(to left, #2f6fd0 0%, #2fa36b 35%, #d8a52a 62%, #e0642a 82%, #d02f2f 100%)',
          }}
        />
      </div>
      <div className="flex justify-between text-2xs text-steel-600 mt-0.5">
        <span>منخفض</span>
        <span>عند الحدّ</span>
      </div>
    </div>
  )
}
