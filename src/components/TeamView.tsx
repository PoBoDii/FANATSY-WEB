import { fantasy, safe } from "@/lib/api";
import {
  lineupPlayers,
  playersOfTeam,
  tacticalFormation,
  teamHeader,
  toList,
  toManager,
  POSITION_LABEL,
  type Player,
  type Position,
} from "@/lib/normalize";
import { enrichOdds, getFf } from "@/lib/futbolfantasy";
import { fixturesByClub } from "@/lib/equipos";
import { squadSwing } from "@/lib/valores";
import { SwingBand } from "./SwingBand";
import { money, num } from "@/lib/format";
import Link from "next/link";
import { PendingLink } from "./PendingLink";
import { PITCH_STATS, Pitch, type PitchStat } from "./Pitch";
import { AutoRefresh } from "./AutoRefresh";
import {
  SortBar,
  SquadHeader,
  SquadRows,
  filterSquad,
  readSortParams,
  sortSquad,
} from "./SquadList";
import { Empty, ErrorBox, PageHeader, PlayerRow, StatTile, type LineupRole } from "./ui";

const ORDER: Position[] = ["PT", "DF", "MC", "DL", "EN", "?"];

/** Mismo código de color que las etiquetas de posición de las listas. */
const POSITION_COLOR: Record<Position, string> = {
  PT: "#d97706",
  DF: "#0284c7",
  MC: "#059669",
  DL: "#e11d48",
  EN: "#7c3aed",
  "?": "#7b8794",
};

/**
 * Vista de plantilla, compartida por "mi equipo" y la de cualquier rival.
 *
 * El nombre del manager no viene en `/v3/leagues/{l}/teams/{t}` (sólo el
 * `managerId`), así que se resuelve con el listado v5 de equipos de la liga.
 */
export async function TeamView({
  leagueId,
  teamId,
  eyebrow,
  view = "once",
  sortParams = {},
  pitchStat = "ahora",
}: {
  leagueId: string;
  teamId: string;
  eyebrow: string;
  view?: "once" | "lista";
  sortParams?: { orden?: string; dir?: string; pos?: string; abiertas?: string };
  /** Qué estadística se enseña en el campo. */
  pitchStat?: PitchStat;
}) {
  const [{ data: teamRaw, error }, { data: lineupRaw }, { data: teamsRaw }, odds] =
    await Promise.all([
      safe(fantasy.team(leagueId, teamId)),
      safe(fantasy.lineup(teamId)),
      safe(fantasy.leagueTeams(leagueId)),
      getFf(),
    ]);

  // La página del club sólo publica el once proyectado; a los suplentes hay
  // que buscarles la probabilidad en su ficha.
  const oddsOf = await enrichOdds(odds, playersOfTeam(teamRaw ?? {}));

  if (error || !teamRaw) {
    return (
      <ErrorBox
        error={error ?? "Respuesta vacía"}
        hint="Comprueba en Diagnóstico que /v3/leagues/{liga}/teams/{equipo} responde."
      />
    );
  }

  const header = teamHeader(teamRaw);
  const squad = playersOfTeam(teamRaw);
  const { starters, bench: benchFromLineup } = lineupPlayers(lineupRaw ?? {});
  const formation = tacticalFormation(lineupRaw ?? {});

  // Ficha del manager desde el listado de la liga (trae nombre y posición).
  const inLeague = toList(teamsRaw)
    .map((raw, i) => toManager(raw, i, teamId))
    .find((m) => m.teamId === teamId);

  const starterIds = new Set(starters.map((p) => p.id));
  const bench = benchFromLineup.length > 0
    ? benchFromLineup
    : squad.filter((p) => !starterIds.has(p.id));

  /** Titular si está en el once de esta jornada; si no, suplente. */
  const roleOf = (player: Player): LineupRole | null =>
    starters.length === 0 ? null : starterIds.has(player.id) ? "titular" : "suplente";

  const totalValue = header.teamValue || squad.reduce((s, p) => s + p.marketValue, 0);
  const alerts = squad.filter((p) => p.status !== "ok").length;

  // Próximo partido de cada club presente en la plantilla, con su dificultad.
  const fixturesOf = await fixturesByClub(squad, oddsOf);
  const swing = squadSwing(squad, oddsOf);

  const { sort, dir, positions, openOnly } = readSortParams(sortParams, "posicion");
  const listed = sortSquad(filterSquad(squad, positions, openOnly), sort, dir, oddsOf);

  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={inLeague?.name ?? header.managerName ?? "Equipo"}
        meta={
          <>
            {squad.length} jugadores
            {formation ? ` · ${formation}` : ""}
            {inLeague ? ` · ${inLeague.position}º de la liga` : ""}
          </>
        }
        action={<AutoRefresh seconds={60} />}
      />

      <div className="border-line grid grid-cols-2 border-b lg:grid-cols-4">
        <StatTile label="Puntos" value={num(header.points)} tone="acid" />
        <StatTile label="Valor del equipo" value={money(totalValue)} delay={60} />
        <StatTile
          label="Saldo"
          value={header.teamMoney ? money(header.teamMoney) : "—"}
          sub={header.teamMoney ? "para fichar" : "no disponible"}
          delay={120}
        />
        <StatTile
          label="Alertas"
          value={num(alerts)}
          sub="lesionados, dudas y sanciones"
          tone={alerts > 0 ? "down" : "neutral"}
          delay={180}
        />
      </div>

      <SwingBand swing={swing} mine />

      <Tabs view={view} />

      {view === "lista" ? (
        <>
          <SquadCounter count={squad.length} />
          <SortBar
            base="/"
            sort={sort}
            dir={dir}
            pos={sortParams.pos}
            openOnly={openOnly}
            extra={{ vista: "lista" }}
          />
          <SquadHeader
            base="/"
            sort={sort}
            dir={dir}
            keep={{ vista: "lista", pos: sortParams.pos, abiertas: openOnly ? "1" : undefined }}
          />
          {listed.length === 0 ? (
            <Empty title="Sin jugadores" hint="Ninguno encaja con este filtro." />
          ) : (
            <SquadRows
              players={listed}
              leagueId={leagueId}
              oddsOf={oddsOf}
              highlight={sort}
              fixturesOf={fixturesOf}
            />
          )}
        </>
      ) : (
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="border-line border-b lg:border-r lg:border-b-0">
          {starters.length > 0 ? (
            <Pitch
              players={starters}
              formation={formation}
              leagueId={leagueId}
              oddsOf={oddsOf}
              stat={pitchStat}
              selector={<PitchStatPicker active={pitchStat} />}
            />
          ) : (
            <Empty
              title="Sin alineación"
              hint="Aún no hay un once para esta jornada. Aparecerá en cuanto se alinee el equipo."
            />
          )}

          {bench.length > 0 && (
            <div className="border-line border-t">
              <div className="bg-ink mx-2.5 mt-2.5 rounded-xl px-3.5 py-2 text-[0.74rem] font-bold tracking-wide text-white uppercase shadow-sm sm:mx-3 sm:mt-3 sm:px-4">
                {benchFromLineup.length > 0 ? "Banquillo" : "Sin alinear"} · {bench.length}
              </div>
              <div className="space-y-2 p-2.5 sm:p-3">
                {bench.map((p, i) => (
                  <PlayerRow
                    key={p.id}
                    player={p}
                    leagueId={leagueId}
                    odds={oddsOf(p)}
                    compact
                    delay={i * 30}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <SquadCounter count={squad.length} />

          {squad.length === 0 ? (
            <Empty title="Plantilla vacía" hint="Todavía no hay jugadores fichados." />
          ) : (
            ORDER.map((pos) => {
              const group = squad
                .filter((p) => p.position === pos)
                .sort((a, b) => b.marketValue - a.marketValue);
              if (group.length === 0) return null;
              return (
                <div key={pos}>
                  <div
                    className="sticky top-0 z-10 mx-2.5 mt-2.5 flex items-baseline justify-between rounded-xl px-3.5 py-2 text-white shadow-sm sm:mx-3 sm:mt-3 sm:px-4"
                    style={{
                      background: `linear-gradient(100deg, ${POSITION_COLOR[pos]}, ${POSITION_COLOR[pos]}cc)`,
                    }}
                  >
                    <span className="text-[0.74rem] font-bold tracking-wide uppercase">
                      {POSITION_LABEL[pos]} · {group.length}
                    </span>
                    <span className="tnum text-xs font-bold">
                      {money(group.reduce((s, p) => s + p.marketValue, 0))}
                    </span>
                  </div>
                  <div className="space-y-2 p-2.5 sm:p-3">
                    {group.map((p, i) => (
                      <PlayerRow
                        key={p.id}
                        player={p}
                        leagueId={leagueId}
                        odds={oddsOf(p)}
                        role={roleOf(p)}
                        compact
                        delay={i * 25}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      )}
    </>
  );
}

/**
 * Selector de qué se enseña bajo cada jugador del campo. Va por URL, así que
 * funciona sin JavaScript y se puede compartir el enlace.
 */
function PitchStatPicker({ active }: { active: PitchStat }) {
  return (
    <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1">
      {PITCH_STATS.map((option) => (
        <Link
          key={option.key}
          href={`/?stat=${option.key}`}
          scroll={false}
          className={`shrink-0 rounded-full px-2.5 py-1 text-[0.68rem] font-medium transition-colors ${
            active === option.key
              ? "bg-white text-[#1c5c3a] shadow-sm"
              : "bg-black/25 text-white/80 hover:bg-black/35"
          }`}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

/** Once titular contra lista completa. Va por URL para poder compartirla. */
function Tabs({ view }: { view: "once" | "lista" }) {
  const tab = (mine: "once" | "lista", label: string, href: string) => (
    <PendingLink
      href={href}
      scroll={false}
      className={`flex-1 border-b-2 px-4 py-3 text-center transition-colors ${
        view === mine
          ? "border-acid text-acid"
          : "border-transparent text-faint hover:text-muted"
      }`}
    >
      <span className="display text-base">{label}</span>
    </PendingLink>
  );

  return (
    <div className="border-line flex border-b">
      {tab("once", "Once titular", "/")}
      {tab("lista", "Todos mis jugadores", "/?vista=lista")}
    </div>
  );
}

/** Límite de jugadores por plantilla en LaLiga Fantasy. */
const SQUAD_LIMIT = 24;

/**
 * Ocupación de la plantilla. Se pone en rojo al llegar al tope porque a partir
 * de ahí no se puede fichar sin vender antes.
 */
function SquadCounter({ count }: { count: number }) {
  const full = count >= SQUAD_LIMIT;
  const nearly = !full && count >= SQUAD_LIMIT - 2;
  const pct = Math.min(100, (count / SQUAD_LIMIT) * 100);

  return (
    <div
      className={`border-line rise border-b px-3.5 py-3 sm:px-5 sm:py-3.5 lg:px-6 ${full ? "bg-down/10" : ""}`}
    >
      <div className="flex items-baseline justify-between">
        <span className={`label ${full ? "text-down" : ""}`}>Plantilla</span>
        <span className="tnum">
          <span
            className={`text-[1.35rem] leading-none ${
              full ? "text-down" : nearly ? "text-warn" : "text-ink"
            }`}
          >
            {count}
          </span>
          <span className="text-faint text-sm">/{SQUAD_LIMIT}</span>
        </span>
      </div>

      <div className="bg-panel-2 mt-2.5 h-1 w-full overflow-hidden">
        <div
          className={`h-full ${full ? "bg-down" : nearly ? "bg-warn" : "bg-acid"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {full && (
        <p className="text-down mt-2 text-[0.7rem]">
          Plantilla llena: para fichar tienes que vender antes.
        </p>
      )}
    </div>
  );
}
