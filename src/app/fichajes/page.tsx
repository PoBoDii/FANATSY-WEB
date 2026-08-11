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
  scoreTarget,
} from "@/lib/fichajes";
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
    const next = (c.fixtures ?? []).find((f) => /liga/i.test(f.competition));
    const rivalTeam = next ? (next.atHome ? next.away : next.home) : null;
    const tone = next ? difficultyTone(next.difficulty) : null;

    return {
      id: c.player.id,
      name: c.player.name,
      position: c.player.position,
      photo: c.player.image,
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
      rival:
        rivalTeam && tone && next
          ? {
              name: rivalTeam.name,
              badge: rivalTeam.badge,
              atHome: next.atHome,
              bg: tone.bg,
              ink: tone.ink,
            }
          : null,
    };
  };

  // Entran los abiertos y los que se abren en las próximas horas: si lo miras
  // un martes, quieres ver ya lo que podrás fichar el miércoles.
  const clausulazos = all
    .filter((c) => c.isOpen || c.opensSoon)
    .map((c) => toView(c, scoreClause(c)));
  const negociar = all.filter(needsDeal).map((c) => toView(c, scoreTarget(c)));

  // Los que dejan dinero: es el titular real de la sección.
  const profitable = clausulazos.filter((c) => c.profit > 0).length;
  const bestProfit = Math.max(0, ...clausulazos.map((c) => c.profit));
  const affordable = clausulazos.filter((c) => c.affordable).length;
  const soon = clausulazos.filter((c) => c.opensSoon).length;

  return (
    <>
      <PageHeader
        eyebrow="Fichajes"
        title="Operaciones"
        meta={
          <>
            {clausulazos.length} cláusulas abiertas · {negociar.length} a negociar · saldo{" "}
            {money(budget.money)}
          </>
        }
        action={<AutoRefresh seconds={180} />}
      />

      <div className="border-line grid grid-cols-2 border-b lg:grid-cols-4">
        <StatTile
          label="Dan dinero"
          value={num(profitable)}
          sub={`de ${clausulazos.length} · hasta ${money(bestProfit)}`}
          tone={profitable > 0 ? "up" : "neutral"}
        />
        <StatTile
          label="Puedes pagarlas"
          value={num(affordable)}
          sub={`de ${clausulazos.length} abiertas`}
          tone="acid"
          delay={60}
        />
        <StatTile label="Se abren pronto" value={num(soon)} sub="en las próximas 48 h" delay={120} />
        <StatTile label="Tu saldo" value={money(budget.money)} delay={180} />
      </div>

      <FichajesList
        clausulazos={clausulazos}
        negociar={negociar}
        protectionDays={PROTECTION_DAYS}
        tooExpensive={TOO_EXPENSIVE}
      />
    </>
  );
}
