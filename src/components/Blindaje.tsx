"use client";

import { useState } from "react";
import { money } from "@/lib/format";

/**
 * Lo que llevas gastado blindando a un jugador.
 *
 * Es el único dato del historial que no aparece en ningún sitio: el feed de la
 * liga no publica las subidas de cláusula, así que se apunta a mano. A cambio
 * es un número que ya conoces, porque acabas de pagarlo.
 */
export function Blindaje({ playerId, gastado }: { playerId: string; gastado: number }) {
  const [valor, setValor] = useState(gastado ? String(gastado / 1_000_000) : "");
  const [estado, setEstado] = useState<"limpio" | "guardando" | "guardado" | "error">("limpio");

  const millones = Number(valor.replace(",", ".")) || 0;

  async function guardar() {
    setEstado("guardando");
    const respuesta = await fetch("/api/blindaje", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, gastado: Math.round(millones * 1_000_000) }),
    }).catch(() => null);

    setEstado(respuesta?.ok ? "guardado" : "error");
  }

  return (
    <div className="flex items-center gap-2">
      <label className="bg-panel-2 flex items-baseline gap-1 rounded-xl px-2.5 py-1.5">
        <span className="text-faint text-[0.66rem] font-semibold tracking-wide uppercase">
          Blindaje
        </span>
        <input
          type="number"
          step="0.5"
          inputMode="decimal"
          value={valor}
          onChange={(event) => {
            setValor(event.target.value);
            setEstado("limpio");
          }}
          placeholder="0"
          className="tnum text-ink w-14 bg-transparent text-[0.9rem] font-semibold outline-none"
        />
        <span className="text-faint text-[0.72rem]">M€</span>
      </label>

      {/* Cada millón gastado sube dos de cláusula: se dice aquí para no tener
          que hacer la cuenta cada vez. */}
      {millones > 0 && (
        <span className="text-faint hidden text-[0.72rem] sm:inline">
          = {money(millones * 2_000_000)} de cláusula
        </span>
      )}

      <button
        type="button"
        onClick={guardar}
        disabled={estado === "guardando"}
        className={`shrink-0 cursor-pointer rounded-xl px-2.5 py-1.5 text-[0.75rem] font-semibold transition-colors ${
          estado === "guardado"
            ? "bg-up/15 text-up"
            : estado === "error"
              ? "bg-down/15 text-down"
              : "bg-panel-2 text-muted hover:text-ink"
        }`}
      >
        {estado === "guardando"
          ? "…"
          : estado === "guardado"
            ? "✓"
            : estado === "error"
              ? "Falló"
              : "Guardar"}
      </button>
    </div>
  );
}
