import Link from "next/link";
import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { enrichOdds, getFf, normalizeName } from "@/lib/futbolfantasy";
import { ffBadge, ffPhoto, ffPlayerUrl, ffTeamUrl, oddsTone, type FfPlayer } from "@/lib/odds";
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
import { FixtureRow } from "@/components/Fixtures";
import { TEAMS, getFixtures } from "@/lib/equipos";
import { Countdown } from "@/components/Countdown";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { BackLink } from "@/components/BackLink";
import {
  AlertBadge,
  ClubLink,
  Empty,
  ErrorBox,
  PositionTag,
  PriceDelta,
  StatusTag,
} from "@/components/ui";
import { FfLink } from "@/components/FfLink";

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

  /**
   * Los puntos por jornada.
   *
   * La ficha individual no siempre los trae, pero el listado de plantillas sí
   * —de ahí salen las casillas de las tarjetas—, así que si el dueño está
   * identificado se usan los suyos.
   */
  const owned = owner as { player: Player } | null;
  const points = (() => {
    const fromDetail = pointsHistory(data);
    if (fromDetail.length > 0) return fromDetail;
    return owned?.player.weekPoints ?? [];
  })();

  return (
    <>
      <div className="border-line border-b px-6 pt-6 lg:px-10">
        <BackLink href="/" label="Mi plantilla" />
      </div>

      <Header player={player} odds={odds} owner={owner} />
      <Ownership owner={owner} />
      <KeyStats player={player} odds={odds} />
      <SeasonStats odds={odds} />

      {club && (
        <section className="border-line border-b px-3.5 py-4 sm:px-6 sm:py-5 lg:px-10">
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="label">Calendario de {club.name}</span>
            {/* El calendario entero son 38 partidos y aquí sólo estorban: se
                enseñan los siguientes y el resto se ve en la página del club. */}
            <Link
              href={`/equipos/${club.slug}?tab=calendario`}
              className="text-acid text-xs hover:underline"
            >
              ver completo →
            </Link>
            <FfLink href={ffTeamUrl(club.slug)} label={`Ver ${club.name} en futbolfantasy`} compact />
          </div>

          {/* Filas y no tarjetas: en el móvil una tarjeta por línea obligaba a
              recorrer media pantalla por partido. Así entran seis de un vistazo
              y las dos listas caben en paralelo en escritorio. */}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2 lg:gap-6">
            <div>
              <div className="label mb-2 text-[0.6rem]">Próximos</div>
              {fixtures.next.length === 0 ? (
                <p className="text-faint text-sm">Sin próximos partidos publicados.</p>
              ) : (
                <div className="space-y-1.5">
                  {fixtures.next.slice(0, 6).map((fixture) => (
                    <FixtureRow key={fixture.id} fixture={fixture} compact />
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="label mb-2 text-[0.6rem]">Últimos</div>
              {fixtures.last.length === 0 ? (
                <p className="text-faint text-sm">Sin partidos jugados todavía.</p>
              ) : (
                <div className="space-y-1.5">
                  {fixtures.last.slice(0, 4).map((fixture) => (
                    <FixtureRow key={fixture.id} fixture={fixture} played compact />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <WeekPoints points={points} />

      <PriceTrend odds={odds} />

      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-2">
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

/**
 * Puntos jornada a jornada.
 *
 * Es lo primero que se mira para saber si un jugador está enchufado o vive de
 * una buena jornada de hace un mes. Una casilla por partido, con el número
 * dentro y el verde más intenso cuanto más puntúa; en rojo lo que resta.
 */
function WeekPoints({ points }: { points: { week: number; points: number }[] }) {
  if (points.length === 0) return null;

  const played = points.filter((p) => p.points !== 0).length;
  const best = Math.max(...points.map((p) => p.points));

  return (
    <section className="border-line mx-auto max-w-5xl border-b px-3.5 py-4 sm:px-6 lg:px-10">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-3">
        <span className="label">Puntos por jornada</span>
        <span className="text-faint text-[0.72rem]">
          {played} {played === 1 ? "jornada puntuada" : "jornadas puntuadas"}
          {best > 0 ? ` · mejor ${best}` : ""}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {points.map(({ week, points: value }) => (
          <span
            key={week}
            className={`flex w-[38px] flex-col items-center gap-[2px] rounded-lg py-1.5 ${
              value >= 10
                ? "bg-up text-black"
                : value > 0
                  ? "bg-up/30 text-ink"
                  : value === 0
                    ? "bg-panel-2 text-faint"
                    : "bg-down text-white"
            }`}
            title={`Jornada ${week}: ${value} puntos`}
          >
            <span className="text-[0.55rem] opacity-70">J{week}</span>
            <span className="tnum text-[0.95rem] leading-none font-bold">{value}</span>
          </span>
        ))}
      </div>
    </section>
  );
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

  /**
   * Una sola fila, alineada como cualquier otra ficha de la web.
   *
   * Antes cada dato flotaba en su propia caja de color —la probabilidad en un
   * bloque verde, el cambio en otro rojo, el enlace en un tercero— y ninguno
   * se apoyaba en nada. Ahora la foto marca el alto, todo lo demás cuelga de
   * una línea base común y el color sólo aparece en la probabilidad, que es el
   * único dato que se lee por color.
   */
  return (
    <div className="border-line border-b">
      <div className="mx-auto flex max-w-5xl items-center gap-3.5 px-3.5 py-4 sm:gap-5 sm:px-6 sm:py-6 lg:px-10">
        <div className="bg-panel-2 relative shrink-0 overflow-hidden rounded-2xl">
          <PlayerPhoto
            src={player.image}
            fallback={ffPhoto(odds?.ffId ?? null)}
            name={player.name}
            size={112}
            className="h-[76px] w-[76px] sm:h-[104px] sm:w-[104px]"
          />
        </div>

        <div className="rise min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <PositionTag position={player.position} size="sm" />
            <ClubLink
              name={player.clubName !== "—" ? player.clubName : (odds?.teamName ?? null)}
              badge={player.clubBadge ?? ffBadge(odds?.teamId ?? null)}
              size={16}
              className="text-muted text-[0.78rem] font-medium"
            />
            <AlertBadge alerts={odds?.alerts} />
          </div>

          {/* `break-words`: un apellido largo debe partir, no desbordar. */}
          <h1 className="display mt-1 text-[clamp(1.5rem,6vw,2.6rem)] leading-none break-words">
            {player.name}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            {tone && (
              <span
                className="tnum rounded-md px-2 py-[3px] text-[0.85rem] leading-none font-bold"
                style={{ background: tone.color, color: tone.ink }}
                title={`${tone.label} — ${odds!.probability}% de salir de titular`}
              >
                {odds!.probability}% de titular
              </span>
            )}

            <span className="tnum text-[1.05rem] leading-none font-semibold">
              {money(player.marketValue)}
            </span>

            {odds?.diff ? (
              <span
                className={`tnum text-[0.85rem] leading-none font-semibold ${
                  odds.diff > 0 ? "text-up" : "text-down"
                }`}
                title="Variación de valor respecto a ayer"
              >
                {odds.diff > 0 ? "▲" : "▼"} {signed(odds.diff)}
                {odds.diffPct !== null && (
                  <span className="opacity-70">
                    {" "}
                    {odds.diffPct > 0 ? "+" : "−"}
                    {num(Math.abs(odds.diffPct), 1)}%
                  </span>
                )}
              </span>
            ) : (
              <span className="text-faint text-[0.78rem]">sin cambio hoy</span>
            )}

            <StatusTag status={player.status} />

            {owner && (
              <span
                className={`text-[0.76rem] font-semibold ${owner.isMe ? "text-acid" : "text-info"}`}
              >
                {owner.isMe ? "es tuyo" : `de ${owner.manager}`}
              </span>
            )}

            <FfLink href={ffPlayerUrl(odds?.slug)} label={`Ver a ${player.name} en futbolfantasy`} compact />
          </div>
        </div>
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
      <div className="border-line border-b bg-up-soft/50 px-6 py-4 lg:px-10">
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
      className={`border-line mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-4 border-b px-3.5 py-4 sm:px-6 sm:py-5 lg:px-10 ${
        open ? "bg-up-soft/40" : ""
      }`}
    >
      <Cell label="Lo tiene">
        <span className={`text-[1.15rem] font-semibold ${owner.isMe ? "text-acid" : "text-ink"}`}>
          {owner.isMe ? "Tú" : owner.manager}
        </span>
      </Cell>

      {/* La cláusula y lo que cuesta de más van juntas: son una sola idea, y
          separadas en dos recuadros había que sumarlas mentalmente. */}
      <Cell label="Cláusula">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className={`tnum text-[1.5rem] font-semibold ${open ? "text-up" : "text-down"}`}>
            {clause ? money(clause) : "—"}
          </span>
          {clause > 0 && (
            <span className="tnum text-warn text-[0.85rem] font-semibold">
              {signed(over)} sobre su valor
            </span>
          )}
        </span>
      </Cell>

      <Cell label={open ? "Estado" : "Se abre"}>
        {clause ? (
          open ? (
            <span className="text-up text-[1.05rem] font-bold">Abierta</span>
          ) : (
            <span className="flex flex-wrap items-baseline gap-2">
              <Countdown until={unlockAt!} />
              <span className="tnum text-muted text-[0.75rem]">{dateTime(unlockAt)}</span>
            </span>
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
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className="mt-1">{children}</div>
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
    { label: "Goles", value: s.goals, color: "text-up" },
    { label: "Asistencias", value: s.assists, color: "text-info" },
    { label: "Amarillas", value: s.yellow, color: "text-warn" },
    { label: "Rojas", value: s.red, color: "text-down" },
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
            className="border-line min-w-[92px] flex-1 rounded-lg border bg-panel px-3 py-2.5"
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
    <div className="border-line mx-auto max-w-5xl border-b px-3.5 py-4 sm:px-6 sm:py-5 lg:px-10">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-3">
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

      {/* Los tres últimos días, uno a uno. Antes cada uno era una tarjeta que
          se estiraba a un tercio del ancho: tres cajas enormes con un número
          pequeño dentro y mucho verde de fondo. Ahora ocupan lo que miden. */}
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-3">
        {recent.map((day) => (
          <div key={day.days}>
            <div className="label text-[0.58rem]">{day.label}</div>
            <div
              className={`tnum mt-1 text-[1.25rem] leading-none font-semibold ${
                day.diff === 0 ? "text-faint" : day.diff > 0 ? "text-up" : "text-down"
              }`}
            >
              {day.diff === 0 ? "sin cambio" : signed(day.diff)}
            </div>
            <div className="tnum text-faint mt-1 text-[0.66rem]">
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
            <div key={days} className="bg-panel-2 min-w-[96px] flex-1 rounded-xl px-3 py-2">
              <div className="text-faint text-[0.6rem] font-semibold uppercase">{label}</div>
              <div
                className={`tnum mt-1 text-[1rem] leading-none font-semibold ${
                  diff === 0 ? "text-faint" : up ? "text-up" : "text-down"
                }`}
              >
                {diff === 0 ? "sin cambio" : signed(diff)}
              </div>
              {diff !== 0 && (
                <div className="tnum text-faint mt-1 text-[0.64rem]">
                  {up ? "+" : "−"}
                  {Math.abs(pct).toFixed(1).replace(".", ",")}%
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
