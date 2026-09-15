import { ALLOYS, pren } from '../data/alloys'
import { useStore } from '../store/useStore'

export function AlloyPicker() {
  const alloyId = useStore((s) => s.alloyId)
  const setAlloy = useStore((s) => s.setAlloy)

  return (
    <div>
      <h2 className="text-2xs tracking-wide text-steel-500 mb-1.5 px-1">السبيكة</h2>
      <div className="flex flex-wrap gap-1.5">
        {ALLOYS.map((a) => {
          const active = a.id === alloyId
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setAlloy(a.id)}
              aria-current={active ? 'true' : undefined}
              title={`${a.en} — ${a.structureAr} — PREN ${pren(a).toFixed(1)}`}
              className={`chip ${
                active
                  ? 'bg-accent/15 border-accent/60 text-accent'
                  : 'bg-shell-850/60 border-shell-700/60 text-steel-400 hover:border-shell-600'
              }`}
            >
              <span className="ltr font-semibold">{a.label}</span>
              <span className="block text-2xs opacity-70">{a.structureAr}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
