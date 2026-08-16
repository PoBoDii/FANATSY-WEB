"use client";

import { useMemo, useState } from "react";
import { PlayerCard, type CardData } from "./PlayerCard";
import { positionColor } from "./ui";
import { POSITION_LABEL, type Position } from "@/lib/normalize";

/**
 * Lista de plantilla con sus filtros y su orden **en el navegador**.
 *
 * Antes cada pastilla era un enlace: se volvía al servidor, se recalculaba la
 * liga entera, se releía futbolfantasy y llegaban cientos de kilobytes para
 * enseñar los mismos veinticuatro jugadores en otro orden. En el móvil eso era
 * un segundo largo de espera por cada toque.
 *
 * Los datos ya están aquí —`CardData` es plano y pesa poco—, así que filtrar y
 * ordenar es cosa de la propia página: instantáneo y sin una sola petición.
 */

type Sort = "posicion" | "prob" | "puntos" | "media" | "valor" | "cambio" | "clausula" | "margen";

/**
 * Puesto primero por ser el orden de entrada —es raro que la opción activa por
 * defecto salga la tercera—, y detrás cláusula y cambio de valor, que son las
 * dos que más se pulsan.
 */
const SORTS: { key: Sort; label: string }[] = [
  { key: "posicion", label: "Posición" },
  { key: "clausula", label: "Cláusula" },
  { key: "cambio", label: "Cambio de valor" },
  { key: "prob", label: "Juega" },
  { key: "puntos", label: "Puntos" },
  { key: "media", label: "Media" },
  { key: "valor", label: "Valor" },
  { key: "margen", label: "Dif. valor-cláusula" },
];

const POSITIONS: Position[] = ["PT", "DF", "MC", "DL"];

/** Las siglas del juego, para que el filtro diga lo mismo que las etiquetas. */
const POSITION_SHORT: Record<string, string> = {
  PT: "POR",
  DF: "DEF",
  MC: "CEN",
  DL: "DEL",
};

/** Orden natural de un once: portería, defensa, medio, delantera. */
const RANK: Record<string, number> = { PT: 0, DF: 1, MC: 2, DL: 3, EN: 4, "?": 5 };

const chip = (active: boolean) =>
  `inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.78rem] transition-colors ${
    active ? "bg-ink text-void font-semibold" : "bg-panel-2 text-muted hover:text-ink"
  }`;

export function SquadBrowser({
  cards,
  leagueId,
  emptyHint,
}: {
  cards: CardData[];
  leagueId: string;
  emptyHint?: string;
}) {
  const [sort, setSort] = useState<Sort>("posicion");
  // Ordenar por puesto agrupa; el resto de criterios sale en una lista seguida.
  const [desc, setDesc] = useState(true);
  const [positions, setPositions] = useState<Set<string>>(new Set());
  const [openOnly, setOpenOnly] = useState(false);

  const rows = useMemo(() => {
    const visible = cards.filter(
      (c) =>
        (positions.size === 0 || positions.has(c.position)) && (!openOnly || c.clauseOpen),
    );

    // Cada criterio se define en su orden natural y `desc` lo invierte, para
    // que todos se comporten igual al pulsarlos dos veces.
    const margin = (c: CardData) => (c.clause ? c.clause - c.value : Number.POSITIVE_INFINITY);
    const unlock = (c: CardData) =>
      !c.clause
        ? Number.POSITIVE_INFINITY
        : c.clauseOpen || !c.unlockAt
          ? 0
          : new Date(c.unlockAt).getTime();

    const compare = (a: CardData, b: CardData) => {
      switch (sort) {
        case "prob":
          return (b.probability ?? -1) - (a.probability ?? -1);
        case "puntos":
          return b.points - a.points;
        case "media":
          return b.average - a.average;
        case "valor":
          return b.value - a.value;
        case "cambio":
          return (b.diff ?? 0) - (a.diff ?? 0);
        case "clausula":
          return unlock(b) - unlock(a) || b.value - a.value;
        case "margen":
          return margin(b) - margin(a);
        default:
          return RANK[a.position] - RANK[b.position] || b.value - a.value;
      }
    };

    const sorted = [...visible].sort(compare);
    // "Posición" y "cláusula" se leen al revés que las cifras: de portero a
    // delantero y de la que antes se abre a la que más tarda.
    const natural = sort === "posicion" || sort === "clausula";
    return desc === natural ? sorted : sorted.reverse();
  }, [cards, sort, desc, positions, openOnly]);

  /**
   * Se agrupa por línea mientras no haya nada elegido. En cuanto se filtra o se
   * ordena por otra cosa, la lista pasa a una columna: lo que se busca entonces
   * es un ranking, y los bloques por puesto lo romperían.
   */
  const grouped = sort === "posicion" && positions.size === 0 && !openOnly;

  const toggle = (position: string) => {
    const next = new Set(positions);
    if (next.has(position)) next.delete(position);
    else next.add(position);
    setPositions(next);
  };

  return (
    <>
      <div className="border-line flex gap-1.5 overflow-x-auto border-b px-3.5 py-2.5 sm:px-5 lg:px-6">
        {POSITIONS.map((position) => {
          const on = positions.has(position);
          return (
            <button
              key={position}
              type="button"
              onClick={() => toggle(position)}
              className={`shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-[0.78rem] font-semibold transition-colors ${
                on ? "text-black" : "bg-panel-2 text-muted hover:text-ink"
              }`}
              style={on ? { background: positionColor(position) } : undefined}
            >
              {POSITION_SHORT[position]}
            </button>
          );
        })}
        <span className="bg-line mx-1 w-px shrink-0 self-stretch" />
        <button
          type="button"
          onClick={() => setOpenOnly((v) => !v)}
          className={chip(openOnly)}
        >
          Cláusula abierta
        </button>
      </div>

      <div className="border-line bg-void/80 sticky top-0 z-20 flex gap-1.5 overflow-x-auto border-b px-3.5 py-2.5 backdrop-blur-md sm:px-5 lg:px-6">
        <span className="label shrink-0 self-center pr-1">Ordenar</span>
        {SORTS.map((option) => {
          const active = sort === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => {
                if (active) setDesc((v) => !v);
                else {
                  setSort(option.key);
                  setDesc(true);
                }
              }}
              className={chip(active)}
            >
              {option.label}
              {active && <span className="text-[0.62rem] opacity-70">{desc ? "▼" : "▲"}</span>}
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="text-faint px-5 py-12 text-center text-sm">
          {emptyHint ?? "Ningún jugador encaja con este filtro."}
        </p>
      ) : grouped ? (
        // Sin filtros, cada línea es un bloque con su rótulo: veinte tarjetas
        // seguidas sin cortes no dejan ver dónde acaba la defensa.
        <div className="p-2.5 sm:p-3 lg:p-4">
          {POSITIONS.map((position) => {
            const group = rows.filter((c) => c.position === position);
            if (group.length === 0) return null;
            return (
              <section key={position} className="mb-4 last:mb-0">
                <div className="mb-2 flex items-center gap-2 px-0.5">
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ background: positionColor(position) }}
                  />
                  <h3 className="text-[0.82rem] font-semibold">{POSITION_LABEL[position]}</h3>
                  <span className="tnum text-faint text-[0.78rem]">{group.length}</span>
                  <span className="bg-line h-px flex-1" />
                </div>
                <div className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
                  {group.map((card, i) => (
                    <PlayerCard
                      key={card.id}
                      card={card}
                      leagueId={leagueId}
                      delay={Math.min(i * 18, 200)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          {/* Entrenadores y los que no encajan en ninguna línea. */}
          {rows.filter((c) => !POSITIONS.includes(c.position as Position)).length > 0 && (
            <div className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
              {rows
                .filter((c) => !POSITIONS.includes(c.position as Position))
                .map((card) => (
                  <PlayerCard key={card.id} card={card} leagueId={leagueId} />
                ))}
            </div>
          )}
        </div>
      ) : (
        /**
         * Con un criterio elegido, una sola columna centrada: el orden es el
         * mensaje, y repartir en dos o tres columnas obliga a leer en zigzag
         * para saber quién va antes que quién.
         */
        <div className="mx-auto grid max-w-2xl gap-2 p-2.5 sm:p-3 lg:p-4">
          {rows.map((card, i) => (
            <PlayerCard
              key={card.id}
              card={card}
              leagueId={leagueId}
              delay={Math.min(i * 18, 280)}
            />
          ))}
        </div>
      )}
    </>
  );
}
