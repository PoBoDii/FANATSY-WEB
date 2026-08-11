import Link from "next/link";
import type { PlayerAlert } from "@/lib/odds";
import { oddsTone } from "@/lib/odds";
import type { PlayerStatus } from "@/lib/normalize";
import { money, num } from "@/lib/format";
import { AlertBadge, PriceDelta, StatusIcon } from "./ui";
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

const POS_SHORT: Record<string, string> = {
  Portero: "PT",
  Defensa: "DF",
  Mediocampista: "MC",
  Delantero: "DL",
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

  const compare = (a: TeamPlayerRow, b: TeamPlayerRow) => {
    switch (sort) {
      case "valor":
        return b.value - a.value;
      case "cambio":
        return (b.diff ?? 0) - (a.diff ?? 0);
      case "clausula":
        return (b.buyoutClause ?? 0) - (a.buyoutClause ?? 0);
      case "puntos":
        return (b.points ?? -1) - (a.points ?? -1);
      case "dueno":
        // Primero los míos, luego los de otros, luego los libres.
        return rankOwner(b) - rankOwner(a) || (b.probability ?? -1) - (a.probability ?? -1);
      case "posicion":
        return (
          POSITION_ORDER.indexOf(a.position ?? "") - POSITION_ORDER.indexOf(b.position ?? "") ||
          (b.probability ?? -1) - (a.probability ?? -1)
        );
      default:
        return (b.probability ?? -1) - (a.probability ?? -1);
    }
  };

  const filtered = players.filter(
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

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
      active
        ? "border-acid/60 bg-acid/15 text-acid"
        : "border-line text-muted hover:border-faint hover:text-ink"
    }`;

  return (
    <section className="border-line mx-auto max-w-5xl border-t">
      <div className="border-line space-y-2.5 border-b px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label mr-1">Ordenar por</span>
          {SORTS.map((option) => {
            const active = sort === option.key;
            return (
              <Link
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
              </Link>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label mr-1">Posición</span>
          {POSITIONS.map((position) => {
            const on = selected.has(position);
            const next = new Set(selected);
            if (on) next.delete(position);
            else next.add(position);
            return (
              <Link
                key={position}
                href={href({ pos: [...next].join(",") })}
                scroll={false}
                className={chip(on)}
              >
                {POS_SHORT[position] ?? position}
              </Link>
            );
          })}
        </div>
      </div>

      {visible.map((player, i) => (
        <Row key={player.name} player={player} delay={Math.min(i * 14, 260)} />
      ))}
    </section>
  );
}

const rankOwner = (p: TeamPlayerRow) => (p.ownerIsMe ? 2 : p.ownerName ? 1 : 0);

function Row({ player, delay }: { player: TeamPlayerRow; delay: number }) {
  const tone = player.probability !== null ? oddsTone(player.probability) : null;
  const open =
    player.buyoutClause &&
    (!player.buyoutUnlockAt || new Date(player.buyoutUnlockAt).getTime() <= Date.now());

  const body = (
    <>
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[4px]"
        style={{ background: tone?.color ?? "transparent" }}
      />

      <div className="border-line bg-panel-2 shrink-0 overflow-hidden rounded-lg border">
        <PlayerPhoto src={player.photo} name={player.displayName} size={50} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[0.98rem] font-bold">{player.displayName}</span>
          {player.status !== "ok" && <StatusIcon status={player.status} size={16} />}
          <AlertBadge alerts={player.alerts} />
        </div>
        <div className="text-muted mt-1 flex flex-wrap items-center gap-x-2 text-[0.7rem]">
          {player.position && <span className="font-semibold">{player.position}</span>}
          {player.goals != null && <span>· {player.goals} G</span>}
          {player.assists != null && <span>· {player.assists} A</span>}
          {player.hierarchy != null && <span>· jerarquía {player.hierarchy}</span>}
        </div>
      </div>

      {player.ownerName && (
        <span
          className={`hidden shrink-0 rounded-md border px-2 py-1 text-[0.68rem] font-semibold sm:block ${
            player.ownerIsMe
              ? "border-acid bg-acid/15 text-acid"
              : "border-sky-300 bg-sky-50 text-sky-700"
          }`}
        >
          {player.ownerIsMe ? "TUYO" : player.ownerName}
        </span>
      )}

      {player.buyoutClause ? (
        <div className="hidden w-[104px] shrink-0 text-right md:block">
          <div className="label text-[0.55rem] leading-none">Cláusula</div>
          <div
            className={`tnum mt-1 text-[0.95rem] leading-none font-semibold ${
              open ? "text-up" : "text-ink"
            }`}
          >
            {money(player.buyoutClause)}
          </div>
          <div className="mt-1 flex justify-end">
            {player.buyoutUnlockAt && !open ? (
              <Countdown until={player.buyoutUnlockAt} />
            ) : (
              <span className="text-up text-[0.62rem] font-semibold">abierta</span>
            )}
          </div>
        </div>
      ) : (
        <div className="hidden w-[104px] shrink-0 md:block" />
      )}

      <div className="w-[92px] shrink-0 text-right">
        <div className="tnum text-ink text-[0.95rem] leading-none">{money(player.value)}</div>
        <div className="mt-1 flex justify-end">
          <PriceDelta diff={player.diff} size="sm" />
        </div>
        {player.points !== null && (
          <div className="tnum text-faint mt-1 text-[0.65rem]">{num(player.points)} pts</div>
        )}
      </div>

      <span
        className="tnum w-[46px] shrink-0 rounded-md py-1 text-center text-[0.78rem] font-bold"
        style={{
          background: tone?.color ?? "var(--color-panel-2)",
          color: tone?.ink ?? "var(--color-faint)",
        }}
      >
        {player.probability !== null ? `${player.probability}%` : "s/d"}
      </span>
    </>
  );

  return (
    <div
      className="border-line rise hover:bg-panel-2 relative flex items-center gap-3 border-b px-5 py-3 transition-colors"
      style={{ animationDelay: `${delay}ms` }}
    >
      {player.playerId && (
        <Link
          href={`/jugador/${player.playerId}`}
          className="absolute inset-0"
          aria-label={player.displayName}
        />
      )}
      {body}
    </div>
  );
}
