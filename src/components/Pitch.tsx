import Link from "next/link";
import type { Player } from "@/lib/normalize";
import { ffBadge, type FfPlayer, oddsTone } from "@/lib/odds";
import { money, num } from "@/lib/format";
import { AlertBadge, ClubLink, PlayerAvatar, PricePill, StatusIcon } from "./ui";
import { NextRival, isLeague } from "./Fixtures";
import type { Fixture } from "@/lib/equipos";

/** Qué se enseña bajo cada jugador del once. */
export type PitchStat =
  | "ahora"
  | "proximo"
  | "goles"
  | "jornada"
  | "tarjetas"
  | "jerarquia"
  // Sólo la usa el once ideal; no aparece en el selector.
  | "ideal";

export const PITCH_STATS: { key: PitchStat; label: string }[] = [
  { key: "ahora", label: "Probabilidad y precio" },
  { key: "proximo", label: "Próximo partido" },
  { key: "goles", label: "Goles y asistencias" },
  { key: "jornada", label: "Última jornada" },
  { key: "tarjetas", label: "Tarjetas" },
  { key: "jerarquia", label: "Jerarquía" },
];

/**
 * Campo con la alineación. En vez de fiarnos del string de formación (que
 * cambia de formato entre versiones de la API), agrupamos por posición y
 * repartimos cada línea de forma equidistante. Sale bien para cualquier
 * 4-4-2, 3-5-2, 5-3-2...
 */
export function Pitch({
  players,
  formation,
  leagueId,
  oddsOf,
  fixturesOf,
  xpOf,
  alreadyIn,
  outOf,
  title,
  maxWidth,
  stat = "ahora",
  selector,
}: {
  players: Player[];
  formation?: string | null;
  leagueId: string | null;
  oddsOf?: (player: Player) => FfPlayer | null;
  /** Próximos partidos del club de cada jugador. */
  fixturesOf?: (player: Player) => Fixture[] | null;
  /** Puntos esperados, para el once ideal. */
  xpOf?: (player: Player) => number | null;
  /** Quiénes están ya en mi alineación de esta jornada. */
  alreadyIn?: Set<string>;
  /**
   * Quiénes ocupan casilla sin poder jugar, porque no hay nadie más para ese
   * puesto. Devuelve el motivo en corto ("lesionado") o `null` si sí juega.
   */
  outOf?: (player: Player) => string | null;
  /** Rótulo de la esquina; por defecto, "Once titular". */
  title?: string;
  /** Ancho máximo del césped, para que no se estire de lado a lado. */
  maxWidth?: string;
  stat?: PitchStat;
  selector?: React.ReactNode;
}) {
  // De arriba abajo: portería, defensa, medio y ataque — como se lee la
  // alineación en el juego.
  const lines = [
    players.filter((p) => p.position === "PT"),
    players.filter((p) => p.position === "DF"),
    players.filter((p) => p.position === "MC"),
    players.filter((p) => p.position === "DL"),
  ].filter((line) => line.length > 0);

  const derived =
    formation ??
    [
      players.filter((p) => p.position === "DF").length,
      players.filter((p) => p.position === "MC").length,
      players.filter((p) => p.position === "DL").length,
    ].join("-");

  return (
    <div className={`p-2.5 sm:p-4 lg:p-5 ${maxWidth ?? ""}`}>
      <div className="relative overflow-hidden rounded-xl">
        {/* Césped: franjas de siega y líneas de cal */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "repeating-linear-gradient(180deg, #2f7d4f 0 64px, #2a7348 64px 128px)",
          }}
        />
        <svg
          aria-hidden
          viewBox="0 0 100 140"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          style={{ stroke: "rgba(255,255,255,0.35)", fill: "none", strokeWidth: 0.35 }}
        >
          <rect x="3" y="3" width="94" height="134" />
          <line x1="3" y1="70" x2="97" y2="70" />
          <circle cx="50" cy="70" r="13" />
          <rect x="26" y="3" width="48" height="20" />
          <rect x="26" y="117" width="48" height="20" />
          <rect x="38" y="3" width="24" height="8" />
          <rect x="38" y="129" width="24" height="8" />
        </svg>

        <div className="relative px-1.5 py-4 sm:px-3 sm:py-6 lg:px-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1.5 sm:mb-4 sm:gap-3">
            <span className="rounded-full bg-black/25 px-2.5 py-1 text-[0.62rem] font-semibold tracking-wide text-white/90 uppercase sm:px-3 sm:text-[0.7rem]">
              {title ?? "Once titular"} · {derived}
            </span>
            {selector}
          </div>

          <div className="flex flex-col gap-3.5 sm:gap-5 lg:gap-8">
            {lines.map((line, i) => (
              <div key={i} className="flex justify-center gap-0.5 sm:gap-2 lg:gap-5">
                {line.map((player, j) => (
                  <PitchToken
                    key={player.id}
                    player={player}
                    leagueId={leagueId}
                    odds={oddsOf?.(player) ?? null}
                    fixtures={fixturesOf?.(player) ?? null}
                    xp={xpOf?.(player) ?? null}
                    alreadyIn={alreadyIn?.has(player.id)}
                    out={outOf?.(player) ?? null}
                    stat={stat}
                    delay={i * 80 + j * 40}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Lo que va en la línea inferior de la ficha, según el selector. */
function statLine(
  stat: PitchStat,
  player: Player,
  odds: FfPlayer | null,
  fixtures: Fixture[] | null,
  xp: number | null,
) {
  const s = odds?.stats;

  switch (stat) {
    case "ideal":
      return (
        <span className="tnum text-[0.72rem] leading-none font-bold">
          {xp === null ? "—" : xp.toFixed(1)}
          <span className="text-faint ml-0.5 text-[0.58rem] font-normal">pts</span>
        </span>
      );
    case "proximo":
      return fixtures?.some(isLeague) ? (
        <NextRival fixtures={fixtures} size="sm" />
      ) : (
        <span className="text-faint text-[0.62rem]">sin partido</span>
      );
    case "goles":
      return (
        <>
          <Chip label="G" value={s?.goals} tone="text-up" />
          <Chip label="A" value={s?.assists} tone="text-info" />
        </>
      );
    case "jornada":
      return (
        <span className="tnum text-[0.72rem] leading-none font-semibold">
          {num(player.points)} <span className="text-faint text-[0.6rem]">pts</span>
        </span>
      );
    case "tarjetas":
      return (
        <>
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-[9px] rounded-[1px] bg-[#f5c518]" />
            <span className="tnum text-[0.7rem] leading-none">{s?.yellow ?? 0}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-[9px] rounded-[1px] bg-[#d8412f]" />
            <span className="tnum text-[0.7rem] leading-none">{s?.red ?? 0}</span>
          </span>
        </>
      );
    case "jerarquia":
      return s?.hierarchy != null ? (
        <span className="tnum text-[0.72rem] leading-none font-semibold">
          {s.hierarchy}
          <span className="text-faint text-[0.6rem]">/100</span>
        </span>
      ) : (
        <span className="text-faint text-[0.65rem]">s/d</span>
      );
    default:
      // El % ya va en grande sobre la foto; aquí basta el cambio del día, que
      // es lo otro que se mira. El valor absoluto importa menos.
      return odds?.diff ? (
        <PricePill diff={odds.diff} />
      ) : (
        <span className="tnum text-muted text-[0.65rem] leading-none">
          {money(player.marketValue)}
        </span>
      );
  }
}

function Chip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null | undefined;
  tone: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <span className={`text-[0.58rem] font-bold ${tone}`}>{label}</span>
      <span className="tnum text-[0.72rem] leading-none font-semibold">{value ?? 0}</span>
    </span>
  );
}

function PitchToken({
  player,
  leagueId,
  odds,
  fixtures,
  xp,
  alreadyIn,
  out,
  stat,
  delay,
}: {
  player: Player;
  leagueId: string | null;
  odds: FfPlayer | null;
  fixtures: Fixture[] | null;
  xp?: number | null;
  alreadyIn?: boolean;
  /**
   * Está en el once por no dejar el hueco vacío. Trae el motivo por el que no
   * va a jugar; `null` si sí juega.
   */
  out?: string | null;
  stat: PitchStat;
  delay: number;
}) {
  const content = (
    <>
      <div className="relative">
        <PlayerAvatar
          player={player}
          size={72}
          className={`h-12 w-12 sm:h-[72px] sm:w-[72px] ${out ? "ring-down ring-2" : ""}`}
        />

        {/* La probabilidad es el dato que se busca al mirar el once: va grande
            y encima de la foto, no como una etiqueta más. */}
        {odds?.probability != null && (
          <span
            className="tnum absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-lg px-1.5 py-[3px] text-[0.72rem] leading-none font-bold shadow-md sm:px-2.5 sm:text-[0.9rem]"
            style={{
              background: oddsTone(odds.probability).color,
              color: oddsTone(odds.probability).ink,
            }}
            title={`${oddsTone(odds.probability).label} — ${odds.probability}% de ser titular`}
          >
            {odds.probability}%
          </span>
        )}

        {/* Escudo siempre visible, arriba a la izquierda; lleva a su club */}
        <span className="border-line absolute -top-1.5 -left-1.5 z-20 rounded-lg border bg-white p-[2px] shadow-md sm:-top-2 sm:-left-2 sm:p-[3px]">
          <ClubLink
            name={player.clubName !== "—" ? player.clubName : (odds?.teamName ?? null)}
            badge={player.clubBadge ?? ffBadge(odds?.teamId ?? null)}
            size={18}
            showName={false}
          />
        </span>

        {/* Ya alineado o no. Va arriba, junto al escudo, para no pisar el
            nombre ni la probabilidad. */}
        {alreadyIn === false && (
          <span className="bg-warn absolute -top-2 left-1/2 z-20 -translate-x-1/2 rounded-full px-1.5 py-[1px] text-[0.5rem] font-bold text-black shadow">
            ENTRA
          </span>
        )}

        <span className="absolute -top-2 -right-2 z-20 flex flex-col items-end gap-1">
          <StatusIcon status={player.status} size={22} />
          <AlertBadge alerts={odds?.alerts} />
        </span>
      </div>

      <div className="mt-2 w-full px-0.5 sm:px-1">
        {/* Sin recuadro: el nombre se lee sobre el césped con su sombra, y así
            cabe entero en vez de cortarse dentro de una burbuja estrecha. */}
        <div
          className="text-center text-[0.66rem] leading-tight font-bold text-white sm:text-[0.76rem]"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)" }}
        >
          {player.name}
        </div>
        <div className="mt-1 flex min-w-0 items-center justify-center gap-1 sm:gap-2">
          {out ? (
            <span
              className="bg-down rounded px-1.5 py-[2px] text-center text-[0.55rem] leading-tight font-bold text-white uppercase"
              title="Ocupa el puesto porque no te queda nadie más para esa línea"
            >
              {out}
            </span>
          ) : (
            statLine(stat, player, odds, fixtures, xp ?? null)
          )}
        </div>
        {stat === "ideal" && !out && (
          <div className="mt-1 flex justify-center">
            <NextRival fixtures={fixtures} size="sm" />
          </div>
        )}
      </div>
    </>
  );

  // Ancho elástico con tope: en el móvil las cinco fichas de una línea de cinco
  // tienen que repartirse lo que haya sin salirse de la pantalla.
  return (
    <div
      className="rise relative flex max-w-[64px] min-w-0 flex-1 flex-col items-center transition-transform hover:-translate-y-1 sm:max-w-[84px] lg:max-w-[104px]"
      style={{ animationDelay: `${delay}ms` }}
    >
      {leagueId && (
        <Link
          href={`/jugador/${player.id}`}
          className="absolute inset-0 z-10"
          aria-label={player.name}
        />
      )}
      {content}
    </div>
  );
}
