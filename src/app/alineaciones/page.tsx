import Link from "next/link";
import { getMatches } from "@/lib/alineaciones";
import { TEAMS, findTeamByName } from "@/lib/equipos";
import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { getFf } from "@/lib/futbolfantasy";
import { playersOfTeam, toList, toManager } from "@/lib/normalize";
import { Empty, PageHeader } from "@/components/ui";
import { FfLink } from "@/components/FfLink";
import { ffLineupsUrl } from "@/lib/odds";
import { RoundPicker } from "@/components/RoundPicker";

export const dynamic = "force-dynamic";

/** LaLiga tiene 38 jornadas. */
const ROUNDS = Array.from({ length: 38 }, (_, i) => i + 1);

export default async function AlineacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ j?: string }>;
}) {
  const { j } = await searchParams;
  const round = Math.min(38, Math.max(1, Number(j) || 1));

  const session = await getSession();
  const league = session.active;

  const [matches, { data: teamRaw }, ff] = await Promise.all([
    getMatches(round),
    league?.myTeamId
      ? safe(fantasy.team(league.id, league.myTeamId))
      : Promise.resolve({ data: null, error: null }),
    getFf(),
  ]);

  /**
   * Cuántos jugadores míos hay en cada club de LaLiga.
   *
   * El club sale del cruce con futbolfantasy, que es quien tiene el id de
   * equipo; cuando ese cruce falla se recurre al nombre que da LaLiga. Con eso
   * se puede decir en cada partido cuántos míos se juegan los puntos.
   */
  const mine = new Map<string, number>();
  if (teamRaw) {
    for (const player of playersOfTeam(teamRaw)) {
      const row = ff.byName(player.fullName || player.name) ?? ff.byName(player.name);
      const team =
        TEAMS.find((t) => t.ffId === row?.teamId) ?? findTeamByName(player.clubName ?? "");
      if (team) mine.set(team.ffId, (mine.get(team.ffId) ?? 0) + 1);
    }
  }

  // Cuántos tienen los demás managers, para saber contra quién te juegas cada
  // partido: un partido donde nadie tiene a nadie da igual.
  const total = new Map<string, number>();
  if (league) {
    const { data: teamsRaw } = await safe(fantasy.leagueTeams(league.id));
    for (const raw of toList(teamsRaw)) {
      for (const player of playersOfTeam(raw)) {
        const row = ff.byName(player.fullName || player.name) ?? ff.byName(player.name);
        const team =
          TEAMS.find((t) => t.ffId === row?.teamId) ?? findTeamByName(player.clubName ?? "");
        if (team) total.set(team.ffId, (total.get(team.ffId) ?? 0) + 1);
      }
    }
  }

  const countOf = (teamId: string) => ({
    mine: mine.get(teamId) ?? 0,
    total: total.get(teamId) ?? 0,
  });

  return (
    <>
      <PageHeader
        eyebrow="Alineaciones probables"
        title={`Jornada ${round}`}
        meta="Onces que futbolfantasy da como más probables. El número junto a cada escudo son tus jugadores en ese club."
        action={
          <div className="flex items-center gap-2">
            <FfLink
              href={ffLineupsUrl(round)}
              label={`Ver las alineaciones de la jornada ${round} en futbolfantasy`}
            />
            <RoundPicker rounds={ROUNDS} current={round} />
          </div>
        }
      />

      {matches.length === 0 ? (
        <Empty
          title="Sin partidos"
          hint="futbolfantasy todavía no publica los onces de esta jornada."
        />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 p-2.5 sm:grid-cols-2 sm:p-4 lg:p-6">
          {matches.map((match, i) => {
            const home = countOf(match.home.teamId);
            const away = countOf(match.away.teamId);
            const mineHere = home.mine + away.mine;
            const homeTeam = findTeamByName(match.home.name);
            const awayTeam = findTeamByName(match.away.name);

            return (
              <Link
                key={match.id}
                href={`/alineaciones/${match.id}?j=${round}`}
                className={`border-line rise bg-panel overflow-hidden rounded-2xl border transition-colors ${
                  mineHere > 0 ? "border-[#e0a827]/50" : "hover:border-faint/60"
                }`}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                {/* Franja partida con el color de cada club: es lo que hace
                    reconocible un partido antes de leer los nombres. */}
                <div className="flex h-1.5">
                  <span className="flex-1" style={{ background: homeTeam?.color ?? "#4b5563" }} />
                  <span className="flex-1" style={{ background: awayTeam?.color ?? "#4b5563" }} />
                </div>

                <div className="flex items-center justify-between gap-2 px-3 pt-2">
                  <span className="text-faint text-[0.68rem]">{match.kickoff}</span>
                  <span className="text-faint text-[0.68rem]">
                    {mineHere > 0 ? (
                      <span className="font-semibold text-[#e0a827]">
                        {mineHere} {mineHere === 1 ? "tuyo" : "tuyos"}
                      </span>
                    ) : (
                      "ninguno tuyo"
                    )}
                    {" · "}
                    {home.total + away.total} de la liga
                  </span>
                </div>

                <div className="flex items-center gap-2 px-3 pt-1.5 pb-3 sm:gap-3">
                  <Side
                    name={match.home.name}
                    badge={match.home.badge}
                    color={homeTeam?.color}
                    align="right"
                    count={home}
                    where="casa"
                  />
                  <span className="text-faint shrink-0 text-[0.7rem]">–</span>
                  <Side
                    name={match.away.name}
                    badge={match.away.badge}
                    color={awayTeam?.color}
                    align="left"
                    count={away}
                    where="fuera"
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

/**
 * Un equipo del partido: escudo, nombre, si juega en casa o fuera y cuántos
 * jugadores tuyos tiene. El "fuera" va escrito porque de un vistazo no se sabe
 * quién es el local en una tarjeta que cabe en media pantalla.
 */
function Side({
  name,
  badge,
  color,
  align,
  count,
  where,
}: {
  name: string;
  badge: string | null;
  color?: string;
  align: "left" | "right";
  count: { mine: number; total: number };
  where: "casa" | "fuera";
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2.5 ${
        align === "right" ? "flex-row-reverse text-right" : ""
      }`}
    >
      <span className="relative shrink-0">
        {badge && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={badge} alt="" width={34} height={34} className="object-contain" />
        )}
        {count.mine > 0 && (
          // Dorado, el mismo color con el que sales tú en la clasificación.
          <span
            className="tnum absolute -right-1.5 -bottom-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[0.62rem] font-bold text-black shadow"
            style={{ background: "#e0a827" }}
            title={`Tienes ${count.mine} jugador${count.mine === 1 ? "" : "es"} de este equipo`}
          >
            {count.mine}
          </span>
        )}
      </span>

      <span className="min-w-0">
        <span
          className="block truncate text-[0.92rem] font-semibold"
          style={color ? { color } : undefined}
        >
          {name}
        </span>
        <span className={`text-faint text-[0.62rem] ${where === "fuera" ? "" : "opacity-60"}`}>
          {where === "fuera" ? "✈ fuera" : "en casa"}
          {count.total > 0 ? ` · ${count.total} en la liga` : ""}
        </span>
      </span>
    </div>
  );
}
