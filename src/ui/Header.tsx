export function Header() {
  return (
    <header className="shrink-0 border-b border-shell-700/60 bg-shell-900/80 backdrop-blur-sm">
      <div className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-accent font-bold text-lg ltr">Fe</span>
          <h1 className="text-sm font-bold text-steel-300 truncate">
            كيف يفشل الفولاذ غير القابل للصدأ
          </h1>
          <span className="text-2xs text-steel-600 hidden sm:inline">
            مخطّط تفاعلي ثلاثي الأبعاد
          </span>
        </div>
        <p className="text-2xs text-steel-500 leading-snug max-w-[46ch]">
          هذا المعدن نادرًا ما يفشل لأن الحمل تجاوز متانته. يفشل لأن طبقة أوكسيد الكروم التي
          تحميه هُزمت — أو لأن الزمن والحرارة والدورات فعلت ما عجز عنه الحمل.
        </p>
      </div>
    </header>
  )
}
