import Link from "next/link";
import { PendingLink } from "@/components/PendingLink";
import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { enrichOdds, getFf } from "@/lib/futbolfantasy";
import { fixturesByClub } from "@/lib/equipos";
import { playersOfTeam, teamHeader, toList, toManager } from "@/lib/normalize";
import { squadSwing } from "@/lib/valores";
import { SwingBand } from "@/components/SwingBand";
import { BackLink } from "@/components/BackLink";
import { money, num } from "@/lib/format";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Empty, ErrorBox, PageHeader, StatTile } from "@/components/ui";
import { FfLink } from "@/components/FfLink";
import { FF_MARKET_URL } from "@/lib/odds";
import { clauseIsOpen } from "@/components/SquadList";
import { SquadBrowser } from "@/components/SquadBrowser";
import { toCard } from "@/components/PlayerCard";
import { TeamView } from "@/components/TeamView";

export const dynamic = "force-dynamic";

/**
 * Plantilla de un rival: sólo la lista, sin campo ni alineación. Lo que
 * interesa de otro manager es a quién tiene y por cuánto se le puede clausular,
 * no cómo alinea.
 *
 * Si el equipo es el mío, se reutiliza la vista completa con campo.
 */
export default async function EquipoPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ vista?: string }>;
}) {
  const { teamId } = await params;
  const query = await searchParams;

  const session = await getSession();
  if (!session.active)
    return <Empty title="Todavía sin liga" hint="Los detalles, en Mi plantilla." />;

  const league = session.active;

  if (league.myTeamId === teamId) {
    return (
      <>
        <Back />
        <TeamView leagueId={league.id} teamId={teamId} eyebrow="Tu equipo" />
      </>
    );
  }

  const [{ data: teamRaw, error }, { data: teamsRaw }, ff] = await Promise.all([
    safe(fantasy.team(league.id, teamId)),
    safe(fantasy.leagueTeams(league.id)),
    getFf(),
  ]);

  if (error || !teamRaw) return <ErrorBox error={error ?? "Respuesta vacía"} />;

  const header = teamHeader(teamRaw);
  const squad = playersOfTeam(teamRaw);

  const inLeague = toList(teamsRaw)
    .map((raw, i) => toManager(raw, i, teamId))
    .find((m) => m.teamId === teamId);

  const now = Date.now();
  const openClauses = squad.filter(
    (p) => p.buyoutClause && (!p.buyoutUnlockAt || new Date(p.buyoutUnlockAt).getTime() <= now),
  ).length;

  const oddsOf = await enrichOdds(ff, squad);
  const fixturesOf = await fixturesByClub(squad, oddsOf);
  const swing = squadSwing(squad, oddsOf);

  // Pestaña de cláusulas abiertas: mismo listado, pero sólo los fichables ya.
  const onlyOpen = query.vista === "clausulas";
  const cards = squad
    .filter((p) => !onlyOpen || clauseIsOpen(p))
    .map((p) => toCard(p, oddsOf(p), fixturesOf(p)));

  return (
    <>
      <Back />
      <PageHeader
        eyebrow="Rival"
        title={inLeague?.name ?? header.managerName ?? "Equipo"}
        meta={
          <>
            {squad.length} jugadores
            {inLeague ? ` · ${inLeague.position}º de la liga · ${num(inLeague.points)} pts` : ""}
          </>
        }
        action={
          <div className="flex items-center gap-2">
            <FfLink href={FF_MARKET_URL} label="Ver el mercado en futbolfantasy" />
            <AutoRefresh seconds={900} />
          </div>
        }
      />

      <div className="border-line grid grid-cols-2 border-b lg:grid-cols-4">
        <StatTile
          label="Cláusulas abiertas"
          value={num(openClauses)}
          sub={openClauses ? "fichables ahora" : "todas blindadas"}
          tone={openClauses > 0 ? "up" : "neutral"}
        />
        <StatTile
          label="Valor del equipo"
          value={money(header.teamValue || squad.reduce((s, p) => s + p.marketValue, 0))}
          delay={60}
        />
        <StatTile
          label="Coste de clausular todo"
          value={money(squad.reduce((s, p) => s + (p.buyoutClause ?? 0), 0))}
          delay={120}
        />
        <StatTile label="Puntos" value={num(header.points)} tone="acid" delay={180} />
      </div>

      <SwingBand swing={swing} />

      <RivalTabs teamId={teamId} onlyOpen={onlyOpen} total={squad.length} open={openClauses} />

      <SquadBrowser
        cards={cards}
        leagueId={league.id}
        emptyHint={
          onlyOpen
            ? "Ahora mismo todos sus jugadores están blindados."
            : "Ninguno encaja con este filtro."
        }
      />
    </>
  );
}

/**
 * Las dos vistas de un rival. La segunda repite lo que hace el filtro
 * "Cláusula abierta", pero como pestaña: es lo que más se mira de otro manager
 * y no debería costar dos clics.
 */
function RivalTabs({
  teamId,
  onlyOpen,
  total,
  open,
}: {
  teamId: string;
  onlyOpen: boolean;
  total: number;
  open: number;
}) {
  const tab = (mine: boolean, label: string, count: number, href: string, tone: string) => (
    <PendingLink
      href={href}
      scroll={false}
      className={`flex-1 border-b-2 px-4 py-3 text-center transition-colors ${
        mine === onlyOpen
          ? `${tone} border-current`
          : "border-transparent text-faint hover:text-muted"
      }`}
    >
      <span className="display text-base">{label}</span>
      <span className="tnum ml-2 text-sm">{num(count)}</span>
    </PendingLink>
  );

  return (
    <div className="border-line flex border-b">
      {tab(false, "Todos los jugadores", total, `/equipo/${teamId}`, "text-acid")}
      {tab(true, "Cláusulas abiertas", open, `/equipo/${teamId}?vista=clausulas`, "text-down")}
    </div>
  );
}

function Back() {
  return (
    <div className="border-line border-b px-6 pt-6 lg:px-10">
      <BackLink href="/liga" label="Clasificación" />
    </div>
  );
}
