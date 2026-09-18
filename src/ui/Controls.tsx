import { useEffect, useRef } from 'react'
import { alloyById } from '../data/alloys'
import { modeById, type Driver } from '../data/modes'
import { resolveDriver } from '../engine/params'
import { useStore } from '../store/useStore'

function formatDriver(d: Driver, raw: number): string {
  const v = d.log ? Math.pow(10, raw) : raw
  if (d.key === 'drive') return `${Math.round(raw * 100)}%`
  if (d.key === 'stressFrac') return `${Math.round(v * 100)}%`
  if (d.log) {
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
    if (v >= 1e4) return `${(v / 1e3).toFixed(0)}k`
    if (v >= 100) return v.toFixed(0)
    if (v >= 1) return v.toFixed(1)
    return v.toFixed(2)
  }
  return Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2)
}

function Slider({ driver, big }: { driver: Driver; big?: boolean }) {
  const value = useStore((s) => s.params[driver.key])
  const setParam = useStore((s) => s.setParam)
  const fill = ((value - driver.min) / (driver.max - driver.min || 1)) * 100

  return (
    <label className="block">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`${big ? 'text-sm font-semibold text-steel-300' : 'text-xs text-steel-400'}`}>
          {driver.labelAr}
        </span>
        <span className="ltr text-xs tabular-nums text-accent">
          {formatDriver(driver, value)}
          {driver.unit ? <span className="text-steel-500"> {driver.unit}</span> : null}
        </span>
      </div>
      <input
        type="range"
        min={driver.min}
        max={driver.max}
        step={driver.step}
        value={value}
        onChange={(e) => setParam(driver.key, Number(e.target.value))}
        style={{ ['--fill' as string]: `${fill}%` }}
        aria-label={driver.labelAr}
      />
    </label>
  )
}

/** Sweeps the primary driver so the failure plays out on its own. */
function useAutoPlay() {
  const playing = useStore((s) => s.playing)
  const modeId = useStore((s) => s.modeId)
  const raf = useRef(0)
  const last = useRef(0)

  useEffect(() => {
    if (!playing) return
    const mode = modeById(modeId)
    const d = resolveDriver(mode.primary, alloyById(useStore.getState().alloyId), mode.id)
    last.current = performance.now()
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last.current) / 1000)
      last.current = now
      const s = useStore.getState()
      const span = d.max - d.min
      // Eight seconds from untouched to broken, whatever the units are.
      const next = s.params[d.key] + (span / 8) * dt
      if (next >= d.max) {
        s.setParam(d.key, d.max)
        s.setPlaying(false)
        return
      }
      s.setParam(d.key, next)
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, modeId])
}

export function Controls() {
  const modeId = useStore((s) => s.modeId)
  const alloyId = useStore((s) => s.alloyId)
  const playing = useStore((s) => s.playing)
  const setPlaying = useStore((s) => s.setPlaying)
  const resetDrive = useStore((s) => s.resetDrive)
  const showStress = useStore((s) => s.showStress)
  const toggleStress = useStore((s) => s.toggleStress)
  const sectioned = useStore((s) => s.sectioned)
  const toggleSection = useStore((s) => s.toggleSection)
  const mode = modeById(modeId)
  const alloy = alloyById(alloyId)
  useAutoPlay()

  return (
    <div className="panel p-3 flex flex-col gap-2">
      <Slider driver={resolveDriver(mode.primary, alloy, mode.id)} big />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPlaying(!playing)}
          className={`chip flex-1 text-center font-semibold ${
            playing ? 'bg-stress-fail/20 border-stress-fail/60 text-stress-fail'
                    : 'bg-accent/15 border-accent/60 text-accent'
          }`}
        >
          {playing ? '⏸ إيقاف' : '▶ شغّل الاختبار'}
        </button>
        <button
          type="button"
          onClick={resetDrive}
          className="chip bg-shell-850/60 border-shell-700/60 text-steel-400"
        >
          ↺ صفّر
        </button>
      </div>

      {mode.secondary.length > 0 && (
        <div className="flex flex-col gap-1 pt-1 border-t border-shell-700/50">
          {mode.secondary.map((d) => <Slider key={d.key} driver={resolveDriver(d, alloy, mode.id)} />)}
        </div>
      )}

      <div className="flex gap-2 pt-1 border-t border-shell-700/50">
        <button
          type="button"
          onClick={toggleStress}
          aria-pressed={showStress}
          className={`chip flex-1 text-center text-xs ${
            showStress ? 'bg-shell-800 border-shell-600 text-steel-300'
                       : 'bg-shell-850/60 border-shell-700/60 text-steel-500'
          }`}
        >
          خريطة الإجهاد
        </button>
        <button
          type="button"
          onClick={toggleSection}
          aria-pressed={sectioned}
          className={`chip flex-1 text-center text-xs ${
            sectioned ? 'bg-shell-800 border-shell-600 text-steel-300'
                      : 'bg-shell-850/60 border-shell-700/60 text-steel-500'
          }`}
        >
          مقطع طولي
        </button>
      </div>
    </div>
  )
}
