import type { Forecast } from "@/lib/pronostico";

/**
 * Pronóstico 1X2 como barra de tres tramos. No son cuotas: es un modelo
 * propio, y conviene que se note, de ahí la nota al pie.
 */
export function MatchForecast({
  forecast,
  home,
  away,
  label,
}: {
  forecast: Forecast;
  home: { name: string; badge: string | null };
  away: { name: string; badge: string | null };
  label: string;
}) {
  const pct = (n: number) => Math.round(n * 100);
  const parts = [
    { key: "home", value: forecast.home, color: "#15803d", name: home.name, badge: home.badge },
    { key: "draw", value: forecast.draw, color: "#94a3b8", name: "Empate", badge: null },
    { key: "away", value: forecast.away, color: "#1d4ed8", name: away.name, badge: away.badge },
  ];

  return (
    <section className="border-line border-b bg-white px-6 py-5 lg:px-10">
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h2 className="flex items-center gap-2.5 text-[0.95rem] font-bold">
          <span className="bg-ink h-5 w-[4px] rounded-full" />
          Pronóstico
        </h2>
        <span className="bg-ink rounded-full px-2.5 py-1 text-[0.72rem] font-bold text-white">
          {label}
        </span>
      </div>

      {/* Barra proporcional */}
      <div className="border-line flex h-11 overflow-hidden rounded-lg border">
        {parts.map((part) => (
          <div
            key={part.key}
            className="flex items-center justify-center text-[0.85rem] font-bold text-white transition-all"
            style={{ width: `${pct(part.value)}%`, background: part.color }}
            title={`${part.name}: ${pct(part.value)}%`}
          >
            {pct(part.value) >= 12 ? `${pct(part.value)}%` : ""}
          </div>
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap justify-between gap-3">
        {parts.map((part) => (
          <span key={part.key} className="flex items-center gap-1.5 text-[0.78rem] font-semibold">
            <span className="h-3 w-3 rounded-sm" style={{ background: part.color }} />
            {part.badge && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={part.badge} alt="" width={16} height={16} className="object-contain" />
            )}
            {part.name}
            <span className="tnum text-muted">{pct(part.value)}%</span>
          </span>
        ))}
      </div>

      {/* Goles esperados y marcador más probable: lo que sale del modelo */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Box label="Goles esperados">
          <span className="tnum text-[1.05rem] font-bold">
            {forecast.expected.home.toFixed(2).replace(".", ",")} —{" "}
            {forecast.expected.away.toFixed(2).replace(".", ",")}
          </span>
        </Box>
        <Box label="Marcador más probable">
          <span className="tnum text-[1.05rem] font-bold">
            {forecast.scoreline.home}-{forecast.scoreline.away}
          </span>
          <span className="text-muted ml-2 text-[0.72rem]">
            {Math.round(forecast.scoreline.probability * 100)}%
          </span>
        </Box>
      </div>

      <p className="text-faint mt-3 text-[0.68rem] leading-relaxed">
        Modelo propio de Poisson con corrección de Dixon-Coles, a partir de{" "}
        {forecast.basis.join("; ")}. <strong>No son cuotas de apuestas</strong>: ninguna casa
        publica sus probabilidades en abierto de forma fiable.
      </p>
    </section>
  );
}

function Box({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-line min-w-[150px] flex-1 rounded-lg border bg-white px-3 py-2">
      <div className="label text-[0.55rem]">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
