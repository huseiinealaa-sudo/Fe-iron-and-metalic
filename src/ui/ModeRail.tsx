import { MODES } from '../data/modes'
import { useStore } from '../store/useStore'

const FAMILY_LABEL: Record<string, string> = {
  mechanical: 'أحمال ميكانيكية',
  environmental: 'عطب بيئي وكهروكيميائي',
}

export function ModeRail() {
  const modeId = useStore((s) => s.modeId)
  const setMode = useStore((s) => s.setMode)

  return (
    <nav className="flex flex-col gap-3" aria-label="أنماط الفشل">
      {(['mechanical', 'environmental'] as const).map((family) => (
        <section key={family}>
          <h2 className="text-2xs tracking-wide text-steel-500 mb-1.5 px-1">{FAMILY_LABEL[family]}</h2>
          <ul className="flex flex-col gap-1.5">
            {MODES.filter((m) => m.family === family).map((m) => {
              const active = m.id === modeId
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setMode(m.id)}
                    data-mode={m.id}
                    aria-current={active ? 'true' : undefined}
                    className={`w-full text-right rounded-lg px-3 py-2 border transition-colors ${
                      active
                        ? 'bg-accent/15 border-accent/60'
                        : 'bg-shell-850/60 border-shell-700/60 hover:border-shell-600'
                    }`}
                    style={{ minHeight: 44 }}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-sm font-semibold ${active ? 'text-accent' : 'text-steel-300'}`}>
                        {m.nameAr}
                      </span>
                      <span className="text-2xs text-steel-600 ltr">{m.term}</span>
                    </div>
                    <p className="text-2xs text-steel-500 mt-0.5 leading-snug">{m.taglineAr}</p>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </nav>
  )
}
