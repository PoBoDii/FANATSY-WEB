"use client";

import { useState } from "react";
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

  const [how, setHow] = useState(false);

  return (
    <section className="border-line border-b bg-panel px-3.5 py-4 sm:px-6 sm:py-5 lg:px-10">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <h2 className="text-[0.95rem] font-semibold">Pronóstico</h2>
        <span className="bg-panel-2 text-muted rounded-full px-2.5 py-1 text-[0.72rem] font-semibold">
          {label}
        </span>
      </div>

      {/* Barra proporcional */}
      <div className="flex h-10 overflow-hidden rounded-xl">
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

      {/* La explicación del modelo ocupaba cuatro líneas en el móvil delante de
          lo que se venía a ver. Queda a un toque. */}
      <button
        type="button"
        onClick={() => setHow((v) => !v)}
        className="text-faint hover:text-muted mt-2.5 cursor-pointer text-[0.7rem] underline underline-offset-2"
      >
        {how ? "Ocultar cómo se calcula" : "Cómo se calcula"}
      </button>

      {how && (
        <p className="text-faint mt-2 text-[0.7rem] leading-relaxed">
          Modelo propio de Poisson con corrección de Dixon-Coles, a partir de{" "}
          {forecast.basis.join("; ")}. <strong>No son cuotas de apuestas</strong>: ninguna casa
          publica sus probabilidades en abierto de forma fiable.
        </p>
      )}
    </section>
  );
}

function Box({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-panel-2 min-w-[140px] flex-1 rounded-xl px-3 py-2">
      <div className="label text-[0.55rem]">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
