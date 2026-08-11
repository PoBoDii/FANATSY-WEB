import Link from "next/link";
import type { Player, PlayerStatus, Position } from "@/lib/normalize";
import { type FfPlayer, type PlayerAlert, oddsTone, priceTone } from "@/lib/odds";
import { dateTime, money, num, signed } from "@/lib/format";
import { Countdown } from "./Countdown";
import { FixtureStrip } from "./Fixtures";
import type { Fixture } from "@/lib/equipos";

/* -------------------------------------------------------------- cabecera */

export function PageHeader({
  eyebrow,
  title,
  meta,
  action,
}: {
  eyebrow: string;
  title: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="border-line relative overflow-hidden border-b">
      {/* Un lavado de verde muy suave: da cuerpo a la cabecera sin ruido. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, rgba(13,122,68,0.16) 0%, rgba(13,122,68,0.05) 45%, transparent 74%)",
        }}
      />
      <div className="relative flex flex-wrap items-end justify-between gap-6 px-6 pt-8 pb-6 lg:px-10 lg:pt-11">
        <div className="rise">
          <span className="bg-acid inline-block rounded-full px-3 py-1 text-[0.68rem] font-bold tracking-wide text-white uppercase">
            {eyebrow}
          </span>
          <h1 className="display text-ink mt-3 text-[clamp(2.2rem,5.5vw,3.8rem)]">{title}</h1>
          {meta && <div className="text-muted mt-2.5 text-sm">{meta}</div>}
        </div>
        {action}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- estadística */

export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
  delay = 0,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "acid" | "up" | "down";
  delay?: number;
}) {
  // Cada tono trae su propio fondo y su franja lateral: el dato importante se
  // reconoce por color antes de leerlo.
  const styles = {
    neutral: { text: "text-ink", bar: "bg-ink/25", bg: "bg-white" },
    acid: { text: "text-acid", bar: "bg-acid", bg: "bg-emerald-50" },
    up: { text: "text-up", bar: "bg-up", bg: "bg-emerald-50" },
    down: { text: "text-down", bar: "bg-down", bg: "bg-rose-50" },
  }[tone];

  return (
    <div
      className={`border-line rise relative overflow-hidden border-r border-b px-5 py-4 last:border-r-0 ${styles.bg}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${styles.bar}`} />
      <div className="label">{label}</div>
      <div className={`tnum mt-2 text-[1.55rem] leading-none font-semibold ${styles.text}`}>
        {value}
      </div>
      {sub && <div className="text-faint mt-1.5 text-xs">{sub}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- jugador */

const POS_COLOR: Record<Position, string> = {
  PT: "bg-amber-500 text-white border-amber-600",
  DF: "bg-sky-600 text-white border-sky-700",
  MC: "bg-emerald-600 text-white border-emerald-700",
  DL: "bg-rose-600 text-white border-rose-700",
  EN: "bg-violet-600 text-white border-violet-700",
  "?": "bg-panel-2 text-faint border-line",
};

export function PositionTag({ position }: { position: Position }) {
  return (
    <span
      className={`tnum inline-flex h-5 w-9 shrink-0 items-center justify-center rounded border text-[0.62rem] font-semibold ${POS_COLOR[position]}`}
    >
      {position}
    </span>
  );
}

const STATUS_LABEL: Record<PlayerStatus, string | null> = {
  ok: null,
  injured: "Lesionado",
  doubtful: "Duda",
  suspended: "Sancionado",
  out: "Fuera de la liga",
};

/**
 * Iconos calcados de los del juego: círculo blanco con cruz roja para lesión,
 * ámbar con interrogante para duda, tarjeta roja para sanción. Se leen de un
 * vistazo sin tener que descifrar un punto de color.
 */
export function StatusIcon({ status, size = 14 }: { status: PlayerStatus; size?: number }) {
  if (status === "ok") return null;

  const common = { width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": true } as const;

  if (status === "injured") {
    return (
      <svg {...common} className="shrink-0">
        <circle cx="8" cy="8" r="7.4" fill="#ffffff" stroke="#d8412f" strokeWidth="1.2" />
        <path d="M6.6 3.4h2.8v3.2h3.2v2.8H9.4v3.2H6.6V9.4H3.4V6.6h3.2z" fill="#d8412f" />
      </svg>
    );
  }

  if (status === "doubtful") {
    return (
      <svg {...common} className="shrink-0">
        <circle cx="8" cy="8" r="8" fill="#ffb020" />
        <path
          d="M6.1 6.1a1.95 1.95 0 1 1 2.6 1.85c-.45.16-.7.5-.7.95v.5"
          fill="none"
          stroke="#1a1200"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="8" cy="12" r="1.15" fill="#1a1200" />
      </svg>
    );
  }

  if (status === "suspended") {
    return (
      <svg {...common} className="shrink-0">
        <rect x="3.5" y="1.5" width="9" height="13" rx="1.4" fill="#e0362a" />
      </svg>
    );
  }

  return (
    <svg {...common} className="shrink-0">
      <circle cx="8" cy="8" r="7.4" fill="#ffffff" stroke="#838e9a" strokeWidth="1.2" />
      <path d="M4.6 8h6.8" stroke="#838e9a" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Icono + texto, para listas donde hay sitio. */
export function StatusTag({ status }: { status: PlayerStatus }) {
  const label = STATUS_LABEL[status];
  if (!label) return null;

  const tone =
    status === "doubtful" ? "text-warn" : status === "out" ? "text-faint" : "text-down";

  const bg =
    status === "doubtful"
      ? "bg-amber-50 border-amber-200"
      : status === "out"
        ? "bg-panel-2 border-line"
        : "bg-rose-50 border-rose-200";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-[3px] font-semibold ${bg} ${tone}`}
    >
      <StatusIcon status={status} size={15} />
      <span className="text-[0.72rem]">{label}</span>
    </span>
  );
}

/**
 * Aviso de futbolfantasy: parte médico o noticia. Enlaza a la fuente, igual
 * que la lupa de su web.
 *
 * Es un `<a>` dentro de una fila que ya es un enlace, así que hay que parar la
 * propagación con `relative z-10` y que el padre no lo capture.
 */
export function AlertBadge({ alerts }: { alerts?: PlayerAlert[] | null }) {
  if (!alerts?.length) return null;
  // Si hay parte médico manda ese: es lo que más cambia una decisión.
  const alert = alerts.find((a) => a.kind === "injury") ?? alerts[0];
  const injury = alert.kind === "injury";

  const title = `${alert.label}${alert.tags.length ? ` · ${alert.tags.join(", ")}` : ""}`;
  const className = `inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border shadow-sm ${
    injury ? "border-down/40 bg-down text-white" : "border-line bg-white text-sky-600"
  }`;

  if (!alert.url) {
    return (
      <span className={className} title={title}>
        {injury ? <MedicalIcon /> : <NewsIcon />}
      </span>
    );
  }

  // `relative z-10` lo levanta por encima del enlace extendido de la fila, que
  // si no se llevaría el clic.
  return (
    <a
      href={alert.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${title} — abre la noticia en futbolfantasy`}
      className={`relative z-10 ${className}`}
    >
      {injury ? <MedicalIcon /> : <NewsIcon />}
    </a>
  );
}

function MedicalIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden fill="currentColor">
      <path d="M4.9 1h2.2v2.6H9.7v2.2H7.1V11H4.9V5.8H2.3V3.6h2.6z" />
    </svg>
  );
}

function NewsIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="5" cy="5" r="3.2" />
      <path d="M7.4 7.4 10.5 10.5" strokeLinecap="round" />
    </svg>
  );
}

/** Escudo del club; si no hay imagen, no ocupa sitio. */
export function ClubBadge({ src, size = 15 }: { src: string | null; size?: number }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}

export function PlayerAvatar({ player, size = 40 }: { player: Player; size?: number }) {
  return (
    <div
      className="border-line bg-panel-2 relative shrink-0 overflow-hidden rounded-lg border"
      style={{ width: size, height: size }}
    >
      {player.image ? (
        // Imágenes de CDN externo: <img> evita depender del optimizador.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={player.image}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover object-top"
          loading="lazy"
        />
      ) : (
        <div className="display text-faint flex h-full w-full items-center justify-center text-xs">
          {player.name.slice(0, 2)}
        </div>
      )}
    </div>
  );
}

export type LineupRole = "titular" | "suplente";

/** Si el jugador está en mi once de esta jornada o se ha quedado fuera. */
export function RoleTag({ role }: { role?: LineupRole | null }) {
  if (!role) return null;
  const titular = role === "titular";
  return (
    <span
      className={`label shrink-0 rounded-sm border px-1.5 py-[2px] text-[0.55rem] leading-none ${
        titular ? "border-up/50 bg-up/15 text-up" : "border-down/50 bg-down/15 text-down"
      }`}
    >
      {titular ? "Titular" : "Suplente"}
    </span>
  );
}

/** Flecha de dirección; se usa suelta y dentro de la pastilla de precio. */
export function TrendArrow({ up, size = 9 }: { up: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden className="shrink-0">
      <path
        d={up ? "M5 1 L9 7 H1 Z" : "M5 9 L1 3 H9 Z"}
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Variación de valor del día. Es el dato que más se mira del juego, así que va
 * en grande y con fondo de color: verde si sube, rojo si baja.
 */
export function PriceDelta({
  diff,
  pct,
  size = "md",
}: {
  diff: number | null | undefined;
  pct?: number | null;
  size?: "sm" | "md" | "lg";
}) {
  if (diff === null || diff === undefined) {
    return <span className="tnum text-faint text-[0.7rem]">s/d</span>;
  }
  if (diff === 0) {
    return <span className="tnum text-faint text-[0.7rem]">sin cambio</span>;
  }

  const up = diff > 0;
  const tone = priceTone(diff);
  const text = { sm: "text-[0.72rem]", md: "text-[0.95rem]", lg: "text-[1.15rem]" }[size];
  const pad = { sm: "px-1.5 py-[3px]", md: "px-2 py-[4px]", lg: "px-2.5 py-1" }[size];

  return (
    <span
      className={`tnum inline-flex items-center gap-1 rounded-md font-semibold whitespace-nowrap ${pad} ${text}`}
      style={{ background: tone.bg, color: tone.ink }}
      title={`${up ? "Sube" : "Baja"} ${money(Math.abs(diff))} respecto a ayer — ${tone.label}`}
    >
      <TrendArrow up={up} size={size === "lg" ? 11 : 9} />
      {signed(diff)}
      {pct != null && (
        <span className="opacity-75">
          {up ? "+" : "−"}
          {Math.abs(pct).toFixed(1).replace(".", ",")}%
        </span>
      )}
    </span>
  );
}

/** Pastilla compacta para superponer sobre la foto en el campo. */
export function PricePill({ diff }: { diff: number | null | undefined }) {
  if (!diff) return null;
  const tone = priceTone(diff);
  return (
    <span
      className="tnum inline-flex items-center gap-[2px] rounded-md px-1.5 py-[2px] text-[0.62rem] leading-none font-bold shadow-sm"
      style={{ background: tone.bg, color: tone.ink }}
      title={`${diff > 0 ? "Sube" : "Baja"} ${money(Math.abs(diff))} hoy — ${tone.label}`}
    >
      <TrendArrow up={diff > 0} size={8} />
      {money(Math.abs(diff))}
    </span>
  );
}

/** Probabilidad de ser titular, en grande y con el color de su tramo. */
export function OddsChip({
  odds,
  className = "",
}: {
  odds: FfPlayer | null | undefined;
  className?: string;
}) {
  const probability = odds?.probability;
  if (probability == null) {
    // Mejor decir "no hay dato" que no enseñar nada: así se distingue de un
    // fallo de la web.
    return (
      <span
        className={`tnum border-line text-faint shrink-0 rounded-sm border px-2 py-[3px] text-[0.7rem] leading-none ${className}`}
        title="futbolfantasy no publica probabilidad para este jugador"
      >
        s/d
      </span>
    );
  }
  const tone = oddsTone(probability);
  return (
    <span
      className={`tnum shrink-0 rounded-sm px-2 py-[3px] text-[0.85rem] leading-none font-semibold ${className}`}
      style={{ background: tone.color, color: tone.ink }}
      title={`${tone.label} — ${probability}% de salir de titular`}
    >
      {probability}%
    </span>
  );
}

/**
 * Fila de jugador. Densa a propósito: en vez de aire, cada franja lleva un
 * dato. La barra vertical de la izquierda repite el color de la probabilidad
 * para poder barrer la lista de un vistazo sin leer los números.
 */
export function PlayerRow({
  player,
  leagueId,
  odds,
  role,
  right,
  highlight,
  fixtures,
  compact = false,
  delay = 0,
}: {
  player: Player;
  leagueId: string | null;
  odds?: FfPlayer | null;
  role?: LineupRole | null;
  right?: React.ReactNode;
  /** Criterio de ordenación activo: su dato se agranda en el centro. */
  highlight?: string;
  /** Próximos partidos de su club, para el calendario en miniatura. */
  fixtures?: Fixture[] | null;
  /** Para columnas estrechas: deja sólo lo imprescindible. */
  compact?: boolean;
  delay?: number;
}) {
  const tone = odds?.probability != null ? oddsTone(odds.probability) : null;

  const body = (
    <>
      {/* Barra de probabilidad, a la izquierda del todo */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[4px]"
        style={{ background: tone?.color ?? "transparent" }}
      />

      <div className="relative shrink-0">
        <PlayerAvatar player={player} size={52} />
        {player.status !== "ok" && (
          <span className="absolute -top-1.5 -right-1.5">
            <StatusIcon status={player.status} size={20} />
          </span>
        )}
      </div>

      <div className={`min-w-0 ${compact ? "flex-[2]" : "w-[190px] shrink-0"}`}>
        <div className="flex items-center gap-2">
          <PositionTag position={player.position} />
          <span className="truncate text-[1.02rem] leading-tight font-bold">{player.name}</span>
          <AlertBadge alerts={odds?.alerts} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-muted inline-flex items-center gap-1.5 text-[0.78rem] font-medium">
            <ClubBadge src={player.clubBadge} size={17} />
            {player.clubName}
          </span>
          <RoleTag role={role} />
          {compact && <StatusTag status={player.status} />}
        </div>
      </div>

      {!compact && (
        <>
          {/* Estado, cuando lo hay: ocupa su sitio en vez de apretujarse */}
          <div className="hidden w-[118px] shrink-0 xl:block">
            <StatusTag status={player.status} />
          </div>

          {/* Calendario: los cinco próximos de liga con su dificultad */}
          {fixtures && fixtures.length > 0 && (
            <div className="hidden shrink-0 xl:block">
              <div className="label mb-1 text-[0.55rem]">Calendario</div>
              <FixtureStrip fixtures={fixtures} />
            </div>
          )}
        </>
      )}

      {!compact && (
        <div className="hidden w-[74px] shrink-0 text-center sm:block">
          <div className="label text-[0.55rem]">Juega</div>
          <div className="mt-1.5 flex justify-center">
            <OddsChip odds={odds} />
          </div>
        </div>
      )}

      {/* El dato por el que estás ordenando, en grande y en el hueco central */}
      {!compact && <Highlighted player={player} odds={odds} sort={highlight} />}

      {right ??
        (compact ? (
          /* En columna estrecha nada de `ml-auto`: los tres datos se reparten
             el hueco que sobra en vez de amontonarse contra el borde. */
          <>
            <div className="flex flex-[3] items-center justify-evenly gap-2">
              <div className="text-center">
                <div className="label text-[0.55rem] leading-none">Juega</div>
                <div className="mt-1.5 flex justify-center">
                  <OddsChip odds={odds} />
                </div>
              </div>

              <div className="text-center">
                <div className="label text-[0.55rem] leading-none">Puntos</div>
                <div className="tnum text-ink mt-1.5 text-[1.3rem] leading-none font-bold">
                  {num(player.points)}
                </div>
                <div className="tnum text-faint mt-1.5 text-[0.66rem] leading-none">
                  {num(player.averagePoints, 1)} media
                </div>
              </div>

              <div className="text-center">
                <div className="label text-[0.55rem] leading-none">Valor</div>
                <div className="tnum text-ink mt-1.5 text-[1.3rem] leading-none font-bold">
                  {money(player.marketValue)}
                </div>
                <div className="mt-1.5 flex justify-center">
                  <PriceDelta diff={odds?.diff} size="sm" />
                </div>
              </div>
            </div>
            <ClauseBlock player={player} compact />
          </>
        ) : (
          <>
            <div className="ml-auto w-[84px] shrink-0 text-right">
              <div className="label text-[0.55rem] leading-none">Puntos</div>
              <div className="tnum text-ink mt-1.5 text-[1.25rem] leading-none font-bold">
                {num(player.points)}
              </div>
              <div className="tnum text-faint mt-1 text-[0.66rem]">
                {num(player.averagePoints, 1)} media
              </div>
            </div>

            <div className="w-[136px] shrink-0 text-right">
              <div className="label text-[0.55rem] leading-none">Valor</div>
              <div className="tnum text-ink mt-1.5 text-[1.25rem] leading-none font-bold">
                {money(player.marketValue)}
              </div>
              <div className="mt-1.5 flex justify-end">
                <PriceDelta diff={odds?.diff} pct={odds?.diffPct} size="sm" />
              </div>
            </div>
            <ClauseBlock player={player} />
          </>
        ))}
    </>
  );

  return (
    <div
      className="border-line rise hover:bg-panel-2 relative flex items-center gap-3 border-b py-3 pr-3 pl-4 transition-colors lg:gap-4 lg:pl-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Enlace extendido: cubre la fila entera sin envolver su contenido, así
          la insignia de aviso puede ser su propio enlace sin anidar <a>. */}
      {leagueId && (
        <Link
          href={`/jugador/${player.id}`}
          className="absolute inset-0"
          aria-label={player.name}
        />
      )}
      {body}
    </div>
  );
}

/**
 * El dato del criterio por el que estás ordenando, en grande y en el hueco
 * que queda entre el nombre y las columnas. Así la lista responde a lo que has
 * pedido en vez de enseñar siempre lo mismo.
 */
function Highlighted({
  player,
  odds,
  sort,
}: {
  player: Player;
  odds?: FfPlayer | null;
  sort?: string;
}) {
  if (!sort || sort === "posicion") return null;

  const clause = player.buyoutClause ?? 0;
  const block = (label: string, node: React.ReactNode) => (
    <div className="hidden min-w-0 flex-1 flex-col items-center justify-center md:flex">
      <span className="label text-[0.55rem] leading-none">{label}</span>
      <div className="mt-1.5">{node}</div>
    </div>
  );

  const big = "tnum text-[1.45rem] leading-none font-semibold";

  switch (sort) {
    case "cambio":
      return block("Cambio de valor", <PriceDelta diff={odds?.diff} pct={odds?.diffPct} size="lg" />);
    case "margen":
      return block(
        "Cláusula sobre valor",
        <span className={`${big} text-warn`}>{clause ? signed(clause - player.marketValue) : "—"}</span>,
      );
    case "clausula": {
      if (!clause) return block("Cláusula", <span className="text-faint text-sm">sin cláusula</span>);
      const unlockAt = player.buyoutUnlockAt;
      const open = !unlockAt || new Date(unlockAt).getTime() <= Date.now();
      return block(
        open ? "Cláusula abierta" : "Se abre en",
        <div className="flex flex-col items-center gap-1.5">
          <span className={`${big} text-down`}>{money(clause)}</span>
          {unlockAt && !open ? (
            <>
              <Countdown until={unlockAt} />
              <span className="tnum text-muted text-[0.68rem] whitespace-nowrap">
                {dateTime(unlockAt)}
              </span>
            </>
          ) : (
            <span className="tnum text-down text-[0.72rem] font-semibold">
              cualquiera puede pagarla
            </span>
          )}
        </div>,
      );
    }
    case "precio":
      return block("Valor", <span className={`${big} text-ink`}>{money(player.marketValue)}</span>);
    case "prob":
      return block(
        "Probabilidad",
        odds?.probability != null ? (
          <span
            className={`${big} rounded-lg px-2.5 py-1`}
            style={{
              background: oddsTone(odds.probability).color,
              color: oddsTone(odds.probability).ink,
            }}
          >
            {odds.probability}%
          </span>
        ) : (
          <span className="text-faint text-sm">s/d</span>
        ),
      );
    case "puntos":
      return block("Puntos", <span className={`${big} text-acid`}>{num(player.points)}</span>);
    case "media":
      return block(
        "Media",
        <span className={`${big} text-acid`}>{num(player.averagePoints, 1)}</span>,
      );
    default:
      return null;
  }
}

/**
 * La cláusula es el dato que más duele si se te pasa, así que va en su propio
 * bloque enmarcado, con la cuenta atrás hasta que el jugador queda expuesto.
 */
export function ClauseBlock({ player, compact = false }: { player: Player; compact?: boolean }) {
  if (!player.buyoutClause) return null;

  const unlockAt = player.buyoutUnlockAt;
  const urgent =
    !unlockAt || new Date(unlockAt).getTime() - Date.now() < 24 * 3600 * 1000;

  const open = !unlockAt || new Date(unlockAt).getTime() <= Date.now();

  return (
    <div
      className={`${compact ? "w-[132px]" : "w-[152px]"} shrink-0 rounded-md border px-2.5 py-1.5 ${
        open
          ? "border-down bg-down/15"
          : urgent
            ? "border-down/60 bg-down/10"
            : "border-line bg-panel-2/60"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className={`label text-[0.55rem] leading-none ${open ? "text-down" : ""}`}>
          Cláusula
        </span>
        {open && (
          <span className="label bg-down rounded-sm px-1 py-[1px] text-[0.5rem] leading-none text-black">
            Abierta
          </span>
        )}
      </div>

      <div
        className={`tnum mt-1.5 text-[1.25rem] leading-none font-semibold ${
          open || urgent ? "text-down" : "text-ink"
        }`}
      >
        {money(player.buyoutClause)}
      </div>

      {/* Lo que cuesta por encima de su valor: el sobreprecio real de robarlo. */}
      <div
        className="tnum text-warn mt-1.5 text-[0.85rem] leading-none font-semibold whitespace-nowrap"
        title="Diferencia entre la cláusula y el valor actual del jugador"
      >
        {signed(player.buyoutClause - player.marketValue)}
        <span className="text-faint ml-1 text-[0.62rem] font-normal">s/ valor</span>
      </div>

      <div className="mt-1.5">
        {unlockAt && !open ? (
          <Countdown until={unlockAt} />
        ) : (
          <span className="tnum text-down text-[0.7rem] font-semibold">
            cualquiera puede pagarla
          </span>
        )}
      </div>

      {unlockAt && !open && (
        <div
          className={`tnum mt-1 text-[0.62rem] leading-tight whitespace-nowrap ${
            urgent ? "text-down" : "text-muted"
          }`}
          title="Momento exacto en que se desbloquea la cláusula"
        >
          libre {dateTime(unlockAt)}
        </div>
      )}
    </div>
  );
}

/** Variación de valor de mercado, coloreada. */
export function ValueDelta({ delta }: { delta: number | undefined }) {
  if (!delta) return <span className="text-faint tnum text-xs">—</span>;
  return (
    <span className={`tnum text-xs ${delta > 0 ? "text-up" : "text-down"}`}>
      {signed(delta)}
    </span>
  );
}

/* ------------------------------------------------------------- estados */

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="border-line m-6 border border-dashed px-6 py-14 text-center lg:m-10">
      <div className="display text-faint text-xl">{title}</div>
      {hint && <p className="text-faint mx-auto mt-3 max-w-md text-sm">{hint}</p>}
    </div>
  );
}

export function ErrorBox({ error, hint }: { error: string; hint?: string }) {
  return (
    <div className="border-down/40 bg-down/5 m-6 border px-6 py-6 lg:m-10">
      <div className="label text-down">No se pudo cargar</div>
      <p className="tnum mt-2 text-sm break-words">{error}</p>
      {hint && <p className="text-muted mt-3 text-sm">{hint}</p>}
    </div>
  );
}

export function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="border-line flex items-baseline gap-3 border-b px-5 py-3 lg:px-6">
        <h2 className="display text-lg">{title}</h2>
        {count !== undefined && <span className="tnum text-faint text-xs">{count}</span>}
      </div>
      {children}
    </section>
  );
}
