/**
 * Esqueleto de carga. Aparece al instante al navegar, así que la web se siente
 * inmediata aunque el servidor todavía esté pidiendo datos.
 */
export default function Loading() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-14">
      <div className="bg-panel-2 h-3 w-32 animate-pulse rounded" />
      <div className="bg-panel-2 mt-4 h-12 w-72 animate-pulse rounded" />
      <div className="mt-10 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="bg-panel-2 h-14 animate-pulse rounded-lg"
            style={{ animationDelay: `${i * 60}ms`, opacity: 1 - i * 0.09 }}
          />
        ))}
      </div>
    </div>
  );
}
