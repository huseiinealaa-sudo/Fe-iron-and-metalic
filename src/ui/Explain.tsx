import { useState } from 'react'
import { alloyById } from '../data/alloys'
import { useStore } from '../store/useStore'
import { useTestState } from './useTestState'

const TABS = [
  { id: 'mechanism', labelAr: 'آلية الحدوث' },
  { id: 'appearance', labelAr: 'شكل الكسر' },
  { id: 'warning', labelAr: 'الإنذار' },
  { id: 'prevention', labelAr: 'الوقاية' },
] as const

type TabId = (typeof TABS)[number]['id']

export function Explain() {
  const [tab, setTab] = useState<TabId>('mechanism')
  const st = useTestState()
  const alloyId = useStore((s) => s.alloyId)
  const alloy = alloyById(alloyId)
  const m = st.mode

  const body =
    tab === 'mechanism' ? m.mechanismAr
      : tab === 'appearance' ? m.appearanceAr
      : tab === 'warning' ? m.warningAr
      : m.preventionAr

  return (
    <article className="panel p-3 flex flex-col gap-2 min-w-0 overflow-hidden">
      <header className="min-w-0">
        <h2 className="text-base font-bold text-steel-300">{m.nameAr}</h2>
        <span className="block text-2xs text-steel-600 ltr truncate">{m.term}</span>
      </header>

      <div role="tablist" className="flex gap-1 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-2.5 py-1.5 rounded-md text-2xs border transition-colors ${
              tab === t.id
                ? 'bg-accent/15 border-accent/50 text-accent'
                : 'bg-shell-850/60 border-shell-700/60 text-steel-500'
            }`}
            style={{ minHeight: 36 }}
          >
            {t.labelAr}
          </button>
        ))}
      </div>

      <p className="text-xs leading-7 text-steel-400">{body}</p>

      <div className="pt-2 border-t border-shell-700/50 min-w-0">
        <code className="ltr block text-2xs text-steel-500 bg-shell-950/70 rounded px-2 py-1.5 overflow-x-auto whitespace-pre">
          {m.formula}
        </code>
        <p className="text-2xs text-steel-500 mt-1 leading-relaxed">{m.formulaNoteAr}</p>
      </div>

      <div className="pt-2 border-t border-shell-700/50">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-xs font-semibold text-steel-300">
            <span className="ltr">{alloy.label}</span> — {alloy.structureAr}
          </h3>
          <span className="text-2xs text-steel-600 ltr">{alloy.en}</span>
        </div>
        <p className="text-2xs leading-relaxed text-steel-500 mt-1">{alloy.noteAr}</p>
      </div>
    </article>
  )
}
