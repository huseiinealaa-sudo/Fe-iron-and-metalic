import { Scene } from './three/Scene'
import { AlloyPicker } from './ui/AlloyPicker'
import { Chart } from './ui/Chart'
import { Controls } from './ui/Controls'
import { Explain } from './ui/Explain'
import { Header } from './ui/Header'
import { ModeRail } from './ui/ModeRail'
import { Readouts } from './ui/Readouts'

/**
 * Three regions: the mode rail, the 3D view, and the reading panels.
 *
 * Below 1024px they stack. At 1024px the panels move under the view. At 1280px
 * they take their own column. Both iPad Pro orientations are covered by the
 * first two breakpoints.
 */
export function App() {
  return (
    <div dir="rtl" className="h-full flex flex-col bg-shell-950">
      <Header />

      <div
        className="
          flex-1 min-h-0 overflow-y-auto lg:overflow-hidden
          grid grid-cols-1 gap-3 p-3
          lg:grid-cols-[250px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)_auto]
          xl:grid-cols-[250px_minmax(0,1fr)_370px] xl:grid-rows-[minmax(0,1fr)]
        "
        style={{ paddingBottom: 'calc(0.75rem + var(--safe-b))' }}
      >
        {/* ------------------------------------------------ mode rail */}
        <aside className="lg:row-span-2 xl:row-span-1 lg:overflow-y-auto flex flex-col gap-3 pl-1">
          <AlloyPicker />
          <ModeRail />
        </aside>

        {/* ------------------------------------------------ 3D view */}
        <main className="relative min-h-0 flex flex-col gap-3">
          <div className="relative rounded-xl overflow-hidden border border-shell-700/60 bg-shell-950 h-[46vh] lg:h-auto lg:flex-1 min-h-[260px]">
            <Scene />
            <p className="absolute top-2 left-2 text-2xs text-steel-600 pointer-events-none select-none">
              اسحب للدوران · قرّص للتقريب
            </p>
          </div>
          <div className="xl:absolute xl:bottom-3 xl:right-3 xl:w-[320px] xl:z-10">
            <Controls />
          </div>
        </main>

        {/* ------------------------------------------------ reading panels */}
        <section
          className="
            flex flex-col gap-3
            lg:col-start-2 lg:row-start-2 lg:flex-row lg:flex-wrap lg:items-start
            xl:col-start-3 xl:row-start-1 xl:flex-nowrap xl:flex-col xl:overflow-y-auto
          "
        >
          <div className="lg:basis-[320px] lg:grow xl:basis-auto min-w-0"><Readouts /></div>
          <div className="lg:basis-[320px] lg:grow xl:basis-auto min-w-0"><Chart /></div>
          <div className="lg:basis-[320px] lg:grow xl:basis-auto min-w-0"><Explain /></div>
        </section>
      </div>
    </div>
  )
}
