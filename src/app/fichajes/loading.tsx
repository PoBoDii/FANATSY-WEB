/** Esqueleto de la lista de operaciones mientras se calcula. */
export default function Loading() {
  return (
    <div className="px-4 py-8 lg:px-10 lg:py-12">
      <div className="bg-panel-2 h-3 w-24 animate-pulse rounded" />
      <div className="bg-panel-2 mt-3 h-10 w-56 animate-pulse rounded" />
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-panel-2 h-20 animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="mt-6 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="bg-panel-2 h-[76px] animate-pulse rounded-2xl"
            style={{ animationDelay: `${i * 60}ms`, opacity: 1 - i * 0.09 }}
          />
        ))}
      </div>
    </div>
  );
}
