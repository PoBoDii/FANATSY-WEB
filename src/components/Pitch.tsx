import Link from "next/link";
import type { Player } from "@/lib/normalize";
import { ffBadge, type FfPlayer, oddsTone } from "@/lib/odds";
import { money, num } from "@/lib/format";
import { AlertBadge, ClubLink, PlayerAvatar, PricePill, StatusIcon } from "./ui";

/** Qué se enseña bajo cada jugador del once. */
export type PitchStat = "ahora" | "goles" | "jornada" | "tarjetas" | "jerarquia";

export const PITCH_STATS: { key: PitchStat; label: string }[] = [
  { key: "ahora", label: "Probabilidad y precio" },
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
  stat = "ahora",
  selector,
}: {
  players: Player[];
  formation?: string | null;
  leagueId: string | null;
  oddsOf?: (player: Player) => FfPlayer | null;
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
    <div className="p-2.5 sm:p-4 lg:p-5">
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
              Once titular · {derived}
            </span>
            {selector}
          </div>

          <div className="flex flex-col gap-3.5 sm:gap-5 lg:gap-8">
            {lines.map((line, i) => (
              <div key={i} className="flex justify-center gap-1 sm:gap-2 lg:gap-5">
                {line.map((player, j) => (
                  <PitchToken
                    key={player.id}
                    player={player}
                    leagueId={leagueId}
                    odds={oddsOf?.(player) ?? null}
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
function statLine(stat: PitchStat, player: Player, odds: FfPlayer | null) {
  const s = odds?.stats;

  switch (stat) {
    case "goles":
      return (
        <>
          <Chip label="G" value={s?.goals} tone="text-emerald-700" />
          <Chip label="A" value={s?.assists} tone="text-sky-700" />
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
  stat,
  delay,
}: {
  player: Player;
  leagueId: string | null;
  odds: FfPlayer | null;
  stat: PitchStat;
  delay: number;
}) {
  const content = (
    <>
      <div className="relative">
        <PlayerAvatar player={player} size={72} className="h-[54px] w-[54px] sm:h-[72px] sm:w-[72px]" />

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
        <div className="mt-1 flex items-center justify-center gap-1 sm:gap-2">
          {statLine(stat, player, odds)}
        </div>
      </div>
    </>
  );

  return (
    <div
      className="rise relative flex w-[68px] flex-col items-center transition-transform hover:-translate-y-1 sm:w-[84px] lg:w-[104px]"
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
