/** Mientras se piden los dos onces a futbolfantasy. */
export default function Loading() {
  return (
    <div className="p-4 lg:p-6">
      <div className="bg-panel-2 h-4 w-40 animate-pulse rounded" />
      <div className="bg-panel-2 mt-4 h-10 w-80 animate-pulse rounded" />
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="border-line overflow-hidden rounded-xl border">
            <div className="bg-panel-2 h-14 animate-pulse" />
            <div
              className="h-[420px] animate-pulse"
              style={{ background: "linear-gradient(180deg,#3d8a5e,#357c53)" }}
            />
          </div>
        ))}
      </div>
      <p className="text-faint mt-4 text-center text-sm">Cargando alineaciones probables…</p>
    </div>
  );
}
