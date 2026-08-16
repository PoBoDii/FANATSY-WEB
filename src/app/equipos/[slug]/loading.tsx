/**
 * Esqueleto propio del club: cabecera, pestañas y campo. Al tener su propio
 * límite de suspensión, la navegación desde la rejilla de equipos responde al
 * instante en vez de quedarse la pantalla anterior congelada.
 */
export default function Loading() {
  return (
    <div>
      <div className="border-line border-b px-6 pt-8 pb-6 lg:px-10">
        <div className="flex items-center gap-4">
          <div className="bg-panel-2 h-14 w-14 animate-pulse rounded-full" />
          <div className="flex-1">
            <div className="bg-panel-2 h-3 w-20 animate-pulse rounded" />
            <div className="bg-panel-2 mt-3 h-10 w-64 animate-pulse rounded" />
          </div>
        </div>
      </div>

      <div className="border-line flex gap-4 border-b px-6 py-3 lg:px-10">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-panel-2 h-6 w-28 animate-pulse rounded-full" />
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 p-4 lg:grid-cols-[minmax(0,480px)_minmax(0,360px)] lg:justify-center lg:p-6">
        <div className="bg-panel-2 h-[520px] animate-pulse rounded-2xl" />
        <div className="space-y-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="bg-panel-2 h-[58px] animate-pulse rounded-lg"
              style={{ animationDelay: `${i * 50}ms`, opacity: 1 - i * 0.08 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
