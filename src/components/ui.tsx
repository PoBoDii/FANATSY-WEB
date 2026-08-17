import Link from "next/link";
import type { Player, PlayerStatus, Position } from "@/lib/normalize";
import { type FfPlayer, type PlayerAlert, oddsTone, priceTone } from "@/lib/odds";
import { money, signed } from "@/lib/format";
import { clubHref } from "@/lib/equipos";

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
  // Sin lavados de color ni pastillas: un antetítulo en gris, el título en
  // grande y aire. La cabecera no tiene que competir con el contenido.
  return (
    <div className="border-line border-b">
      <div className="flex flex-wrap items-end justify-between gap-3 px-3.5 pt-4 pb-3.5 sm:gap-4 sm:px-6 sm:pt-8 sm:pb-6 lg:px-10">
        <div className="rise min-w-0">
          <span className="label">{eyebrow}</span>
          <h1 className="display text-ink mt-1.5 text-[clamp(1.75rem,7vw,3.2rem)] break-words">
            {title}
          </h1>
          {meta && <div className="text-muted mt-1.5 text-[0.82rem] sm:text-sm">{meta}</div>}
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
  // El color va sólo en la cifra, y sólo cuando significa algo. Ni fondos
  // degradados ni franjas: cuatro recuadros de colores seguidos convertían la
  // cabecera en un tablero de luces.
  const text = {
    neutral: "text-ink",
    acid: "text-acid",
    up: "text-up",
    down: "text-down",
  }[tone];

  return (
    <div
      className="border-line rise border-r border-b px-3.5 py-3 last:border-r-0 sm:px-5 sm:py-4"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="label">{label}</div>
      <div
        className={`tnum mt-1.5 text-[1.25rem] leading-none font-semibold whitespace-nowrap sm:text-[1.55rem] ${text}`}
      >
        {value}
      </div>
      {sub && <div className="text-faint mt-1.5 text-[0.68rem] sm:text-xs">{sub}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- jugador */

/**
 * Etiqueta de puesto, con las siglas y los colores del juego: POR, DEF, MED,
 * DEL. Van en plano y saturado, no en pastel, porque es la única marca de color
 * que lleva la tarjeta y tiene que reconocerse sin leerla.
 */
const POS_COLOR: Record<Position, string> = {
  PT: "#f2952b",
  DF: "#a855f7",
  MC: "#3b82f6",
  DL: "#eab308",
  EN: "#64748b",
  "?": "#6b7280",
};

/** Texto que va encima: el amarillo y el naranja no aguantan letra blanca. */
const POS_INK: Record<Position, string> = {
  PT: "#2a1600",
  DF: "#ffffff",
  MC: "#ffffff",
  DL: "#2a2200",
  EN: "#ffffff",
  "?": "#ffffff",
};

const POS_SHORT: Record<Position, string> = {
  PT: "POR",
  DF: "DEF",
  MC: "CEN",
  DL: "DEL",
  EN: "ENT",
  "?": "—",
};

/** El mismo color, para puntos y separadores. */
export const positionColor = (position: Position) => POS_COLOR[position];

export function PositionTag({ position, size = "md" }: { position: Position; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-bold tracking-wide ${
        size === "sm" ? "h-[17px] px-1.5 text-[0.55rem]" : "h-[20px] px-2 text-[0.62rem]"
      }`}
      style={{ background: POS_COLOR[position], color: POS_INK[position] }}
    >
      {POS_SHORT[position]}
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
      ? "bg-warn-soft border-warn/40"
      : status === "out"
        ? "bg-panel-2 border-line"
        : "bg-down-soft border-down/40";

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
    injury ? "border-down/40 bg-down text-white" : "border-line bg-panel text-info"
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

/**
 * Escudo y nombre de un club, enlazados a su ficha.
 *
 * Va con `relative z-10` porque casi siempre vive dentro de una fila que ya es
 * un enlace extendido al jugador: sin levantarlo, el clic se lo quedaría la
 * fila entera. Si el club no se reconoce, se pinta igual pero sin enlace.
 */
export function ClubLink({
  name,
  badge,
  size = 17,
  className = "",
  showName = true,
}: {
  name: string | null | undefined;
  badge?: string | null;
  size?: number;
  className?: string;
  /** En el campo sólo cabe el escudo; el nombre va en el `title`. */
  showName?: boolean;
}) {
  const inner = (
    <>
      <ClubBadge src={badge ?? null} size={size} />
      {showName && (name && name !== "—" ? name : "—")}
    </>
  );

  const base = `inline-flex items-center gap-1.5 ${className}`;
  const href = clubHref(name);

  if (!href) return <span className={base}>{inner}</span>;

  return (
    <Link
      href={href}
      className={`${base} hover:text-acid relative z-10 transition-colors hover:underline`}
      title={`Ver ${name}`}
    >
      {inner}
    </Link>
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

export function PlayerAvatar({
  player,
  size = 40,
  className = "",
}: {
  player: Player;
  size?: number;
  /** Para dar un tamaño distinto en el móvil sin tocar el de escritorio. */
  className?: string;
}) {
  return (
    <div
      className={`border-line bg-panel-2 relative shrink-0 overflow-hidden rounded-xl border ${className}`}
      style={className ? undefined : { width: size, height: size }}
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
    /**
     * Mejor decir "no hay dato" que no enseñar nada: así se distingue de un
     * fallo de la web.
     *
     * Y casi siempre es un "todavía no": futbolfantasy publica el once probable
     * de cada club a lo largo del día, unos antes que otros, así que un jugador
     * sin porcentaje por la mañana suele tenerlo por la tarde.
     */
    return (
      <span
        className={`tnum border-line text-faint shrink-0 rounded-sm border px-2 py-[3px] text-[0.7rem] leading-none ${className}`}
        title="futbolfantasy todavía no ha publicado el once probable de su equipo"
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
