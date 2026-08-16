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
import { FfLink } from "./FfLink";
import { ffLineupsUrl } from "@/lib/odds";
import { bestEleven, rate, type FormationOption } from "@/lib/once-ideal";
import { AutoRefresh } from "./AutoRefresh";
import { NextRival } from "./Fixtures";
import type { Fixture } from "@/lib/equipos";
import { SquadBrowser } from "./SquadBrowser";
import { Empty, ErrorBox, OddsChip, PageHeader, PlayerAvatar, StatTile, type LineupRole } from "./ui";
import { PlayerCard, toCard } from "./PlayerCard";

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
  formationWanted = null,
}: {
  leagueId: string;
  teamId: string;
  eyebrow: string;
  view?: "once" | "lista" | "ideal";
  sortParams?: { orden?: string; dir?: string; pos?: string; abiertas?: string };
  /** Qué estadística se enseña en el campo. */
  pitchStat?: PitchStat;
  /** Formación elegida a mano en el once ideal; si no, la mejor. */
  formationWanted?: string | null;
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

  // El once que más puntos debería dar con lo que tengo en plantilla. Si se ha
  // pedido una formación concreta se monta esa, pero se guarda cuál era la
  // mejor para poder señalarla en el selector.
  const rated = squad
    .filter((p) => p.position !== "EN")
    .map((p) => rate(p, oddsOf(p), fixturesOf(p)));
  const best = bestEleven(rated);
  const ideal = formationWanted ? bestEleven(rated, formationWanted) : best;

  /**
   * Una sola vez y ya aplanado: la lista filtra y ordena en el navegador, así
   * que lo que viaja tiene que ser lo mínimo. El mapa evita recalcular la misma
   * tarjeta en las tres vistas.
   */
  const cardIndex = new Map(squad.map((p) => [p.id, toCard(p, oddsOf(p), fixturesOf(p))]));
  const cardOf = (player: Player) => cardIndex.get(player.id)!;
  const cards = [...cardIndex.values()];

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
        action={
          <div className="flex items-center gap-2">
            {/* Las probabilidades del once salen de aquí. */}
            <FfLink href={ffLineupsUrl()} label="Ver las alineaciones probables en futbolfantasy" />
            <AutoRefresh seconds={180} />
          </div>
        }
      />

      {/* Resumen del equipo. En el móvil sólo acompaña al once titular: en las
          otras dos pestañas hay que bajar media pantalla antes de ver nada, y
          lo que se viene a mirar allí es la lista, no el saldo. */}
      <div className={view === "once" ? "" : "hidden lg:block"}>
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
      </div>

      <Tabs view={view} />

      {view === "ideal" ? (
        <IdealView
          ideal={ideal}
          best={best?.formation ?? null}
          rated={rated}
          starters={starterIds}
          starterList={starters}
          leagueId={leagueId}
          oddsOf={oddsOf}
          fixturesOf={fixturesOf}
        />
      ) : view === "lista" ? (
        <>
          <SquadCounter count={squad.length} />
          <SquadBrowser cards={cards} leagueId={leagueId} />
        </>
      ) : (
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="border-line border-b lg:border-r lg:border-b-0">
          {starters.length > 0 ? (
            <Pitch
              players={starters}
              formation={formation}
              leagueId={leagueId}
              oddsOf={oddsOf}
              fixturesOf={fixturesOf}
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
              <GroupTitle
                label={benchFromLineup.length > 0 ? "Banquillo" : "Sin alinear"}
                count={bench.length}
              />
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2 p-2.5 sm:p-3">
                {bench.map((p, i) => (
                  <PlayerCard
                    key={p.id}
                    card={cardOf(p)}
                    leagueId={leagueId}
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
                  <GroupTitle
                    label={POSITION_LABEL[pos]}
                    count={group.length}
                    color={POSITION_COLOR[pos]}
                    right={money(group.reduce((s, p) => s + p.marketValue, 0))}
                  />
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-2 p-2.5 sm:p-3">
                    {group.map((p, i) => (
                      <PlayerCard
                        key={p.id}
                        card={{
                          ...cardOf(p),
                          note:
                            roleOf(p) === "suplente" ? "no está en tu once de esta jornada" : null,
                        }}
                        leagueId={leagueId}
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
 * Rótulo de grupo. Un punto de color, el nombre y la cuenta: lo justo para
 * separar dos bloques. Las franjas de color a todo lo ancho pesaban más que los
 * jugadores que separaban.
 */
function GroupTitle({
  label,
  count,
  color,
  right,
}: {
  label: string;
  count: number;
  color?: string;
  right?: string;
}) {
  return (
    <div className="border-line bg-void/80 sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-3.5 py-2 backdrop-blur-md sm:px-4">
      <span className="flex items-center gap-2">
        {color && (
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: color }}
          />
        )}
        <span className="text-[0.82rem] font-semibold">{label}</span>
        <span className="tnum text-faint text-[0.78rem]">{count}</span>
      </span>
      {right && <span className="tnum text-faint text-[0.78rem]">{right}</span>}
    </div>
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
              ? "bg-panel text-[#1c5c3a] shadow-sm"
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
function Tabs({ view }: { view: "once" | "lista" | "ideal" }) {
  const tab = (mine: "once" | "lista" | "ideal", label: string, href: string) => (
    <PendingLink
      href={href}
      scroll={false}
      className={`flex-1 border-b-2 px-1.5 py-3 text-center transition-colors sm:px-4 ${
        view === mine
          ? "border-acid text-acid"
          : "border-transparent text-faint hover:text-muted"
      }`}
    >
      <span className="display text-[0.88rem] sm:text-base">{label}</span>
    </PendingLink>
  );

  return (
    <div className="border-line flex border-b">
      {tab("once", "Once titular", "/")}
      {tab("ideal", "Once ideal", "/?vista=ideal")}
      {tab("lista", "Todos mis jugadores", "/?vista=lista")}
    </div>
  );
}

/**
 * El once ideal: el campo con la mejor combinación posible y, debajo, por qué
 * esa formación y no otra.
 */
function IdealView({
  ideal,
  best,
  rated,
  starters,
  starterList,
  leagueId,
  oddsOf,
  fixturesOf,
}: {
  ideal: ReturnType<typeof bestEleven>;
  /** La formación que sale sola, para marcarla aunque estés viendo otra. */
  best: string | null;
  rated: ReturnType<typeof rate>[];
  starters: Set<string>;
  /** Tu once de esta jornada, para poder decir a quién hay que quitar. */
  starterList: Player[];
  leagueId: string;
  oddsOf: (player: Player) => ReturnType<typeof rate>["odds"];
  fixturesOf: (player: Player) => Fixture[] | null;
}) {
  if (!ideal) {
    return (
      <Empty
        title="Todavía no se puede montar un once"
        hint="Hace falta al menos un portero y jugadores suficientes en cada línea."
      />
    );
  }

  const xpOf = new Map(ideal.players.map((r) => [r.player.id, r.xp]));
  const changes = ideal.players.filter((r) => !starters.has(r.player.id));

  // Bajo la ficha del campo no cabe la explicación entera, sólo el motivo.
  const forced = new Map(ideal.forced.map((r) => [r.player.id, shortReason(r.note)]));

  // El banquillo es todo lo que no entra en el once, disponibles primero. Los
  // lesionados y sancionados también se quedan aquí, marcados: no entran al
  // once, pero siguen siendo tuyos y hay que verlos.
  const chosen = new Set(ideal.players.map((r) => r.player.id));
  const bench = rated
    .filter((r) => !chosen.has(r.player.id))
    .sort((a, b) => Number(a.unavailable) - Number(b.unavailable) || b.xp - a.xp);

  /**
   * A quién hay que sacar por cada uno que entra.
   *
   * Se emparejan por puesto siempre que se pueda: si entra un defensa, sale el
   * peor de tus defensas. Cuando la formación cambia no hay pareja exacta y se
   * coge al siguiente peor, que es igual lo que hay que hacer en el juego.
   */
  const rateOf = new Map(rated.map((r) => [r.player.id, r]));
  const droppable = starterList
    .filter((p) => !chosen.has(p.id))
    .map((p) => rateOf.get(p.id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)
    .sort((a, b) => a.xp - b.xp);

  const taken = new Set<string>();
  const drops = changes.map((inc) => {
    const same = droppable.find(
      (o) => !taken.has(o.player.id) && o.player.position === inc.player.position,
    );
    const pick = same ?? droppable.find((o) => !taken.has(o.player.id));
    if (pick) taken.add(pick.player.id);
    return pick ?? null;
  });

  /** Los que hay que sacar, para marcarlos también en el banquillo. */
  const dropped = taken;

  return (
    <>
      <div className="border-line grid grid-cols-2 border-b lg:grid-cols-4">
        <StatTile label="Formación" value={ideal.formation} tone="acid" />
        <StatTile
          label="Puntos esperados"
          value={ideal.xp.toFixed(1)}
          sub="del once entero"
          delay={60}
        />
        <StatTile
          label="Cambios"
          value={num(changes.length)}
          sub={changes.length === 0 ? "ya lo tienes puesto" : "respecto a tu once"}
          tone={changes.length > 0 ? "down" : "up"}
          delay={120}
        />
        <StatTile
          label={ideal.missing > 0 ? "Puestos sin cubrir" : "Titulares seguros"}
          value={
            ideal.missing > 0
              ? num(ideal.missing)
              : num(ideal.players.filter((r) => r.plays >= 0.8).length)
          }
          sub={ideal.missing > 0 ? "nadie que vaya a jugar" : "de 11"}
          tone={ideal.missing > 0 ? "down" : "neutral"}
          delay={180}
        />
      </div>

      <FormationPicker
        options={ideal.options}
        active={ideal.formation}
        best={best}
      />

      <Pitch
        players={ideal.players.map((r) => r.player)}
        formation={ideal.formation}
        leagueId={leagueId}
        oddsOf={oddsOf}
        fixturesOf={fixturesOf}
        xpOf={(p) => xpOf.get(p.id) ?? null}
        alreadyIn={starters}
        outOf={(p) => forced.get(p.id) ?? null}
        title="Once ideal"
        maxWidth="mx-auto max-w-3xl"
        stat="ideal"
      />

      {/* Lo que falta en la plantilla, dicho como lo que hay que hacer: ir al
          mercado a por un puesto concreto. */}
      {ideal.gaps.length > 0 && (
        <div className="space-y-2.5 px-3.5 pb-4 sm:px-6 lg:px-10">
          {ideal.gaps.map((gap) => (
            <div
              key={`${gap.position}-${gap.kind}`}
              className={`flex items-start gap-3 rounded-2xl border p-3.5 sm:p-4 ${
                gap.kind === "hueco"
                  ? "border-down/60 bg-down-soft"
                  : "border-warn/60 bg-warn-soft"
              }`}
            >
              <span
                className="mt-[2px] inline-flex h-7 w-9 shrink-0 items-center justify-center rounded-lg text-[0.62rem] font-bold text-white"
                style={{ background: POSITION_COLOR[gap.position] }}
              >
                {gap.position}
              </span>
              <div className="min-w-0">
                <h3
                  className={`display text-[0.98rem] ${
                    gap.kind === "hueco" ? "text-down" : "text-warn"
                  }`}
                >
                  {gap.title}
                </h3>
                <p className="text-muted mt-1 text-[0.78rem] leading-snug">{gap.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Los que se quedan fuera, con el porqué */}
      {bench.length > 0 && (
        <div className="px-3.5 pb-2 sm:px-6 lg:px-10">
          <h3 className="label mb-2.5">En el banquillo · {bench.length}</h3>
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            {bench.map((r) => (
              <div
                key={r.player.id}
                className={`relative rounded-xl border p-2 text-center sm:w-[104px] ${
                  dropped.has(r.player.id)
                    ? "border-down bg-down/10"
                    : r.unavailable
                      ? "border-down/50 bg-down-soft"
                      : "border-line bg-panel"
                }`}
              >
                {/* Al que baja se le marca igual que al que sube: si arriba
                    pone ENTRA, aquí tiene que poner SALE. */}
                {dropped.has(r.player.id) && (
                  <span className="bg-down absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-full px-1.5 py-[1px] text-[0.5rem] font-bold text-white shadow">
                    SALE
                  </span>
                )}
                <Link
                  href={`/jugador/${r.player.id}`}
                  className="absolute inset-0"
                  aria-label={r.player.name}
                />
                <div className="mx-auto w-fit">
                  <PlayerAvatar player={r.player} size={44} className="h-11 w-11" />
                </div>
                <div className="mt-1.5 truncate text-[0.68rem] leading-tight font-bold">
                  {r.player.name}
                </div>
                <div className="mt-1 flex justify-center">
                  <OddsChip odds={r.odds} />
                </div>
                <div className="mt-1 flex justify-center">
                  <NextRival fixtures={r.fixtures} size="sm" />
                </div>
                <div
                  className={`mt-1 text-[0.58rem] leading-tight ${
                    r.unavailable ? "text-down font-semibold" : "text-faint"
                  }`}
                >
                  {r.unavailable
                    ? (r.note || "no disponible")
                    : `${r.xp.toFixed(1)} pts${r.note ? ` · ${r.note.split(" · ")[0]}` : ""}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-3.5 pb-6 sm:px-6 lg:px-10">
        {changes.length > 0 && (
          <div className="border-line mt-4 rounded-2xl border p-4">
            <h3 className="display text-base">
              {changes.length === 1 ? "Un cambio" : `${changes.length} cambios`} respecto a tu once
            </h3>

            {/* Emparejados: a quién metes y a quién sacas por él. Decir sólo
                quién entra deja la mitad del trabajo sin hacer. */}
            <ul className="mt-3 space-y-2.5">
              {changes.map((r, i) => {
                const out = drops[i] ?? null;
                return (
                  <li
                    key={r.player.id}
                    className="grid grid-cols-[minmax(0,1fr)] gap-1.5 sm:grid-cols-2 sm:items-start sm:gap-4"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-up text-[0.7rem] font-bold">ENTRA</span>
                      <span className="min-w-0">
                        <span className="text-[0.86rem] font-semibold">{r.player.name}</span>
                        <span className="text-faint ml-1.5 text-[0.74rem]">
                          {r.xp.toFixed(1)} pts{r.note ? ` · ${r.note.split(" · ")[0]}` : ""}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-down text-[0.7rem] font-bold">SALE</span>
                      {out ? (
                        <span className="min-w-0">
                          <span className="text-[0.86rem] font-semibold">{out.player.name}</span>
                          <span className="text-faint ml-1.5 text-[0.74rem]">
                            {out.xp.toFixed(1)} pts
                            {out.note ? ` · ${out.note.split(" · ")[0]}` : ""}
                          </span>
                        </span>
                      ) : (
                        <span className="text-faint text-[0.78rem]">
                          tu once tiene un hueco libre
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <p className="text-faint mt-4 text-[0.76rem]">
          Los puntos esperados salen de la probabilidad de ser titular multiplicada por lo que
          suele dar cada puesto: portería a cero y despejes atrás, la mezcla en el centro, y goles
          y asistencias arriba. La portería a cero se estima con la dificultad del próximo rival.
          Con la liga sin empezar se tira de la temporada pasada y de la jerarquía, así que irá
          afinándose jornada a jornada. Los lesionados y sancionados no cuentan para el once: sólo
          ocupan una casilla si no queda absolutamente nadie más para ese puesto.
        </p>
      </div>
    </>
  );
}

/** El motivo, en dos palabras, para que quepa debajo de la ficha del campo. */
function shortReason(note: string): string {
  if (note.startsWith("ya no está")) return "vendido";
  if (note.startsWith("0%")) return "no juega";
  return note.split(" · ")[0].split(":")[0];
}

/**
 * Selector de formación. Enseña lo que daría cada una y deja verla montada en
 * el campo, que es la única forma de decidir si compensa el 3-4-3.
 *
 * Va por URL, así que se puede compartir el enlace y funciona sin JavaScript.
 */
function FormationPicker({
  options,
  active,
  best,
}: {
  options: FormationOption[];
  active: string;
  best: string | null;
}) {
  return (
    <div className="border-line border-b px-3.5 py-3 sm:px-6 lg:px-10">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="label">Qué da cada formación</h3>
        <span className="text-faint text-[0.7rem]">toca una para verla en el campo</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {options.map((o) => {
          const on = o.formation === active;
          return (
            <PendingLink
              key={o.formation}
              href={`/?vista=ideal&formacion=${o.formation}`}
              scroll={false}
              className={`tnum flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[0.8rem] transition-colors sm:justify-start ${
                on
                  ? "border-acid bg-acid/15 text-acid font-bold"
                  : "border-line text-muted hover:border-faint hover:text-ink"
              }`}
            >
              <span>{o.formation}</span>
              <span className="flex items-center gap-1.5">
                <span className={on ? "" : "opacity-70"}>{o.xp.toFixed(1)}</span>
                {o.formation === best && (
                  <span className="bg-acid rounded-full px-1.5 py-[1px] text-[0.55rem] font-bold text-white">
                    MEJOR
                  </span>
                )}
                {!o.complete && (
                  <span
                    className="bg-down/20 text-down rounded-full px-1.5 py-[1px] text-[0.55rem] font-bold"
                    title={
                      o.missing === 1
                        ? "No llegas: un puesto se queda sin nadie que vaya a jugar"
                        : `No llegas: ${o.missing} puestos se quedan sin nadie que vaya a jugar`
                    }
                  >
                    −{o.missing}
                  </span>
                )}
              </span>
            </PendingLink>
          );
        })}
      </div>
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
