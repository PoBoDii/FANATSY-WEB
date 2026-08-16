import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { enrichOdds, getFf } from "@/lib/futbolfantasy";
import { fixturesByClub } from "@/lib/equipos";
import { playersOfTeam, teamHeader, toList, toManager, type Player } from "@/lib/normalize";
import { money, num } from "@/lib/format";
import {
  PROTECTION_DAYS,
  TOO_EXPENSIVE,
  buildCandidate,
  needsDeal,
  outOfTen,
  scoreClause,
  scoreSquad,
  scoreTarget,
} from "@/lib/fichajes";
import { AutoRefresh } from "@/components/AutoRefresh";
import { FichajesList } from "@/components/FichajesList";
import { toCard, type CardData } from "@/components/PlayerCard";
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
   * Al navegador sólo se le manda lo que se pinta: la misma tarjeta que el
   * resto de la web, con el bloque de operación encima.
   *
   * `rank` se rellena después, cuando ya está ordenada la lista: es el puesto
   * en ella, no una propiedad del jugador.
   */
  const toView = (
    c: (typeof all)[number],
    scored: { score: number; reasons: string[] },
    headline: string,
  ): CardData =>
    toCard(c.player, c.odds, c.fixtures, {
      owner: { name: c.owner.name, teamId: c.owner.teamId, isMe: false },
      deal: {
        rank: 0,
        score: outOfTen(scored.score),
        headline,
        opensIn: c.opensSoon && c.opensAt ? opensLabel(c.opensAt) : null,
      },
      note: scored.reasons.slice(0, 2).join(" · ") || null,
    });

  /** "mañana a las 16:54", "el jueves a las 09:00"… */
  function opensLabel(iso: string): string {
    const at = new Date(iso);
    const hoy = new Date();
    const dias = Math.round(
      (new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime() -
        new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()) /
        86_400_000,
    );
    const hora = at.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    if (dias <= 0) return `hoy a las ${hora}`;
    if (dias === 1) return `mañana a las ${hora}`;
    return `el ${at.toLocaleDateString("es-ES", { weekday: "long", day: "numeric" })} a las ${hora}`;
  }

  /** Lo que resume la operación en una línea, distinto en cada lista. */
  const money0 = (v: number) => money(Math.round(v));

  // Entran los abiertos y los que se abren en las próximas horas: si lo miras
  // un martes, quieres ver ya lo que podrás fichar el miércoles.
  const open = all.filter((c) => c.isOpen || c.opensSoon);

  // Las mismas cláusulas, dos preguntas distintas: cuál deja dinero y cuál
  // mejora el once. Casi nunca son el mismo jugador, así que van en listas
  // separadas y cada una con su nota.
  const negocio = open.map((c) =>
    toView(
      c,
      scoreClause(c),
      c.profit > 0
        ? `Ganarías ${money0(c.profit)} en ${PROTECTION_DAYS} días`
        : `Perderías ${money0(-c.profit)} en ${PROTECTION_DAYS} días`,
    ),
  );
  const plantilla = open.map((c) =>
    toView(
      c,
      scoreSquad(c),
      c.player.averagePoints > 0
        ? `${c.player.averagePoints.toFixed(1)} de media`
        : "sin media todavía",
    ),
  );
  const negociar = all
    .filter(needsDeal)
    .map((c) =>
      toView(
        c,
        scoreTarget(c),
        c.isOpen
          ? `Abierta a ×${c.ratio.toFixed(1)} su valor`
          : `Se libera en ${Math.max(1, Math.ceil(c.opensInHours / 24))} días`,
      ),
    );

  // Los que dejan dinero: es el titular real de la sección.
  const profitable = open.filter((c) => c.profit > 0).length;
  const bestProfit = Math.max(0, ...open.map((c) => c.profit));
  const starters = open.filter(
    (c) => c.affordable && (c.odds?.probability ?? 0) >= 70 && c.player.status === "ok",
  ).length;
  const soon = open.filter((c) => c.opensSoon).length;

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
        leagueId={league.id}
        protectionDays={PROTECTION_DAYS}
        tooExpensive={TOO_EXPENSIVE}
      />
    </>
  );
}
