"use client";

import Link from "next/link";
import { useState } from "react";
import { money } from "@/lib/format";
import { PlayerAvatar, PositionTag, PricePill } from "@/components/ui";
import type { Player } from "@/lib/normalize";

export type FilaPrecio = {
  player: Player;
  /** Lo que ha subido o bajado hoy, que es lo que mueve el precio de mañana. */
  diff: number | null;
  valor: number;
  clausula: number;
  /** Lo que pediría la fórmula si no tocas nada. */
  calculadoSalida: number;
  calculadoMinimo: number;
  /** Lo que has fijado tú, si has fijado algo. */
  salida: number | null;
  minimo: number | null;
  nota: string | null;
};

/**
 * Los precios con los que el bot negocia cada jugador.
 *
 * La fórmula funciona para el caso general, pero hay cosas que sólo sabes tú:
 * al que fichaste ayer no lo sueltas ni por el doble, y del que quieres quitarte
 * de encima aceptas menos de lo que dice el cálculo. Aquí se fija a mano y lo
 * que pongas manda.
 *
 * Dejar las dos casillas vacías vuelve a lo calculado, que es lo que se ve en
 * gris debajo.
 */
export function PreciosVenta({ filas }: { filas: FilaPrecio[] }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
      {filas.map((fila) => (
        <Fila key={fila.player.id} fila={fila} />
      ))}
    </div>
  );
}

function Fila({ fila }: { fila: FilaPrecio }) {
  const [salida, setSalida] = useState(aTexto(fila.salida));
  const [minimo, setMinimo] = useState(aTexto(fila.minimo));
  const [estado, setEstado] = useState<"limpio" | "guardando" | "guardado" | "error">("limpio");

  const aMano = Boolean(fila.salida || fila.minimo);

  async function guardar() {
    setEstado("guardando");
    const respuesta = await fetch("/api/precios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: fila.player.id,
        salida: aMillones(salida),
        minimo: aMillones(minimo),
      }),
    }).catch(() => null);

    setEstado(respuesta?.ok ? "guardado" : "error");
  }

  return (
    <div
      className={`bg-panel rounded-2xl border p-3 ${
        aMano ? "border-acid/40" : "border-line"
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Foto y nombre llevan a su ficha: desde aquí es donde dan ganas de ir
            a mirarle los partidos antes de decidir por cuánto lo sueltas. */}
        <Link href={`/jugador/${fila.player.id}`} className="shrink-0">
          <PlayerAvatar player={fila.player} size={44} />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <PositionTag position={fila.player.position} size="sm" />
            <Link
              href={`/jugador/${fila.player.id}`}
              className="hover:text-acid truncate font-semibold"
            >
              {fila.player.name}
            </Link>
            <PricePill diff={fila.diff} />
          </div>
          <p className="text-faint text-[0.72rem]">
            Vale {money(fila.valor)} · cláusula {money(fila.clausula)}
          </p>
        </div>

        <button
          type="button"
          onClick={guardar}
          disabled={estado === "guardando"}
          className={`shrink-0 cursor-pointer rounded-xl px-3 py-1.5 text-[0.78rem] font-semibold transition-colors ${
            estado === "guardado"
              ? "bg-up/15 text-up"
              : estado === "error"
                ? "bg-down/15 text-down"
                : "bg-acid text-white"
          }`}
        >
          {estado === "guardando"
            ? "…"
            : estado === "guardado"
              ? "Guardado"
              : estado === "error"
                ? "Falló"
                : "Guardar"}
        </button>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <Casilla
          etiqueta="Empieza pidiendo"
          calculado={fila.calculadoSalida}
          valor={salida}
          onChange={(v) => {
            setSalida(v);
            setEstado("limpio");
          }}
        />
        <Casilla
          etiqueta="No bajo de"
          calculado={fila.calculadoMinimo}
          valor={minimo}
          onChange={(v) => {
            setMinimo(v);
            setEstado("limpio");
          }}
        />
      </div>
    </div>
  );
}

/** Una casilla en millones, que es como se habla de dinero en el grupo. */
function Casilla({
  etiqueta,
  calculado,
  valor,
  onChange,
}: {
  etiqueta: string;
  calculado: number;
  valor: string;
  onChange: (valor: string) => void;
}) {
  return (
    <label className="bg-panel-2 block rounded-xl px-2.5 py-1.5">
      <span className="text-faint block text-[0.66rem] font-semibold tracking-wide uppercase">
        {etiqueta}
      </span>
      <span className="flex items-baseline gap-1">
        <input
          type="number"
          step="0.5"
          inputMode="decimal"
          value={valor}
          onChange={(event) => onChange(event.target.value)}
          placeholder={(calculado / 1_000_000).toFixed(1)}
          className="tnum text-ink w-full min-w-0 bg-transparent text-[0.95rem] font-semibold outline-none"
        />
        <span className="text-faint text-[0.72rem]">M€</span>
      </span>
    </label>
  );
}

const aTexto = (valor: number | null) => (valor ? String(valor / 1_000_000) : "");

/** "121,5" y "121.5" son lo mismo; vacío significa «usa el cálculo». */
function aMillones(texto: string): number | null {
  const limpio = texto.replace(",", ".").trim();
  if (!limpio) return null;
  const numero = Number(limpio);
  return Number.isFinite(numero) && numero > 0 ? Math.round(numero * 1_000_000) : null;
}
