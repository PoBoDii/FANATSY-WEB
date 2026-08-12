import Link from "next/link";
import { notFound } from "next/navigation";
import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { getFf, normalizeName } from "@/lib/futbolfantasy";
import { getFixtures, findTeam, type Fixture, type TeamRef } from "@/lib/equipos";
import { getClubLineup, getLineup } from "@/lib/alineaciones";
import {
  FF_INJURED_URL,
  ffBadge,
  ffFixtureUrl,
  ffPhoto,
  ffTeamUrl,
  oddsTone,
  type PlayerAlert,
} from "@/lib/odds";
import { playersOfTeam, toList, toManager, type Player } from "@/lib/normalize";
import { DifficultyBadge, FixtureRow, isLeague } from "@/components/Fixtures";
import { managerColor } from "@/lib/managers";
import { getIdResolver } from "@/lib/cruce";
import { BackLink } from "@/components/BackLink";
import { PendingLink } from "@/components/PendingLink";
import { findInjury, getInjuries, injuryTone, type Injury } from "@/lib/lesionados";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { AlertBadge, Empty } from "@/components/ui";
import { FfLink } from "@/components/FfLink";
import { TeamPlayers, type TeamPlayerRow } from "@/components/TeamPlayers";

export const dynamic = "force-dynamic";

type Tab = "once" | "jugadores" | "calendario" | "noticias";

const TABS: { key: Tab; label: string }[] = [
  { key: "once", label: "Once probable" },
  { key: "jugadores", label: "Jugadores" },
  { key: "calendario", label: "Calendario" },
  { key: "noticias", label: "Noticias" },
];

export default async function EquipoClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; orden?: string; dir?: string; pos?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const team = findTeam(slug);
  if (!team) notFound();

  const tab = (TABS.find((t) => t.key === query.tab)?.key ?? "once") as Tab;

  const session = await getSession();
  const league = session.active;

  const [ff, fixtures, { data: teamsRaw }, resolveId, injuries] = await Promise.all([
    getFf(),
    getFixtures(slug),
    league ? safe(fantasy.leagueTeams(league.id)) : Promise.resolve({ data: null, error: null }),
    getIdResolver(),
    getInjuries(),
  ]);

  type Owner = { manager: string; isMe: boolean; color: string; player: Player };
  const owners = new Map<string, Owner>();
  toList(teamsRaw).forEach((raw, i) => {
    const manager = toManager(raw, i, league?.myTeamId ?? null);
    const color = managerColor(i, manager.isMe);
    for (const owned of playersOfTeam(raw)) {
      const entry = { manager: manager.name, isMe: manager.isMe, color, player: owned };
      owners.set(normalizeName(owned.fullName || owned.name), entry);
      owners.set(normalizeName(owned.name), entry);
    }
  });

  const squad: TeamPlayerRow[] = ff.all
    .filter((row) => row.teamId === team.ffId)
    .map((row) => {
      const owner = owners.get(row.name) ?? null;
      return {
        name: row.name,
        // El alias del campo suele ser el corto ("Baena"); si el del mercado
        // es más completo, ese.
        displayName:
          owner?.player.name ??
          titleCase(
            (row.displayName ?? "").length > row.name.length ? row.displayName! : row.name,
          ),
        photo: owner?.player.image ?? ffPhoto(row.ffId),
        position: row.position,
        probability: row.probability,
        value: row.value,
        diff: row.diff,
        diffPct: row.diffPct,
        streak: row.streak,
        goals: row.stats.goals,
        assists: row.stats.assists,
        hierarchy: row.stats.hierarchy,
        alerts: row.alerts,
        playerId: owner?.player.id ?? null,
        points: owner?.player.points ?? null,
        status: owner?.player.status ?? "ok",
        ownerName: owner?.manager ?? null,
        ownerIsMe: owner?.isMe ?? false,
        buyoutClause: owner?.player.buyoutClause ?? null,
        buyoutUnlockAt: owner?.player.buyoutUnlockAt ?? null,
      };
    });

  // El contador de la cabecera cuenta jugadores, no el cuerpo técnico.
  const squadSize = squad.filter((p) => p.position !== "Entrenador").length;

  /**
   * Lesionados del club.
   *
   * La lista sale del parte de toda la liga y no de los avisos de la ficha del
   * club: ahí sólo aparece quien tiene noticia reciente, así que faltaban bajas
   * de largo plazo (el Barcelona salía con cero teniendo varias). Del parte
   * viene además qué tiene, desde cuándo y si llega a la jornada.
   */
  const byName = new Map(squad.map((p) => [normalizeName(p.displayName), p]));
  const injured = (injuries.byTeam.get(team.ffId) ?? []).map((injury) => ({
    injury,
    player: byName.get(injury.name) ?? findSquadPlayer(squad, injury.name),
  }));

  const news = squad.flatMap((p) =>
    p.alerts
      .filter((a) => a.kind === "news" && a.url)
      .map((a) => ({ player: p.displayName, photo: p.photo, ...a })),
  );

  const nextLeague = fixtures.next.find(isLeague);

  /**
   * El once del próximo partido de liga.
   *
   * Si el calendario no se ha podido leer (o si futbolfantasy devuelve el
   * partido vacío) se recurre al que ellos proyectan para el siguiente
   * encuentro del club, que sacan de `data-prox` en su propia página. Sin esto
   * un fallo momentáneo del calendario dejaba el campo en blanco con un
   * "sin once probable" que no era verdad.
   */
  let lineup: Awaited<ReturnType<typeof getLineup>> = [];
  if (tab === "once") {
    if (nextLeague) lineup = await getLineup(nextLeague.id, team.ffId);
    if (lineup.length === 0) lineup = await getClubLineup(team.slug, team.ffId);
  }

  /**
   * Id de LaLiga de un jugador del once, para poder abrir su ficha. Los que
   * alguien tiene fichados lo traen directo; el resto se cruza por valor.
   */
  const idOf = (name: string): string | null => {
    const key = normalizeName(name);
    return (
      owners.get(key)?.player.id ??
      resolveId.fromRow(ff.byName(key)) ??
      resolveId.fromName(key, team.ffId)
    );
  };

  return (
    <>
      <TeamHeader
        team={team}
        squad={squadSize}
        mine={squad.filter((p) => p.ownerIsMe).length}
        injured={injured.length}
      />

      <TabBar slug={slug} active={tab} counts={{ jugadores: squadSize, noticias: news.length }} />

      {tab === "once" && (
        <Lineup
          team={team}
          lineup={lineup}
          nextLeague={nextLeague}
          owners={owners}
          idOf={idOf}
          fixtures={fixtures}
        />
      )}

      {tab === "jugadores" &&
        (squad.length === 0 ? (
          <Empty title="Sin datos de plantilla" />
        ) : (
          <TeamPlayers players={squad} slug={slug} query={query} />
        ))}

      {tab === "calendario" && (
        <section className="grid gap-6 px-3 py-5 sm:gap-8 sm:px-6 sm:py-6 lg:grid-cols-2 lg:px-10">
          <div>
            <SectionTitle color={team.color}>Últimos partidos · {fixtures.last.length}</SectionTitle>
            <div className="space-y-2.5">
              {fixtures.last.map((fixture) => (
                <FixtureRow key={fixture.id} fixture={fixture} played />
              ))}
              {fixtures.last.length === 0 && (
                <p className="text-muted text-sm">Sin partidos jugados todavía.</p>
              )}
            </div>
          </div>
          <div>
            <SectionTitle color={team.color}>Próximos partidos · {fixtures.next.length}</SectionTitle>
            <div className="space-y-2.5">
              {fixtures.next.map((fixture) => (
                <FixtureRow key={fixture.id} fixture={fixture} />
              ))}
              {fixtures.next.length === 0 && (
                <p className="text-muted text-sm">Sin próximos partidos publicados.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {tab === "noticias" && (
        <section className="px-3 py-5 sm:px-6 sm:py-6 lg:px-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle color="#dc2626">Lesionados · {injured.length}</SectionTitle>
            <FfLink href={FF_INJURED_URL} label="Ver el parte de lesionados en futbolfantasy" />
          </div>
          {injured.length === 0 ? (
            <p className="text-muted text-sm">Ningún lesionado ahora mismo.</p>
          ) : (
            <div className="grid gap-2.5 md:grid-cols-2">
              {injured.map(({ player, injury }) => (
                <InjuryCard
                  key={injury.slug}
                  name={player?.displayName ?? injury.displayName}
                  photo={player?.photo ?? ffPhoto(injury.ffId)}
                  alerts={player?.alerts ?? []}
                  injury={injury}
                  playerId={player?.playerId ?? idOf(injury.displayName)}
                />
              ))}
            </div>
          )}

          <div className="mt-8">
            <SectionTitle color={team.color}>Noticias · {news.length}</SectionTitle>
          </div>
          {news.length === 0 ? (
            <p className="text-muted text-sm">Sin noticias publicadas.</p>
          ) : (
            <ul className="space-y-2">
              {news.slice(0, 20).map((item, i) => (
                <li key={`${item.url}-${i}`}>
                  <a
                    href={item.url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-line bg-panel flex items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                    style={{ borderLeftColor: team.color, borderLeftWidth: 5 }}
                  >
                    <div className="border-line bg-panel-2 h-[44px] w-[44px] shrink-0 overflow-hidden rounded-lg border">
                      <PlayerPhoto src={item.photo} name={item.player} size={44} />
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-bold">{item.player}</span>
                      <span className="text-muted">{item.label}</span>
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-sky-600 px-1.5 py-[2px] text-[0.62rem] font-bold text-white"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------- cabecera */

function TeamHeader({
  team,
  squad,
  mine,
  injured,
}: {
  team: TeamRef;
  squad: number;
  mine: number;
  injured: number;
}) {
  return (
    <div className="relative overflow-hidden" style={{ background: team.color }}>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "linear-gradient(120deg, rgba(0,0,0,0.35), rgba(0,0,0,0.05))" }}
      />
      <div className="relative px-6 pt-5 pb-6 lg:px-10">
        <BackLink
          href="/equipos"
          label="Equipos"
          className="text-white/80 hover:!text-white"
        />

        <div className="mt-4 flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ffBadge(team.ffId) ?? ""}
            alt=""
            width={68}
            height={68}
            className="object-contain drop-shadow-lg"
          />
          <div>
            <h1 className="display text-[clamp(2rem,5vw,3.2rem)] text-white drop-shadow">
              {team.name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[0.72rem] font-semibold">
              <Pill>{squad} jugadores</Pill>
              {mine > 0 && <Pill highlight>{mine} tuyos</Pill>}
              {injured > 0 && <Pill danger>{injured} lesionados</Pill>}
              <FfLink
                href={ffTeamUrl(team.slug)}
                label={`Ver ${team.name} en futbolfantasy`}
                tone="sobre-color"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pill({
  children,
  highlight,
  danger,
}: {
  children: React.ReactNode;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 ${
        highlight
          ? "bg-white text-up"
          : danger
            ? "bg-rose-600 text-white"
            : "bg-black/30 text-white"
      }`}
    >
      {children}
    </span>
  );
}

function TabBar({
  slug,
  active,
  counts,
}: {
  slug: string;
  active: Tab;
  counts: { jugadores: number; noticias: number };
}) {
  return (
    <div className="border-line bg-panel flex overflow-x-auto border-b">
      {TABS.map((t) => {
        const on = active === t.key;
        const count = t.key === "jugadores" ? counts.jugadores : t.key === "noticias" ? counts.noticias : null;
        return (
          <PendingLink
            key={t.key}
            href={`/equipos/${slug}?tab=${t.key}`}
            scroll={false}
            className={`shrink-0 border-b-[3px] px-5 py-3.5 text-[0.88rem] font-bold transition-colors ${
              on ? "border-ink text-ink" : "text-faint hover:text-muted border-transparent"
            }`}
          >
            {t.label}
            {count !== null && count > 0 && (
              <span className="text-faint ml-1.5 text-[0.72rem]">{count}</span>
            )}
          </PendingLink>
        );
      })}
    </div>
  );
}

function SectionTitle({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <h2 className="mb-3 flex items-center gap-2.5 text-[0.95rem] font-bold">
      <span className="h-5 w-[4px] rounded-full" style={{ background: color }} />
      {children}
    </h2>
  );
}

/* ------------------------------------------------------------- once */

function Lineup({
  team,
  lineup,
  nextLeague,
  owners,
  idOf,
  fixtures,
}: {
  team: TeamRef;
  lineup: Awaited<ReturnType<typeof getLineup>>;
  nextLeague: Fixture | undefined;
  owners: Map<string, { manager: string; isMe: boolean; color: string }>;
  idOf: (name: string) => string | null;
  fixtures: { last: Fixture[]; next: Fixture[] };
}) {
  const starters = lineup.filter((s) => s.starter);
  const bench = lineup.filter((s) => !s.starter);

  if (starters.length === 0) {
    return (
      <Empty
        title="Sin once probable"
        hint="futbolfantasy aún no publica la alineación del próximo partido de liga."
      />
    );
  }

  const lines = (["PT", "DF", "MC", "DL"] as const)
    .map((pos) => starters.filter((s) => s.position === pos))
    .filter((line) => line.length > 0);

  return (
    <section className="mx-auto max-w-6xl p-2.5 sm:p-4 lg:p-6">
      {nextLeague && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="bg-ink rounded px-2 py-1 text-[0.68rem] font-bold text-white">
            {nextLeague.phase}
          </span>
          <span className="text-lg">{nextLeague.atHome ? "🏠" : "✈️"}</span>
          <span className="text-[0.82rem] font-semibold">
            {nextLeague.atHome ? nextLeague.away.name : nextLeague.home.name}
          </span>
          <DifficultyBadge level={nextLeague.difficulty} />
          <span className="text-muted tnum text-[0.75rem]">{nextLeague.date}</span>
          <FfLink href={ffFixtureUrl(nextLeague.url)} label="Ver el partido en futbolfantasy" compact />
        </div>
      )}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,480px)_minmax(0,360px)] lg:gap-5 lg:justify-center">
      <div className="relative order-1 overflow-hidden rounded-2xl shadow-md lg:col-start-1 lg:row-start-1">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: "repeating-linear-gradient(180deg, #2f7d4f 0 62px, #2a7348 62px 124px)",
          }}
        />
        <svg
          aria-hidden
          viewBox="0 0 100 140"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          style={{ stroke: "rgba(255,255,255,0.34)", fill: "none", strokeWidth: 0.35 }}
        >
          <rect x="3" y="3" width="94" height="134" />
          <line x1="3" y1="70" x2="97" y2="70" />
          <circle cx="50" cy="70" r="13" />
          <rect x="26" y="3" width="48" height="20" />
          <rect x="26" y="117" width="48" height="20" />
        </svg>

        <div className="relative flex flex-col gap-5 px-1.5 py-6 sm:gap-7 sm:px-3 sm:py-8 lg:gap-10 lg:py-12">
          {lines.map((line, i) => (
            <div key={i} className="flex justify-center gap-1 sm:gap-2 lg:gap-4">
              {line.map((slot) => {
                const main = slot.players[0];
                const tone = slot.probability !== null ? oddsTone(slot.probability) : null;
                const owner = owners.get(normalizeName(main.name));
                const playerId = idOf(main.name);
                return (
                  <div
                    key={slot.ffId}
                    className="relative flex w-[58px] flex-col items-center sm:w-[68px] lg:w-[84px]"
                  >
                    {playerId && (
                      <Link
                        href={`/jugador/${playerId}`}
                        className="absolute inset-0 z-10"
                        aria-label={main.name}
                      />
                    )}
                    <div
                      className={`relative ${playerId ? "transition-transform hover:-translate-y-1" : ""}`}
                    >
                      <div
                        className="overflow-hidden rounded-xl border-[3px] bg-white shadow-lg"
                        style={{
                          borderColor: owner?.color ?? "#ffffff",
                          boxShadow: owner ? `0 0 0 4px ${owner.color}55` : undefined,
                        }}
                      >
                        <PlayerPhoto
                          src={ffPhoto(main.ffId || slot.ffId)}
                          name={main.name}
                          size={50}
                        />
                      </div>
                      {tone && (
                        <span
                          className="tnum absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-md px-2 py-[3px] text-[0.72rem] leading-none font-bold shadow-md"
                          style={{ background: tone.color, color: tone.ink }}
                        >
                          {slot.probability}%
                        </span>
                      )}
                    </div>
                    <div className="mt-3 w-full px-0.5 text-center">
                      <div
                        className="text-[0.68rem] leading-tight font-bold text-white"
                        style={{ textShadow: "0 1px 3px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)" }}
                      >
                        {main.name}
                      </div>
                      {slot.players.slice(1, 2).map((alt) => (
                        <div
                          key={alt.slug}
                          className="truncate text-[0.58rem] text-white/70"
                          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
                        >
                          {alt.name}
                        </div>
                      ))}
                    </div>
                    {owner && (
                      <span
                        className="mt-1 max-w-full truncate rounded px-1.5 py-[2px] text-[0.58rem] font-bold text-white ring-1 ring-white/70"
                        style={{ background: owner.color }}
                      >
                        {owner.isMe ? "TUYO" : owner.manager}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Alternativas: en el móvil van justo bajo el campo, que es lo que se
          mira después del once. En pantalla grande siguen debajo. */}
      {bench.length > 0 && (
        <div className="order-2 lg:col-start-1 lg:row-start-2">
          <SectionTitle color={team.color}>Alternativas · {bench.length}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {bench.map((slot) => {
              const main = slot.players[0];
              const tone = slot.probability !== null ? oddsTone(slot.probability) : null;
              const playerId = idOf(main.name);
              return (
                <div key={slot.ffId} className="relative w-[62px] text-center">
                  {playerId && (
                    <Link
                      href={`/jugador/${playerId}`}
                      className="absolute inset-0 z-10"
                      aria-label={main.name}
                    />
                  )}
                  <div className="border-line bg-panel relative overflow-hidden rounded-lg border-2">
                    <PlayerPhoto src={ffPhoto(main.ffId || slot.ffId)} name={main.name} size={54} />
                  </div>
                  {tone && (
                    <span
                      className="tnum -mt-2 inline-block rounded px-1.5 py-[1px] text-[0.62rem] font-bold shadow"
                      style={{ background: tone.color, color: tone.ink }}
                    >
                      {slot.probability}%
                    </span>
                  )}
                  <div className="mt-1 text-[0.62rem] leading-tight font-semibold">
                    {main.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* El calendario, a la derecha en grande y el último en el móvil */}
      <div className="order-3 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <SectionTitle color={team.color}>Próximos partidos</SectionTitle>
        <div className="space-y-2">
          {fixtures.next.slice(0, 8).map((fixture) => (
            <FixtureRow key={fixture.id} fixture={fixture} compact />
          ))}
        </div>
      </div>
      </div>
    </section>
  );
}

/**
 * Lesionado con su foto, qué tiene y hasta cuándo. El detalle sale del parte
 * de toda la liga; si ese cruce falla se enseña igual, pero sin duración.
 */
function InjuryCard({
  name,
  photo,
  alerts,
  injury,
  playerId,
}: {
  name: string;
  photo: string | null;
  alerts: PlayerAlert[];
  injury: Injury | null;
  playerId: string | null;
}) {
  const tone = injury
    ? injuryTone(injury)
    : { bg: "bg-down-soft", border: "border-down/40", text: "text-down" };

  const body = (
    <>
      <div className="border-line bg-panel-2 h-[58px] w-[58px] shrink-0 overflow-hidden rounded-lg border-2">
        <PlayerPhoto src={photo} name={name} size={58} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[0.95rem] font-bold">{name}</span>
          <AlertBadge alerts={alerts} />
        </div>

        {injury ? (
          <>
            <div className="text-ink mt-1 truncate text-[0.82rem] font-semibold">
              {injury.kind ?? "Lesión sin detallar"}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2">
              {injury.outlook && (
                <span className={`text-[0.75rem] font-bold ${tone.text}`}>{injury.outlook}</span>
              )}
              {injury.since && <span className="text-faint text-[0.7rem]">· {injury.since}</span>}
            </div>
          </>
        ) : (
          <div className="text-muted mt-1 text-[0.78rem]">
            Parte médico publicado, sin detalle de duración.
          </div>
        )}
      </div>

      {injury?.probability != null && (
        <span
          className="tnum shrink-0 self-start rounded-md px-2 py-1 text-[0.78rem] font-bold"
          style={{
            background: oddsTone(injury.probability).color,
            color: oddsTone(injury.probability).ink,
          }}
          title="Probabilidad de que juegue"
        >
          {injury.probability}%
        </span>
      )}
    </>
  );

  const className = `flex items-center gap-3 rounded-xl border-2 px-3.5 py-3 ${tone.border} ${tone.bg}`;

  if (!playerId) return <div className={className}>{body}</div>;

  return (
    <Link
      href={`/jugador/${playerId}`}
      className={`${className} transition-all hover:-translate-y-0.5 hover:shadow-md`}
    >
      {body}
    </Link>
  );
}

/** Último recurso: por apellido, cuando el nombre completo no casa. */
function findSquadPlayer(squad: TeamPlayerRow[], name: string): TeamPlayerRow | undefined {
  const parts = name.split(" ");
  const surname = parts[parts.length - 1];
  return squad.find((p) => normalizeName(p.displayName).endsWith(surname));
}

function titleCase(value: string): string {
  return value.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}
