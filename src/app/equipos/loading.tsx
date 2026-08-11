/** Rejilla de escudos en gris mientras se piden los calendarios. */
export default function Loading() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-14">
      <div className="bg-panel-2 h-3 w-24 animate-pulse rounded" />
      <div className="bg-panel-2 mt-4 h-12 w-56 animate-pulse rounded" />
      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="bg-panel-2 h-[148px] animate-pulse rounded-xl"
            style={{ animationDelay: `${i * 30}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
