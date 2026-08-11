import Link from "next/link";
import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { enrichOdds, getFf, normalizeName } from "@/lib/futbolfantasy";
import { ffBadge, ffPhoto, oddsTone, type FfPlayer } from "@/lib/odds";
import {
  POSITION_LABEL,
  playersOfTeam,
  pointsHistory,
  toList,
  toManager,
  toPlayer,
  valueHistory,
  type Player,
} from "@/lib/normalize";
import { dateTime, money, num, signed } from "@/lib/format";
import { PointsChart, ValueChart } from "@/components/charts";
import { LastFixtures, NextFixtures } from "@/components/Fixtures";
import { TEAMS, getFixtures } from "@/lib/equipos";
import { Countdown } from "@/components/Countdown";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import {
  AlertBadge,
  ClubLink,
  Empty,
  ErrorBox,
  PositionTag,
  PriceDelta,
  StatusTag,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function JugadorPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  const session = await getSession();

  if (!session.active)
    return <Empty title="Todavía sin liga" hint="Los detalles, en Mi plantilla." />;

  const league = session.active;

  const [{ data, error }, { data: valuesRaw }, { data: teamsRaw }, ff] = await Promise.all([
    safe(fantasy.player(playerId, league.id)),
    safe(fantasy.playerValues(playerId)),
    safe(fantasy.leagueTeams(league.id)),
    getFf(),
  ]);

  if (error || !data) return <ErrorBox error={error ?? "Sin datos"} />;

  const player = toPlayer(data);
  const oddsOf = await enrichOdds(ff, [player], 1);
  const odds = oddsOf(player);

  // Calendario de su club: de ahí salen los próximos rivales y su dificultad.
  const club = TEAMS.find((t) => t.ffId === odds?.teamId);
  const fixtures = club ? await getFixtures(club.slug) : { last: [], next: [] };

  // ¿Lo tiene alguien de la liga? De paso recuperamos su cláusula real, que
  // sólo existe dentro de la plantilla de su dueño.
  const key = normalizeName(player.fullName || player.name);
  let owner: { manager: string; isMe: boolean; player: Player } | null = null;
  toList(teamsRaw).forEach((raw, i) => {
    const manager = toManager(raw, i, league.myTeamId);
    for (const owned of playersOfTeam(raw)) {
      if (owned.id === player.id || normalizeName(owned.fullName || owned.name) === key) {
        owner = { manager: manager.name, isMe: manager.isMe, player: owned };
      }
    }
  });

  const values = pickSeries(valueHistory(data), valueHistory(valuesRaw ?? {}));
  const points = pointsHistory(data);

  return (
    <>
      <div className="border-line border-b px-6 pt-6 lg:px-10">
        <Link href="/" className="label hover:text-acid transition-colors">
          ← Volver
        </Link>
      </div>

      <Header player={player} odds={odds} owner={owner} />
      <Ownership owner={owner} />
      <KeyStats player={player} odds={odds} />
      <SeasonStats odds={odds} />

      {club && (
        <section className="border-line border-b px-6 py-5 lg:px-10">
          <div className="mb-3 flex flex-wrap items-baseline gap-3">
            <span className="label">Próximos partidos de {club.name}</span>
            {/* El calendario entero son 38 tarjetas y aquí sólo estorban: se
                enseñan los siguientes y el resto se ve en la página del club. */}
            <Link href={`/equipos/${club.slug}?tab=calendario`} className="text-acid text-xs hover:underline">
              ver calendario completo →
            </Link>
          </div>
          <NextFixtures fixtures={fixtures.next} limit={6} />
          <div className="label mt-5 mb-3">Últimos partidos</div>
          <LastFixtures fixtures={fixtures.last} limit={4} />
        </section>
      )}

      <PriceTrend odds={odds} />

      <div className="grid lg:grid-cols-2">
        <div className="border-line rise border-b lg:border-r lg:border-b-0">
          <ValueChart series={values} />
        </div>
        <div className="rise" style={{ animationDelay: "80ms" }}>
          <PointsChart series={points} />
        </div>
      </div>
    </>
  );
}

/** Nos quedamos con la serie más larga de las dos fuentes disponibles. */
function pickSeries<T>(a: T[], b: T[]): T[] {
  return b.length >= a.length ? b : a;
}

/* ---------------------------------------------------------------- cabecera */

function Header({
  player,
  odds,
  owner,
}: {
  player: Player;
  odds: FfPlayer | null;
  owner: { manager: string; isMe: boolean } | null;
}) {
  const tone = odds?.probability != null ? oddsTone(odds.probability) : null;

  return (
    <div className="border-line relative overflow-hidden border-b">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, rgba(18,138,79,0.10) 0%, rgba(18,138,79,0.03) 45%, transparent 72%)",
        }}
      />
      <div className="relative flex flex-wrap items-center gap-5 px-6 py-7 lg:px-10">
        <div className="border-line relative overflow-hidden rounded-xl border-2 bg-white shadow-md">
          <PlayerPhoto
            src={player.image}
            fallback={ffPhoto(odds?.ffId ?? null)}
            name={player.name}
            size={96}
          />
        </div>

        <div className="rise min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PositionTag position={player.position} />
            <span className="label">{POSITION_LABEL[player.position]}</span>
            <AlertBadge alerts={odds?.alerts} />
          </div>

          <h1 className="display mt-2 text-[clamp(1.9rem,4.5vw,3rem)]">{player.name}</h1>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <ClubLink
              name={player.clubName !== "—" ? player.clubName : (odds?.teamName ?? null)}
              badge={player.clubBadge ?? ffBadge(odds?.teamId ?? null)}
              size={20}
              className="text-muted text-sm font-medium"
            />

            {/* Lo que se ha movido hoy, en la cabecera: es lo primero que se
                mira al abrir una ficha y estaba enterrado más abajo. */}
            {odds?.diff ? (
              <span
                className={`tnum inline-flex items-baseline gap-1.5 rounded-lg px-3 py-1.5 text-[1.05rem] font-bold ${
                  odds.diff > 0 ? "bg-up/15 text-up" : "bg-down/15 text-down"
                }`}
                title="Variación de valor respecto a ayer"
              >
                {odds.diff > 0 ? "▲" : "▼"} {signed(odds.diff)}
                {odds.diffPct !== null && (
                  <span className="text-[0.78rem] font-semibold opacity-80">
                    {odds.diffPct > 0 ? "+" : "−"}
                    {num(Math.abs(odds.diffPct), 1)}%
                  </span>
                )}
              </span>
            ) : (
              <span className="text-faint text-[0.78rem]">sin cambio de valor hoy</span>
            )}
            <StatusTag status={player.status} />
            {owner && (
              <span
                className={`rounded-md border px-2 py-1 text-[0.72rem] font-bold ${
                  owner.isMe
                    ? "border-acid bg-acid/15 text-acid"
                    : "border-sky-300 bg-sky-50 text-sky-800"
                }`}
              >
                {owner.isMe ? "ES TUYO" : `De ${owner.manager}`}
              </span>
            )}
          </div>
        </div>

        {/* Probabilidad de ser titular: el dato que más se consulta */}
        {tone && (
          <div
            className="rounded-2xl px-6 py-4 text-center shadow-md"
            style={{ background: tone.color, color: tone.ink }}
          >
            <div className="text-[0.62rem] font-bold tracking-wider uppercase opacity-80">
              Sale de titular
            </div>
            <div className="tnum mt-1 text-[2.4rem] leading-none font-bold">
              {odds!.probability}%
            </div>
            <div className="text-[0.68rem] font-semibold">{tone.label}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- propiedad */

function Ownership({
  owner,
}: {
  owner: { manager: string; isMe: boolean; player: Player } | null;
}) {
  if (!owner) {
    return (
      <div className="border-line border-b bg-emerald-50/50 px-6 py-4 lg:px-10">
        <div className="label text-acid">Libre</div>
        <p className="mt-1 text-sm font-medium">
          No lo tiene nadie de tu liga. Si sale al mercado, se puede fichar sin pagar cláusula.
        </p>
      </div>
    );
  }

  const clause = owner.player.buyoutClause ?? 0;
  const unlockAt = owner.player.buyoutUnlockAt;
  const open = !unlockAt || new Date(unlockAt).getTime() <= Date.now();
  const over = clause - owner.player.marketValue;

  return (
    <div
      className={`border-line grid gap-px border-b sm:grid-cols-2 lg:grid-cols-4 ${
        open ? "bg-rose-50/60" : "bg-panel-2/40"
      }`}
    >
      <Cell label="Lo tiene">
        <span className={`text-[1.15rem] font-semibold ${owner.isMe ? "text-acid" : "text-ink"}`}>
          {owner.isMe ? "Tú" : owner.manager}
        </span>
      </Cell>

      <Cell label="Cláusula">
        <span className={`tnum text-[1.35rem] font-semibold ${open ? "text-down" : "text-ink"}`}>
          {clause ? money(clause) : "—"}
        </span>
      </Cell>

      <Cell label="Sobre su valor">
        <span className="tnum text-warn text-[1.15rem] font-semibold">
          {clause ? signed(over) : "—"}
        </span>
      </Cell>

      <Cell label={open ? "Estado" : "Se abre"}>
        {clause ? (
          open ? (
            <span className="text-up text-[0.95rem] font-bold">ABIERTA</span>
          ) : (
            <div className="flex flex-col items-start gap-1">
              <Countdown until={unlockAt!} />
              <span className="tnum text-muted text-[0.68rem]">{dateTime(unlockAt)}</span>
            </div>
          )
        ) : (
          <span className="text-faint text-sm">—</span>
        )}
      </Cell>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-panel px-6 py-4 lg:px-8">
      <div className="label">{label}</div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------ estadísticas */

function KeyStats({ player, odds }: { player: Player; odds: FfPlayer | null }) {
  const items: { label: string; value: string; tone?: string }[] = [
    { label: "Valor", value: money(player.marketValue) },
    { label: "Puntos", value: num(player.points), tone: "text-acid" },
    { label: "Media", value: num(player.averagePoints, 1) },
    {
      label: "Jerarquía",
      value: odds?.stats.hierarchy != null ? `${odds.stats.hierarchy}/100` : "s/d",
    },
  ];

  return (
    <div className="border-line grid grid-cols-2 border-b lg:grid-cols-4">
      {items.map((item, i) => (
        <div
          key={item.label}
          className="border-line rise border-r border-b px-6 py-4 last:border-r-0 lg:border-b-0"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <div className="label">{item.label}</div>
          <div className={`tnum mt-1.5 text-[1.5rem] leading-none font-semibold ${item.tone ?? ""}`}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function SeasonStats({ odds }: { odds: FfPlayer | null }) {
  const s = odds?.stats;
  if (!s) return null;

  const items = [
    { label: "Goles", value: s.goals, color: "text-emerald-700" },
    { label: "Asistencias", value: s.assists, color: "text-sky-700" },
    { label: "Amarillas", value: s.yellow, color: "text-amber-600" },
    { label: "Rojas", value: s.red, color: "text-rose-600" },
    { label: "Partidos", value: s.matches, color: "text-ink" },
    { label: "Minutos", value: s.minutes, color: "text-ink" },
  ];

  return (
    <div className="border-line border-b px-6 py-5 lg:px-10">
      <div className="label mb-3">Temporada</div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="border-line min-w-[92px] flex-1 rounded-lg border bg-white px-3 py-2.5"
          >
            <div className="text-faint text-[0.62rem] font-semibold uppercase">{item.label}</div>
            <div className={`tnum mt-1 text-[1.2rem] leading-none font-semibold ${item.color}`}>
              {item.value ?? "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- precio */

function PriceTrend({ odds }: { odds: FfPlayer | null }) {
  if (!odds) return null;

  const byDay = new Map(odds.history.map((h) => [h.daysAgo, h.value]));

  // Los tres últimos días son lo que de verdad se mira: van aparte y en
  // grande, como el día a día del mercado. El resto queda como contexto.
  const recent = [1, 2, 3]
    .map((days) => {
      const before = byDay.get(days);
      const previous = byDay.get(days - 1) ?? odds.value;
      if (before === undefined) return null;
      return {
        days,
        label: days === 1 ? "Hoy" : days === 2 ? "Ayer" : "Anteayer",
        diff: previous - before,
        value: previous,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  const windows = [
    { days: 3, label: "3 días" },
    { days: 7, label: "7 días" },
    { days: 14, label: "14 días" },
    { days: 30, label: "30 días" },
  ];

  return (
    <div className="border-line border-b px-6 py-5 lg:px-10">
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <span className="label">Evolución del valor</span>
        {odds.streak !== 0 && (
          <span
            className={`text-[0.72rem] font-semibold ${odds.streak > 0 ? "text-up" : "text-down"}`}
          >
            {Math.abs(odds.streak)} {Math.abs(odds.streak) === 1 ? "día" : "días"}{" "}
            {odds.streak > 0 ? "subiendo" : "bajando"}
          </span>
        )}
      </div>

      {/* Los tres últimos días, uno a uno */}
      <div className="mb-3 flex flex-wrap gap-2">
        {recent.map((day) => (
          <div
            key={day.days}
            className={`min-w-[136px] flex-1 rounded-xl border px-4 py-3 ${
              day.diff === 0
                ? "border-line bg-white"
                : day.diff > 0
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-rose-200 bg-rose-50"
            }`}
          >
            <div className="label">{day.label}</div>
            <div className="mt-1.5">
              <PriceDelta diff={day.diff} size="lg" />
            </div>
            <div className="tnum text-faint mt-1.5 text-[0.68rem]">
              cerró en {money(day.value)}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {windows.map(({ days, label }) => {
          const before = byDay.get(days);
          if (before === undefined) return null;
          const diff = odds.value - before;
          const pct = before ? (diff / before) * 100 : 0;
          const up = diff > 0;

          return (
            <div
              key={days}
              className={`min-w-[104px] flex-1 rounded-lg border px-3 py-2.5 ${
                diff === 0
                  ? "border-line bg-white"
                  : up
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-rose-200 bg-rose-50"
              }`}
            >
              <div className="text-faint text-[0.62rem] font-semibold uppercase">{label}</div>
              <div
                className={`tnum mt-1 text-[1.05rem] leading-none font-semibold ${
                  diff === 0 ? "text-faint" : up ? "text-up" : "text-down"
                }`}
              >
                {diff === 0 ? "sin cambio" : signed(diff)}
              </div>
              {diff !== 0 && (
                <div className={`tnum mt-1 text-[0.66rem] ${up ? "text-up" : "text-down"}`}>
                  {up ? "+" : "−"}
                  {Math.abs(pct).toFixed(1).replace(".", ",")}% · antes {money(before)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
