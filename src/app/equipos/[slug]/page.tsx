import Link from "next/link";
import { notFound } from "next/navigation";
import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { getFf, normalizeName } from "@/lib/futbolfantasy";
import { getFixtures, findTeam, type Fixture, type TeamRef } from "@/lib/equipos";
import { getLineup } from "@/lib/alineaciones";
import { ffBadge, ffPhoto, oddsTone } from "@/lib/odds";
import { playersOfTeam, toList, toManager, type Player } from "@/lib/normalize";
import { DifficultyBadge, FixtureRow, isLeague } from "@/components/Fixtures";
import { managerColor } from "@/lib/managers";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { AlertBadge, Empty } from "@/components/ui";
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

  const [ff, fixtures, { data: teamsRaw }] = await Promise.all([
    getFf(),
    getFixtures(slug),
    league ? safe(fantasy.leagueTeams(league.id)) : Promise.resolve({ data: null, error: null }),
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
        displayName: owner?.player.name ?? titleCase(row.displayName ?? row.name),
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

  const injured = squad.filter((p) => p.alerts.some((a) => a.kind === "injury"));
  const news = squad.flatMap((p) =>
    p.alerts.filter((a) => a.kind === "news" && a.url).map((a) => ({ player: p.displayName, ...a })),
  );

  const nextLeague = fixtures.next.find(isLeague);
  const lineup = tab === "once" && nextLeague ? await getLineup(nextLeague.id, team.ffId) : [];

  return (
    <>
      <TeamHeader
        team={team}
        squad={squad.length}
        mine={squad.filter((p) => p.ownerIsMe).length}
        injured={injured.length}
      />

      <TabBar slug={slug} active={tab} counts={{ jugadores: squad.length, noticias: news.length }} />

      {tab === "once" && (
        <Lineup team={team} lineup={lineup} nextLeague={nextLeague} owners={owners} fixtures={fixtures} />
      )}

      {tab === "jugadores" &&
        (squad.length === 0 ? (
          <Empty title="Sin datos de plantilla" />
        ) : (
          <TeamPlayers players={squad} slug={slug} query={query} />
        ))}

      {tab === "calendario" && (
        <section className="grid gap-8 px-6 py-6 lg:grid-cols-2 lg:px-10">
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
        <section className="px-6 py-6 lg:px-10">
          <SectionTitle color="#dc2626">Lesionados · {injured.length}</SectionTitle>
          {injured.length === 0 ? (
            <p className="text-muted text-sm">Ningún lesionado ahora mismo.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {injured.map((player) => (
                <span
                  key={player.name}
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-rose-300 bg-rose-50 px-3 py-2 text-[0.82rem] font-semibold"
                >
                  <AlertBadge alerts={player.alerts} />
                  {player.displayName}
                </span>
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
                    className="border-line flex flex-wrap items-center gap-2 rounded-lg border-2 bg-white px-3 py-2.5 text-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                    style={{ borderLeftColor: team.color, borderLeftWidth: 5 }}
                  >
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
        <Link
          href="/equipos"
          className="text-[0.68rem] font-bold tracking-wide text-white/80 uppercase hover:text-white"
        >
          ← Equipos
        </Link>

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
            <div className="mt-1.5 flex flex-wrap gap-2 text-[0.72rem] font-semibold">
              <Pill>{squad} jugadores</Pill>
              {mine > 0 && <Pill highlight>{mine} tuyos</Pill>}
              {injured > 0 && <Pill danger>{injured} lesionados</Pill>}
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
          ? "bg-white text-emerald-800"
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
    <div className="border-line flex overflow-x-auto border-b bg-white">
      {TABS.map((t) => {
        const on = active === t.key;
        const count = t.key === "jugadores" ? counts.jugadores : t.key === "noticias" ? counts.noticias : null;
        return (
          <Link
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
          </Link>
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
  fixtures,
}: {
  team: TeamRef;
  lineup: Awaited<ReturnType<typeof getLineup>>;
  nextLeague: Fixture | undefined;
  owners: Map<string, { manager: string; isMe: boolean; color: string }>;
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
    <section className="mx-auto max-w-6xl p-4 lg:p-6">
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
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,400px)_minmax(0,520px)] lg:justify-center">
      <div className="relative overflow-hidden rounded-2xl shadow-md">
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

        <div className="relative flex flex-col gap-7 px-3 py-8 lg:gap-10 lg:py-12">
          {lines.map((line, i) => (
            <div key={i} className="flex justify-center gap-2 lg:gap-4">
              {line.map((slot) => {
                const main = slot.players[0];
                const tone = slot.probability !== null ? oddsTone(slot.probability) : null;
                const owner = owners.get(normalizeName(main.name));
                return (
                  <div key={slot.ffId} className="flex w-[68px] flex-col items-center lg:w-[84px]">
                    <div className="relative">
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
                          size={62}
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
                    <div className="mt-3.5 w-full rounded-md bg-white px-1 py-1 text-center shadow">
                      <div className="truncate text-[0.7rem] leading-tight font-bold">
                        {main.name}
                      </div>
                      {slot.players.slice(1, 2).map((alt) => (
                        <div key={alt.slug} className="text-faint truncate text-[0.6rem]">
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

      {/* El hueco de la derecha, para el calendario que viene */}
      <div>
        <SectionTitle color={team.color}>Próximos partidos</SectionTitle>
        <div className="space-y-1.5">
          {fixtures.next.slice(0, 8).map((fixture) => (
            <FixtureRow key={fixture.id} fixture={fixture} compact />
          ))}
        </div>
      </div>
      </div>

      {bench.length > 0 && (
        <div className="mt-5">
          <SectionTitle color={team.color}>Alternativas · {bench.length}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {bench.map((slot) => {
              const main = slot.players[0];
              const tone = slot.probability !== null ? oddsTone(slot.probability) : null;
              return (
                <div key={slot.ffId} className="w-[62px] text-center">
                  <div className="border-line relative overflow-hidden rounded-lg border-2 bg-white">
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
                  <div className="mt-1 truncate text-[0.62rem] font-semibold">{main.name}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function titleCase(value: string): string {
  return value.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}
