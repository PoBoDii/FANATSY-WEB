"use client";

import { useMemo, useState } from "react";
import { PlayerCard, type CardData } from "./PlayerCard";
import type { Position } from "@/lib/normalize";

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

const SORTS: { key: Sort; label: string }[] = [
  { key: "posicion", label: "Posición" },
  { key: "prob", label: "Juega" },
  { key: "puntos", label: "Puntos" },
  { key: "media", label: "Media" },
  { key: "valor", label: "Valor" },
  { key: "cambio", label: "Cambio" },
  { key: "clausula", label: "Cláusula" },
  { key: "margen", label: "Dif. valor-cláusula" },
];

const POSITIONS: Position[] = ["PT", "DF", "MC", "DL"];

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

  const toggle = (position: string) => {
    const next = new Set(positions);
    if (next.has(position)) next.delete(position);
    else next.add(position);
    setPositions(next);
  };

  return (
    <>
      <div className="border-line flex gap-1.5 overflow-x-auto border-b px-3.5 py-2.5 sm:px-5 lg:px-6">
        {POSITIONS.map((position) => (
          <button
            key={position}
            type="button"
            onClick={() => toggle(position)}
            className={`tnum ${chip(positions.has(position))}`}
          >
            {position}
          </button>
        ))}
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
      ) : (
        <div className="grid gap-2 p-2.5 sm:p-3 lg:grid-cols-2 lg:p-4 2xl:grid-cols-3">
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
