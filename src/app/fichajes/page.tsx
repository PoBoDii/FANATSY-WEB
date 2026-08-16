import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { enrichOdds, getFf } from "@/lib/futbolfantasy";
import { difficultyTone, fixturesByClub } from "@/lib/equipos";
import { playersOfTeam, teamHeader, toList, toManager, type Player } from "@/lib/normalize";
import { money, num } from "@/lib/format";
import {
  PROTECTION_DAYS,
  TOO_EXPENSIVE,
  buildCandidate,
  needsDeal,
  scoreClause,
  scoreSquad,
  scoreTarget,
} from "@/lib/fichajes";
import { ffBadge } from "@/lib/odds";
import { AutoRefresh } from "@/components/AutoRefresh";
import { FichajesList, type CandidateView } from "@/components/FichajesList";
import { Empty, PageHeader, StatTile } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FichajesPage() {
  const session = await getSession();
  if (!session.active) {
    return (
      <Empty
        title="Todavía sin liga"
        hint="Los fichajes dependen de la liga en la que juegues. Los detalles, en Mi plantilla."
      />
    );
  }

  const league = session.active;
  const [{ data: teamsRaw, error }, { data: myTeamRaw }, ff] = await Promise.all([
    safe(fantasy.leagueTeams(league.id)),
    league.myTeamId
      ? safe(fantasy.team(league.id, league.myTeamId))
      : Promise.resolve({ data: null, error: null }),
    getFf(),
  ]);

  if (error) {
    return (
      <>
        <PageHeader eyebrow="Fichajes" title="Operaciones" />
        <Empty title="No se pudo leer la liga" hint={error} />
      </>
    );
  }

  // Mi saldo: decide qué cláusulas puedo pagar de verdad hoy.
  const budget = { money: teamHeader(myTeamRaw ?? {}).teamMoney ?? 0 };

  // Todos los jugadores de la liga que NO son míos, con su dueño.
  const rivals: { player: Player; owner: { name: string; teamId: string } }[] = [];
  toList(teamsRaw).forEach((raw, i) => {
    const manager = toManager(raw, i, league.myTeamId);
    if (manager.isMe) return;
    for (const player of playersOfTeam(raw)) {
      rivals.push({ player, owner: { name: manager.name, teamId: manager.teamId } });
    }
  });

  const players = rivals.map((r) => r.player);
  const oddsOf = await enrichOdds(ff, players, 60);
  const fixturesOf = await fixturesByClub(players, oddsOf);

  const all = rivals
    .map((r) => buildCandidate(r.player, r.owner, oddsOf(r.player), fixturesOf(r.player), budget))
    .filter((c): c is NonNullable<typeof c> => c !== null);

  /**
   * Al navegador sólo se le manda lo que se pinta. Enviar los objetos enteros
   * del servidor doblaba el tamaño de la página para nada.
   */
  const toView = (
    c: (typeof all)[number],
    scored: { score: number; reasons: string[] },
  ): CandidateView => {
    // Los tres siguientes de liga: es el calendario que decide un fichaje.
    const next3 = (c.fixtures ?? [])
      .filter((f) => /liga/i.test(f.competition))
      .slice(0, 3)
      .map((f) => {
        const rival = f.atHome ? f.away : f.home;
        const tone = difficultyTone(f.difficulty);
        return {
          name: rival.name,
          badge: rival.badge,
          atHome: f.atHome,
          bg: tone.bg,
          label: tone.label,
        };
      });

    return {
      id: c.player.id,
      name: c.player.name,
      position: c.player.position,
      photo: c.player.image,
      badge: c.player.clubBadge ?? ffBadge(c.odds?.teamId ?? null),
      status: c.player.status,
      points: c.player.points,
      average: c.player.averagePoints,
      ownerName: c.owner.name,
      ownerTeamId: c.owner.teamId,
      probability: c.odds?.probability ?? null,
      value: c.value,
      clause: c.clause,
      premium: c.premium,
      premiumPct: c.premiumPct,
      ratio: c.ratio,
      dailyRise: c.dailyRise,
      adjustedRise: c.adjustedRise,
      momentum: c.momentum,
      profit: c.profit,
      profitSafe: c.profitSafe,
      floorToday: c.floorToday,
      roi: c.roi,
      daysToBreakEven: c.daysToBreakEven,
      opensInHours: c.opensInHours,
      opensAt: c.opensAt,
      isOpen: c.isOpen,
      opensSoon: c.opensSoon,
      affordable: c.affordable,
      score: scored.score,
      reasons: scored.reasons,
      next3,
    };
  };

  // Entran los abiertos y los que se abren en las próximas horas: si lo miras
  // un martes, quieres ver ya lo que podrás fichar el miércoles.
  const open = all.filter((c) => c.isOpen || c.opensSoon);

  // Las mismas cláusulas, dos preguntas distintas: cuál deja dinero y cuál
  // mejora el once. Casi nunca son el mismo jugador, así que van en listas
  // separadas y cada una con su nota.
  const negocio = open.map((c) => toView(c, scoreClause(c)));
  const plantilla = open.map((c) => toView(c, scoreSquad(c)));
  const negociar = all.filter(needsDeal).map((c) => toView(c, scoreTarget(c)));

  // Los que dejan dinero: es el titular real de la sección.
  const profitable = negocio.filter((c) => c.profit > 0).length;
  const bestProfit = Math.max(0, ...negocio.map((c) => c.profit));
  const starters = plantilla.filter(
    (c) => c.affordable && (c.probability ?? 0) >= 70 && c.status === "ok",
  ).length;
  const soon = negocio.filter((c) => c.opensSoon).length;

  return (
    <>
      <PageHeader
        eyebrow="Fichajes"
        title="Operaciones"
        meta={
          <>
            {negocio.length} cláusulas abiertas · {negociar.length} a negociar · saldo{" "}
            {money(budget.money)}
          </>
        }
        action={<AutoRefresh seconds={180} />}
      />

      <div className="border-line grid grid-cols-2 border-b lg:grid-cols-4">
        <StatTile
          label="Dan dinero"
          value={num(profitable)}
          sub={`de ${negocio.length} · hasta ${money(bestProfit)}`}
          tone={profitable > 0 ? "up" : "neutral"}
        />
        <StatTile
          label="Titulares fichables"
          value={num(starters)}
          sub="70%+ de jugar y pagables"
          tone="acid"
          delay={60}
        />
        <StatTile label="Se abren pronto" value={num(soon)} sub="en las próximas 48 h" delay={120} />
        <StatTile label="Tu saldo" value={money(budget.money)} delay={180} />
      </div>

      <FichajesList
        negocio={negocio}
        plantilla={plantilla}
        negociar={negociar}
        protectionDays={PROTECTION_DAYS}
        tooExpensive={TOO_EXPENSIVE}
      />
    </>
  );
}
