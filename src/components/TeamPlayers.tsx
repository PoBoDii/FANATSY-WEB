import Link from "next/link";
import type { PlayerAlert } from "@/lib/odds";
import { oddsTone } from "@/lib/odds";
import type { PlayerStatus, Position } from "@/lib/normalize";
import { money, num } from "@/lib/format";
import { AlertBadge, PositionTag, PriceDelta, StatusIcon } from "./ui";
import { PendingLink } from "./PendingLink";
import { PlayerPhoto } from "./PlayerPhoto";
import { Countdown } from "./Countdown";

export type TeamPlayerRow = {
  name: string;
  displayName: string;
  photo: string | null;
  position: string | null;
  probability: number | null;
  value: number;
  diff: number | null;
  diffPct: number | null;
  streak: number;
  goals: number | null;
  assists: number | null;
  hierarchy: number | null;
  alerts: PlayerAlert[];
  playerId: string | null;
  points: number | null;
  status: PlayerStatus;
  ownerName: string | null;
  ownerIsMe: boolean;
  buyoutClause: number | null;
  buyoutUnlockAt: string | null;
};

type Sort = "prob" | "valor" | "cambio" | "clausula" | "puntos" | "posicion" | "dueno";

const SORTS: { key: Sort; label: string }[] = [
  { key: "posicion", label: "Posición" },
  { key: "prob", label: "Probabilidad" },
  { key: "valor", label: "Valor" },
  { key: "cambio", label: "Cambio de valor" },
  { key: "clausula", label: "Cláusula" },
  { key: "puntos", label: "Puntos" },
  { key: "dueno", label: "Quién lo tiene" },
];

const POSITION_ORDER = ["Portero", "Defensa", "Mediocampista", "Delantero"];
const POSITIONS = POSITION_ORDER;

/**
 * Jugador del que no se sabe nada: ni posición, ni valor, ni probabilidad, ni
 * estadísticas. Son canteranos y fichajes recién anunciados que futbolfantasy
 * lista en la plantilla pero que todavía no cotizan en el juego. Ordenarlos
 * junto al resto sólo ensucia: van aparte, al final.
 */
function hasNoData(p: TeamPlayerRow): boolean {
  // Sin valor de mercado no está en el juego: no se puede fichar ni puntúa,
  // por mucho que futbolfantasy le ponga un porcentaje de titularidad.
  return p.value === 0 && p.points === null;
}

const isCoach = (p: TeamPlayerRow) => p.position === "Entrenador";

const POS_SHORT: Record<string, string> = {
  Portero: "PT",
  Defensa: "DF",
  Mediocampista: "MC",
  Delantero: "DL",
};

/** Nombre largo de futbolfantasy → etiqueta de posición del resto de la web. */
const POS_TAG: Record<string, Position> = {
  Portero: "PT",
  Defensa: "DF",
  Mediocampista: "MC",
  Delantero: "DL",
  Entrenador: "EN",
};

/**
 * Plantilla completa de un club, con los mismos filtros y ordenaciones que el
 * resto de listas. Va por URL para que se pueda compartir el enlace.
 */
export function TeamPlayers({
  players,
  slug,
  query,
}: {
  players: TeamPlayerRow[];
  slug: string;
  query: { tab?: string; orden?: string; dir?: string; pos?: string };
}) {
  const sort = (SORTS.find((s) => s.key === query.orden)?.key ?? "prob") as Sort;
  const dir = query.dir === "asc" ? "asc" : "desc";
  const selected = new Set((query.pos ?? "").split(",").filter(Boolean));

  // A igualdad de lo que se esté ordenando manda el orden natural del once:
  // portería, defensa, centro y ataque. Antes quedaban mezclados y costaba ver
  // de qué línea era cada uno.
  const byPosition = (a: TeamPlayerRow, b: TeamPlayerRow) =>
    POSITION_ORDER.indexOf(a.position ?? "") - POSITION_ORDER.indexOf(b.position ?? "");

  const compare = (a: TeamPlayerRow, b: TeamPlayerRow) => {
    switch (sort) {
      case "valor":
        return b.value - a.value || byPosition(a, b);
      case "cambio":
        return (b.diff ?? 0) - (a.diff ?? 0) || byPosition(a, b);
      case "clausula":
        return (b.buyoutClause ?? 0) - (a.buyoutClause ?? 0) || byPosition(a, b);
      case "puntos":
        return (b.points ?? -1) - (a.points ?? -1) || byPosition(a, b);
      case "dueno":
        // Primero los míos, luego los de otros, luego los libres.
        return (
          rankOwner(b) - rankOwner(a) ||
          (b.probability ?? -1) - (a.probability ?? -1) ||
          byPosition(a, b)
        );
      case "posicion":
        return (
          POSITION_ORDER.indexOf(a.position ?? "") - POSITION_ORDER.indexOf(b.position ?? "") ||
          (b.probability ?? -1) - (a.probability ?? -1)
        );
      default:
        return (b.probability ?? -1) - (a.probability ?? -1) || byPosition(a, b);
    }
  };

  // Tres grupos: la plantilla de verdad, el cuerpo técnico y los que no
  // tienen ningún dato. Filtros y ordenación sólo tocan al primero.
  const coaches = players.filter(isCoach);
  const unknown = players.filter((p) => !isCoach(p) && hasNoData(p));
  const real = players.filter((p) => !isCoach(p) && !hasNoData(p));

  const filtered = real.filter(
    (p) => selected.size === 0 || (p.position && selected.has(p.position)),
  );
  const ordered = filtered.sort(compare);
  const visible = dir === "asc" ? [...ordered].reverse() : ordered;

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    // Sin `tab` el enlace vuelve a la pestaña por defecto y parecía que los
    // filtros no hacían nada.
    const next = { tab: "jugadores", orden: sort, dir, pos: query.pos, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    return `/equipos/${slug}${params.size ? `?${params}` : ""}`;
  };

  // Mismas pastillas que en el resto de listas: la activa invierte el
  // contraste, sin bordes de colores.
  const chip = (active: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.78rem] transition-colors ${
      active ? "bg-ink text-void font-semibold" : "bg-panel-2 text-muted hover:text-ink"
    }`;

  return (
    <section className="border-line border-t">
      <div className="border-line space-y-2 border-b px-3.5 py-2.5 sm:px-5">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="label shrink-0 pr-1">Ordenar</span>
          {SORTS.map((option) => {
            const active = sort === option.key;
            return (
              <PendingLink
                key={option.key}
                href={href({ orden: option.key, dir: active && dir === "desc" ? "asc" : "desc" })}
                scroll={false}
                className={chip(active)}
              >
                {option.label}
                {active && (
                  <span className="bg-acid/20 rounded-full px-1.5 py-[1px] text-[0.62rem]">
                    {dir === "desc" ? "máx" : "mín"}
                  </span>
                )}
              </PendingLink>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="label shrink-0 pr-1">Puesto</span>
          {POSITIONS.map((position) => {
            const on = selected.has(position);
            const next = new Set(selected);
            if (on) next.delete(position);
            else next.add(position);
            return (
              <PendingLink
                key={position}
                href={href({ pos: [...next].join(",") })}
                scroll={false}
                className={chip(on)}
              >
                {POS_SHORT[position] ?? position}
              </PendingLink>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2 p-2.5 sm:p-3 lg:grid-cols-2 lg:p-4 2xl:grid-cols-3">
        {visible.map((player, i) => (
          <Row key={player.name} player={player} delay={Math.min(i * 14, 260)} />
        ))}
      </div>

      {coaches.length > 0 && (
        <>
          <GroupTitle>Cuerpo técnico · {coaches.length}</GroupTitle>
          <div className="grid gap-2 p-2.5 sm:p-3 lg:grid-cols-2 lg:p-4 2xl:grid-cols-3">
            {coaches.map((player) => (
              <Row key={player.name} player={player} delay={0} />
            ))}
          </div>
        </>
      )}

      {unknown.length > 0 && (
        <>
          <GroupTitle>Sin información disponible · {unknown.length}</GroupTitle>
          <p className="text-faint px-5 pt-2 pb-1 text-xs">
            Canteranos y fichajes recién anunciados: ni futbolfantasy ni el juego publican todavía
            su valor, su probabilidad ni sus estadísticas.
          </p>
          <div className="grid gap-2 p-2.5 sm:p-3 lg:grid-cols-2 lg:p-4 2xl:grid-cols-3">
            {unknown.map((player) => (
              <Row key={player.name} player={player} delay={0} muted />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** Separador de grupo dentro de la lista. */
function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-line bg-panel-2/60 border-y px-5 py-2.5">
      <span className="label">{children}</span>
    </div>
  );
}

const rankOwner = (p: TeamPlayerRow) => (p.ownerIsMe ? 2 : p.ownerName ? 1 : 0);

function Row({
  player,
  delay,
  muted = false,
}: {
  player: TeamPlayerRow;
  delay: number;
  /** Sin datos: se enseña apagado para que no compita con el resto. */
  muted?: boolean;
}) {
  const tone = player.probability !== null ? oddsTone(player.probability) : null;
  const open =
    player.buyoutClause &&
    (!player.buyoutUnlockAt || new Date(player.buyoutUnlockAt).getTime() <= Date.now());

  /**
   * Misma tarjeta que en el resto de la web: foto a sangre a la izquierda,
   * nombre y puesto arriba, y a la derecha el dato que manda —aquí la
   * probabilidad de jugar, que es a lo que se viene a la plantilla de un club—.
   */
  return (
    <article
      className={`rise bg-panel border-line hover:border-faint/60 relative flex min-h-[104px] overflow-hidden rounded-2xl border transition-colors ${
        muted ? "opacity-60" : ""
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {player.playerId && (
        <Link
          href={`/jugador/${player.playerId}`}
          className="absolute inset-0"
          aria-label={player.displayName}
        />
      )}

      <div className="bg-panel-2 relative w-[72px] shrink-0 overflow-hidden sm:w-[84px]">
        <PlayerPhoto src={player.photo} name={player.displayName} size={90} className="h-full w-full" />
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ background: tone?.color ?? "transparent" }}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5 px-2.5 py-2.5 sm:px-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {player.position && (
              <PositionTag position={POS_TAG[player.position] ?? "?"} size="sm" />
            )}
            <h3 className="truncate text-[1rem] leading-tight font-semibold sm:text-[1.1rem]">
              {player.displayName}
            </h3>
            {player.status !== "ok" && <StatusIcon status={player.status} size={14} />}
            <AlertBadge alerts={player.alerts} />
          </div>

          <span
            className="tnum shrink-0 rounded-lg px-2 py-1 text-[0.9rem] font-bold"
            style={{
              background: tone?.color ?? "var(--color-panel-2)",
              color: tone?.ink ?? "var(--color-faint)",
            }}
            title={player.probability !== null ? "Probabilidad de ser titular" : "Sin dato"}
          >
            {player.probability !== null ? `${player.probability}%` : "—"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="tnum text-[0.95rem] leading-none font-semibold">
            {money(player.value)}
          </span>
          <PriceDelta diff={player.diff} size="sm" />
          {player.points !== null && (
            <span className="tnum text-faint text-[0.7rem]">{num(player.points)} pts</span>
          )}
          <span className="text-faint text-[0.68rem]">
            {[
              player.goals != null ? `${player.goals} G` : null,
              player.assists != null ? `${player.assists} A` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {player.ownerName ? (
            <span
              className={`text-[0.7rem] font-semibold ${
                player.ownerIsMe ? "text-acid" : "text-info"
              }`}
            >
              {player.ownerIsMe ? "tuyo" : player.ownerName}
            </span>
          ) : (
            <span className="text-faint text-[0.7rem]">libre</span>
          )}

          {player.buyoutClause ? (
            <>
              <span
                className={`tnum text-[0.8rem] leading-none font-semibold ${
                  open ? "text-up" : "text-down"
                }`}
              >
                🔒 {money(player.buyoutClause)}
              </span>
              {player.buyoutUnlockAt && !open && <Countdown until={player.buyoutUnlockAt} />}
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
