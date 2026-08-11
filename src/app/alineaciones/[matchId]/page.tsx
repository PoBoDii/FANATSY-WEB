import Link from "next/link";
import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import {
  getClubLineup,
  getLineup,
  getMatches,
  lineupKey,
  type LineupSlot,
  type Match,
} from "@/lib/alineaciones";
import { getFf, normalizeName } from "@/lib/futbolfantasy";
import { findTeamByName, opponentDifficulty, squadValues, type TeamRef } from "@/lib/equipos";
import { findRecord, getStrengthTable } from "@/lib/clasificacion";
import { forecast, forecastLabel } from "@/lib/pronostico";
import { MatchForecast } from "@/components/MatchForecast";
import { ffPhoto, oddsTone } from "@/lib/odds";
import { playersOfTeam, toList, toManager } from "@/lib/normalize";
import { managerColor } from "@/lib/managers";
import { BackLink } from "@/components/BackLink";
import { getIdResolver, type IdResolver } from "@/lib/cruce";
import { Empty, ErrorBox, PageHeader } from "@/components/ui";
import { PlayerPhoto } from "@/components/PlayerPhoto";

export const dynamic = "force-dynamic";

/** De quién es un jugador dentro de mi liga. */
type Owner = { manager: string; isMe: boolean; color: string; playerId: string };

export default async function PartidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ j?: string }>;
}) {
  const { matchId } = await params;
  const { j } = await searchParams;
  const round = Math.min(38, Math.max(1, Number(j) || 1));

  const session = await getSession();
  const league = session.active;

  const [matches, { data: teamsRaw }, ff, resolveId] = await Promise.all([
    getMatches(round),
    league ? safe(fantasy.leagueTeams(league.id)) : Promise.resolve({ data: null, error: null }),
    getFf(),
    getIdResolver(),
  ]);

  const match = matches.find((m) => m.id === matchId);
  if (!match) {
    return (
      <>
        <Back round={round} />
        <ErrorBox
          error="Partido no encontrado en esta jornada"
          hint="Vuelve a la jornada y elige uno de la lista."
        />
      </>
    );
  }

  const homeTeamRef = findTeamByName(match.home.name);
  const awayTeamRef = findTeamByName(match.away.name);

  let [home, away] = await Promise.all([
    getLineup(match.id, match.home.teamId),
    getLineup(match.id, match.away.teamId),
  ]);

  // Para los partidos lejanos futbolfantasy aún no publica alineación (los
  // aplazados de la jornada 1, por ejemplo). Se recurre al once que proyectan
  // para el siguiente partido de cada club, avisando de que es ese.
  const borrowed = home.length === 0 || away.length === 0;
  if (borrowed) {
    const [h, a] = await Promise.all([
      home.length === 0 && homeTeamRef
        ? getClubLineup(homeTeamRef.slug, match.home.teamId)
        : Promise.resolve(home),
      away.length === 0 && awayTeamRef
        ? getClubLineup(awayTeamRef.slug, match.away.teamId)
        : Promise.resolve(away),
    ]);
    home = h;
    away = a;
  }

  // Pronóstico: cada club ve el mismo partido con una dificultad distinta, y
  // esa discrepancia es la señal. Se completa con el valor de las plantillas.
  const homeTeam = homeTeamRef;
  const awayTeam = awayTeamRef;
  const [homeDifficulty, awayDifficulty] = await Promise.all([
    homeTeam ? opponentDifficulty(homeTeam.slug, match.id) : Promise.resolve(null),
    awayTeam ? opponentDifficulty(awayTeam.slug, match.id) : Promise.resolve(null),
  ]);
  const values = squadValues(ff.all);
  const standings = await getStrengthTable();
  const averageValue =
    values.size > 0 ? [...values.values()].reduce((a, b) => a + b, 0) / values.size : null;

  const prediction = forecast({
    standings,
    homeRecord: standings && homeTeam ? findRecord(standings, homeTeam.slug) : undefined,
    awayRecord: standings && awayTeam ? findRecord(standings, awayTeam.slug) : undefined,
    homeSquadValue: homeTeam ? values.get(homeTeam.ffId) : null,
    awaySquadValue: awayTeam ? values.get(awayTeam.ffId) : null,
    averageSquadValue: averageValue,
    homeDifficulty,
    awayDifficulty,
  });

  // Qué puesto ocupa en el orden de la jornada, por hora de comienzo.
  const order = matches.findIndex((m) => m.id === match.id) + 1;

  /**
   * Quién tiene a quién en mi liga, por nombre normalizado.
   *
   * El nombre completo manda; el corto ("Llorente") sólo vale si es único en
   * toda la liga. Antes se metían los dos sin más y el último ganaba, así que
   * un jugador podía salir atribuido a otro manager: por eso el contador decía
   * que tenías tres en un partido teniendo dos.
   */
  const owners = new Map<string, Owner>();
  const shortNames = new Map<string, Owner | null>();

  toList(teamsRaw).forEach((raw, i) => {
    const manager = toManager(raw, i, league?.myTeamId ?? null);
    const color = managerColor(i, manager.isMe);
    for (const player of playersOfTeam(raw)) {
      const owner = {
        manager: manager.name,
        isMe: manager.isMe,
        color,
        playerId: player.id,
      };
      owners.set(normalizeName(player.fullName || player.name), owner);

      const short = normalizeName(player.name);
      // null = ambiguo, lo tiene más de uno con ese nombre corto.
      if (shortNames.has(short)) {
        const seen = shortNames.get(short);
        if (seen && seen.playerId !== owner.playerId) shortNames.set(short, null);
      } else {
        shortNames.set(short, owner);
      }
    }
  });

  for (const [short, owner] of shortNames) {
    if (owner && !owners.has(short)) owners.set(short, owner);
  }

  const ownerOf = (slug: string) => owners.get(slug) ?? null;

  /**
   * Id de LaLiga de un jugador de futbolfantasy, si se puede determinar. Los
   * que están fichados en mi liga lo traen directo; para el resto se cruza por
   * valor de mercado y equipo.
   */
  const idOf = (player: { slug: string; name: string }, ffTeamId: string): string | null => {
    const key = lineupKey(player as never);
    const alias = normalizeName(player.name);
    return (
      owners.get(key)?.playerId ??
      owners.get(alias)?.playerId ??
      resolveId.fromRow(ff.byName(key)) ??
      resolveId.fromRow(ff.byName(alias)) ??
      // Último recurso: contra el listado de LaLiga directamente. Cubre a quien
      // futbolfantasy alinea pero no lista en su mercado.
      resolveId.fromName(alias, ffTeamId)
    );
  };

  /**
   * Cuántos jugadores del partido son de cada uno. Sólo cuentan los favoritos
   * de cada hueco (no las alternativas, que son quienes *podrían* jugar) y se
   * cuenta cada jugador una vez.
   */
  const counted = new Set<string>();
  let mine = 0;
  let rivals = 0;
  for (const slot of [...home, ...away]) {
    const main = slot.players[0];
    if (!main) continue;
    const key = lineupKey(main);
    if (counted.has(key)) continue;
    counted.add(key);
    const owner = ownerOf(key);
    if (!owner) continue;
    if (owner.isMe) mine++;
    else rivals++;
  }

  return (
    <>
      <Back round={round} />
      <PageHeader
        eyebrow={`Jornada ${round}`}
        title={`${match.home.name} — ${match.away.name}`}
        meta={
          <>
            <div>
              {mine > 0
                ? `Tienes ${mine} ${mine === 1 ? "jugador" : "jugadores"} en el once`
                : "No tienes a nadie en el once"}
            </div>
            <div className="text-faint mt-1">
              {rivals > 0
                ? `${rivals} ${rivals === 1 ? "jugador" : "jugadores"} de tus rivales`
                : "Ninguno de tus rivales"}
            </div>
          </>
        }
        action={
          <div className="border-line rounded-xl border bg-white px-4 py-2.5 text-center shadow-sm">
            <div className="label">Se juega</div>
            <div className="tnum text-ink mt-1 text-[1.15rem] leading-none font-semibold">
              {match.kickoff}
            </div>
            {order > 0 && (
              <div className="text-faint mt-1 text-[0.68rem] font-semibold">
                {order === 1
                  ? "Abre la jornada"
                  : order === matches.length
                    ? "Cierra la jornada"
                    : `${order}º de ${matches.length} partidos`}
              </div>
            )}
          </div>
        }
      />

      <div className="flex h-1.5">
        <span className="flex-1" style={{ background: homeTeamRef?.color ?? "#cbd5e1" }} />
        <span className="flex-1" style={{ background: awayTeamRef?.color ?? "#cbd5e1" }} />
      </div>

      <MatchForecast
        forecast={prediction}
        home={match.home}
        away={match.away}
        label={forecastLabel(prediction, match.home.name, match.away.name)}
      />

      {borrowed && (home.length > 0 || away.length > 0) && (
        <p className="border-line text-muted border-b bg-amber-50 px-6 py-2.5 text-[0.78rem] lg:px-10">
          futbolfantasy todavía no publica el once de este partido. Se muestra el que proyectan
          para el siguiente encuentro de cada equipo.
        </p>
      )}

      {home.length === 0 && away.length === 0 ? (
        <Empty
          title="Sin once probable"
          hint="futbolfantasy aún no ha publicado las alineaciones de este partido."
        />
      ) : (
        <div className="grid gap-3 p-2.5 sm:p-4 lg:grid-cols-2 lg:items-stretch lg:gap-5 lg:p-6">
          <TeamPitch
            side={match.home}
            slots={home}
            ownerOf={ownerOf}
            idOf={idOf}
            local
            club={homeTeam}
          />
          <TeamPitch
            side={match.away}
            slots={away}
            ownerOf={ownerOf}
            idOf={idOf}
            local={false}
            club={awayTeam}
          />
        </div>
      )}
    </>
  );
}

function Back({ round }: { round: number }) {
  return (
    <div className="border-line border-b px-6 pt-6 lg:px-10">
      <BackLink href={`/alineaciones?j=${round}`} label={`Jornada ${round}`} />
    </div>
  );
}

const LINES: LineupSlot["position"][] = ["PT", "DF", "MC", "DL"];

/** Ficha de LaLiga de un jugador del once, si se puede determinar. */
type IdOf = (player: { slug: string; name: string }, ffTeamId: string) => string | null;

function TeamPitch({
  side,
  slots,
  ownerOf,
  idOf,
  local,
  club,
}: {
  side: Match["home"];
  slots: LineupSlot[];
  ownerOf: (key: string) => Owner | null;
  idOf: IdOf;
  local: boolean;
  club: TeamRef | undefined;
}) {
  const starters = slots.filter((s) => s.starter);
  const bench = slots.filter((s) => !s.starter);
  const lines = LINES.map((pos) => starters.filter((s) => s.position === pos)).filter(
    (line) => line.length > 0,
  );

  // Los que no encajan en ninguna línea (posición desconocida) van al final
  // del campo antes que perderse.
  const placed = new Set(lines.flat());
  const loose = starters.filter((s) => !placed.has(s));
  if (loose.length) lines.push(loose);

  return (
    <section className="border-line flex h-full flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
      <header
        className="flex h-[62px] shrink-0 items-center gap-2.5 border-b-4 px-3 sm:h-[68px] sm:gap-3 sm:px-4"
        style={{ borderColor: club?.color ?? "var(--color-line)" }}
      >
        {side.badge && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={side.badge} alt="" width={30} height={30} className="object-contain" />
        )}
        <div className="min-w-0">
          <div className="display truncate text-base">{side.name}</div>
          <div className="label">{local ? "Local" : "Visitante"}</div>
        </div>
        <span className="tnum text-faint ml-auto text-xs">{starters.length} titulares</span>
      </header>

      {/* Campo */}
      <div className="relative flex-1">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: "repeating-linear-gradient(180deg, #2f7d4f 0 56px, #2a7348 56px 112px)",
          }}
        />
        <svg
          aria-hidden
          viewBox="0 0 100 140"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          style={{ stroke: "rgba(255,255,255,0.32)", fill: "none", strokeWidth: 0.35 }}
        >
          <rect x="3" y="3" width="94" height="134" />
          <line x1="3" y1="70" x2="97" y2="70" />
          <circle cx="50" cy="70" r="13" />
          <rect x="26" y="3" width="48" height="20" />
          <rect x="26" y="117" width="48" height="20" />
        </svg>

        {/* Altura fija e igual en los dos campos: las líneas se reparten el
            espacio, así que una formación con más líneas las junta más en vez
            de estirar el campo. */}
        <div className="relative flex h-[360px] flex-col justify-around px-1 py-3 sm:h-[440px] sm:px-2 sm:py-4 lg:h-[560px] lg:py-6">
          {lines.map((line, i) => (
            <div key={i} className="flex justify-center gap-1 sm:gap-1.5 lg:gap-2.5">
              {line.map((slot, k) => (
                <SlotToken
                  key={slot.ffId}
                  slot={slot}
                  ownerOf={ownerOf}
                  idOf={idOf}
                  ffTeamId={side.teamId}
                  delay={i * 70 + k * 35}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Banquillo */}
      {bench.length > 0 && (
        <div className="border-line border-t px-3 py-3">
          <div className="label mb-2">Alternativas · {bench.length}</div>
          <div className="flex flex-wrap gap-2">
            {bench.map((slot) => (
              <SlotToken
                key={slot.ffId}
                slot={slot}
                ownerOf={ownerOf}
                idOf={idOf}
                ffTeamId={side.teamId}
                delay={0}
                compact
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SlotToken({
  slot,
  ownerOf,
  idOf,
  ffTeamId,
  delay,
  compact = false,
}: {
  slot: LineupSlot;
  ownerOf: (key: string) => Owner | null;
  idOf: IdOf;
  ffTeamId: string;
  delay: number;
  compact?: boolean;
}) {
  const [main, ...alternatives] = slot.players;
  const tone = slot.probability !== null ? oddsTone(slot.probability) : null;
  const owner = ownerOf(lineupKey(main));
  const playerId = idOf(main, ffTeamId);
  const photo = ffPhoto(main.ffId || slot.ffId);
  const size = compact ? 36 : 46;

  return (
    <div
      className={`rise relative flex flex-col items-center ${compact ? "w-[52px] sm:w-[58px]" : "w-[54px] sm:w-[62px] lg:w-[72px]"}`}
      style={{ animationDelay: `${delay}ms` }}
      title={
        alternatives.length
          ? `También pueden jugar: ${alternatives.map((a) => a.name).join(", ")}`
          : undefined
      }
    >
      {/* Enlace extendido a la ficha: la foto entera es el objetivo. */}
      {playerId && (
        <Link href={`/jugador/${playerId}`} className="absolute inset-0 z-10" aria-label={main.name} />
      )}
      <div className={`relative ${playerId ? "transition-transform hover:-translate-y-1" : ""}`}>
        <div
          className="overflow-hidden rounded-lg border-[3px] bg-white shadow-md"
          style={{
            width: size,
            height: size,
            borderColor: owner?.color ?? "#ffffff",
            // El halo repite el color del manager: mismo código que la etiqueta.
            boxShadow: owner ? `0 0 0 4px ${owner.color}55` : undefined,
          }}
        >
          <PlayerPhoto
            src={photo}
            fallback={ffPhoto("00")}
            name={main.name}
            size={size}
            className="h-full w-full"
          />
        </div>

        {slot.probability !== null && (
          <span
            className="tnum absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-md px-1.5 py-[2px] text-[0.68rem] leading-none font-bold shadow"
            style={{ background: tone!.color, color: tone!.ink }}
          >
            {slot.probability}%
          </span>
        )}
      </div>

      <div className="mt-2.5 w-full rounded-md bg-white/95 px-1 py-1 text-center shadow-sm">
        <div className="truncate text-[0.68rem] leading-tight font-semibold">{main.name}</div>

        {/* Quien le puede quitar el puesto, como en futbolfantasy */}
        {alternatives.slice(0, 2).map((alt) => (
          <div key={alt.slug} className="text-faint truncate text-[0.6rem] leading-tight">
            {alt.name}
          </div>
        ))}
      </div>

      {owner && (
        <span
          className="mt-1 max-w-full truncate rounded px-1.5 py-[2px] text-[0.58rem] leading-tight font-bold text-white ring-1 ring-white/70"
          style={{ background: owner.color }}
        >
          {owner.isMe ? "TUYO" : owner.manager}
        </span>
      )}
    </div>
  );
}
