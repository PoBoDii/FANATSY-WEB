/** Mientras se compone la ficha (LaLiga + futbolfantasy). */
export default function Loading() {
  return (
    <div className="px-6 py-8 lg:px-10">
      <div className="flex items-center gap-5">
        <div className="bg-panel-2 h-24 w-24 animate-pulse rounded-xl" />
        <div className="flex-1">
          <div className="bg-panel-2 h-3 w-24 animate-pulse rounded" />
          <div className="bg-panel-2 mt-3 h-9 w-64 animate-pulse rounded" />
          <div className="bg-panel-2 mt-3 h-3 w-40 animate-pulse rounded" />
        </div>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-panel-2 h-20 animate-pulse rounded-lg" />
        ))}
      </div>
    </div>
  );
}
