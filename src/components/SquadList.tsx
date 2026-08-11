import Link from "next/link";
import type { Player, Position } from "@/lib/normalize";
import type { FfPlayer } from "@/lib/odds";
import type { Fixture } from "@/lib/equipos";
import { PlayerRow } from "./ui";

export type SquadSort =
  | "posicion"
  | "clausula"
  | "margen"
  | "precio"
  | "cambio"
  | "prob"
  | "puntos"
  | "media";

export type SortDir = "asc" | "desc";

export const SQUAD_SORTS: { key: SquadSort; label: string }[] = [
  { key: "posicion", label: "Posición" },
  { key: "clausula", label: "Cuándo se abre" },
  { key: "margen", label: "Dif. valor-cláusula" },
  { key: "precio", label: "Precio" },
  { key: "cambio", label: "Cambio de valor" },
  { key: "prob", label: "Probabilidad" },
  { key: "puntos", label: "Puntos" },
  { key: "media", label: "Media" },
];

export const POSITION_FILTERS: Position[] = ["PT", "DF", "MC", "DL"];

/** Orden natural de un once: portería, defensa, medio, delantera. */
const POSITION_RANK: Record<Position, number> = { PT: 0, DF: 1, MC: 2, DL: 3, EN: 4, "?": 5 };

/** Cuándo queda libre la cláusula. Sin fecha = ya abierta → lo primero. */
function unlockTime(player: Player): number {
  if (!player.buyoutClause) return Number.POSITIVE_INFINITY;
  if (!player.buyoutUnlockAt) return 0;
  const at = new Date(player.buyoutUnlockAt).getTime();
  return Number.isFinite(at) ? Math.max(0, at) : 0;
}

/** Lo que cuesta clausularlo por encima de su valor: el sobreprecio real. */
function clauseMargin(player: Player): number {
  return player.buyoutClause ? player.buyoutClause - player.marketValue : Number.POSITIVE_INFINITY;
}

export function sortSquad(
  players: Player[],
  sort: SquadSort,
  dir: SortDir,
  oddsOf: (player: Player) => FfPlayer | null,
): Player[] {
  const diff = (p: Player) => oddsOf(p)?.diff ?? 0;

  // Cada criterio se define en su orden natural (el que se espera al pulsarlo)
  // y `dir` lo invierte. Así todos se comportan igual.
  const compare = (a: Player, b: Player): number => {
    switch (sort) {
      case "posicion":
        return (
          POSITION_RANK[a.position] - POSITION_RANK[b.position] || b.marketValue - a.marketValue
        );
      case "clausula":
        return unlockTime(a) - unlockTime(b) || b.marketValue - a.marketValue;
      case "margen":
        return clauseMargin(b) - clauseMargin(a);
      case "cambio":
        return diff(b) - diff(a);
      case "prob":
        return (oddsOf(b)?.probability ?? -1) - (oddsOf(a)?.probability ?? -1) || diff(b) - diff(a);
      case "puntos":
        return b.points - a.points || diff(b) - diff(a);
      case "media":
        return b.averagePoints - a.averagePoints || diff(b) - diff(a);
      default:
        return b.marketValue - a.marketValue;
    }
  };

  const sorted = [...players].sort(compare);
  return dir === "asc" ? sorted.reverse() : sorted;
}

/* ------------------------------------------------------------------ barra */

function buildHref(base: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  return `${base}${search.size ? `?${search}` : ""}`;
}

const chip = (active: boolean) =>
  `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
    active
      ? "border-acid/60 bg-acid/15 text-acid"
      : "border-line text-muted hover:border-faint hover:text-ink"
  }`;

/**
 * "Cuándo se abre" ordena por tiempo, no por cantidad, así que sus etiquetas
 * son distintas. En el resto, la dirección se dice con palabras en vez de con
 * una flecha: una flecha hacia arriba puede leerse como "los más altos arriba"
 * o como "orden ascendente", y son cosas opuestas.
 */
function dirLabel(sort: SquadSort, dir: SortDir): string {
  if (sort === "posicion") return dir === "desc" ? "PT→DL" : "DL→PT";
  if (sort === "clausula") return dir === "desc" ? "antes" : "después";
  return dir === "desc" ? "máx" : "mín";
}

export function SortBar({
  base,
  sort,
  dir,
  pos,
  openOnly,
  extra,
}: {
  base: string;
  sort: SquadSort;
  dir: SortDir;
  /** Posiciones seleccionadas, separadas por coma. */
  pos?: string;
  /** Sólo jugadores con la cláusula ya abierta. */
  openOnly?: boolean;
  /** Parámetros que hay que conservar al navegar (p. ej. la pestaña). */
  extra?: Record<string, string | undefined>;
}) {
  const selected = new Set((pos ?? "").split(",").filter(Boolean));
  const keep = { ...extra, pos, abiertas: openOnly ? "1" : undefined };

  return (
    <div className="border-line space-y-2.5 border-b px-5 py-3.5 lg:px-6">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label mr-1">Ordenar por</span>
        {SQUAD_SORTS.map((option) => {
          const active = sort === option.key;
          // Pulsar el criterio activo invierte el sentido.
          const nextDir: SortDir = active && dir === "desc" ? "asc" : "desc";
          return (
            <Link
              key={option.key}
              href={buildHref(base, { ...keep, orden: option.key, dir: nextDir })}
              scroll={false}
              className={chip(active)}
            >
              {option.label}
              {active && (
                <span className="bg-acid/20 rounded-full px-1.5 py-[1px] text-[0.62rem]">
                  {dirLabel(sort, dir)}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label mr-1">Filtrar</span>
        {POSITION_FILTERS.map((position) => {
          const on = selected.has(position);
          const next = new Set(selected);
          if (on) next.delete(position);
          else next.add(position);
          return (
            <Link
              key={position}
              href={buildHref(base, { ...keep, orden: sort, dir, pos: [...next].join(",") })}
              scroll={false}
              className={`tnum ${chip(on)}`}
            >
              {position}
            </Link>
          );
        })}

        <Link
          href={buildHref(base, {
            ...keep,
            orden: sort,
            dir,
            abiertas: openOnly ? undefined : "1",
          })}
          scroll={false}
          className={
            openOnly
              ? "border-down/60 bg-down/15 text-down inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs"
              : chip(false)
          }
        >
          Cláusula abierta
        </Link>
      </div>
    </div>
  );
}

/** ¿Se le puede pagar la cláusula ahora mismo? */
export function clauseIsOpen(player: Player): boolean {
  if (!player.buyoutClause) return false;
  if (!player.buyoutUnlockAt) return true;
  const at = new Date(player.buyoutUnlockAt).getTime();
  return !Number.isFinite(at) || at <= Date.now();
}

export function SquadRows({
  players,
  leagueId,
  oddsOf,
  highlight,
  fixturesOf,
}: {
  players: Player[];
  leagueId: string;
  oddsOf: (player: Player) => FfPlayer | null;
  /** Criterio activo: su dato se enseña en grande en el hueco central. */
  highlight?: SquadSort;
  /** Próximos partidos del club de cada jugador. */
  fixturesOf?: (player: Player) => Fixture[] | null;
}) {
  return (
    <div>
      {players.map((player, i) => (
        <PlayerRow
          key={player.id}
          player={player}
          leagueId={leagueId}
          odds={oddsOf(player)}
          highlight={highlight}
          fixtures={fixturesOf?.(player) ?? null}
          delay={Math.min(i * 20, 320)}
        />
      ))}
    </div>
  );
}

/** Lee y valida los parámetros de ordenación de la URL. */
export function readSortParams(
  params: { orden?: string; dir?: string; pos?: string; abiertas?: string },
  fallback: SquadSort,
) {
  const sort = (SQUAD_SORTS.find((s) => s.key === params.orden)?.key ?? fallback) as SquadSort;
  const dir: SortDir = params.dir === "asc" ? "asc" : "desc";
  const positions = new Set((params.pos ?? "").split(",").filter(Boolean));
  const openOnly = params.abiertas === "1";
  return { sort, dir, pos: params.pos, positions, openOnly };
}

/** Aplica filtros de posición y de cláusula abierta. */
export function filterSquad(
  players: Player[],
  positions: Set<string>,
  openOnly: boolean,
): Player[] {
  return players.filter(
    (p) =>
      (positions.size === 0 || positions.has(p.position)) && (!openOnly || clauseIsOpen(p)),
  );
}
