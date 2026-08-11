import Link from "next/link";
import { clubHref, difficultyTone, type Fixture } from "@/lib/equipos";

/**
 * Envoltorio de una tarjeta de partido: lleva a la ficha del rival.
 *
 * Antes abría la página del partido en futbolfantasy, que es información de
 * otra web. Lo útil desde aquí es el club: quién es, cómo va y a quién tiene.
 * Si el rival no se reconoce (amistosos contra equipos de fuera) se queda en un
 * div y no enlaza a ninguna parte.
 */
function FixtureLink({
  rival,
  className,
  children,
}: {
  rival: { name: string };
  className: string;
  children: React.ReactNode;
}) {
  const href = clubHref(rival.name);
  if (!href) return <div className={className}>{children}</div>;
  return (
    <Link href={href} className={className} title={`Ver ${rival.name}`}>
      {children}
    </Link>
  );
}

/** ¿Es partido de liga? Los amistosos importan mucho menos. */
export function isLeague(fixture: Fixture): boolean {
  return /liga/i.test(fixture.competition);
}

/** Distintivo de dificultad. Con la palabra entera: "MD" no lo entiende nadie. */
export function DifficultyBadge({
  level,
  size = "md",
}: {
  level: Fixture["difficulty"];
  size?: "xs" | "sm" | "md";
}) {
  const tone = difficultyTone(level);
  const padding = {
    xs: "px-1 py-[1px] text-[0.5rem]",
    sm: "px-1.5 py-[2px] text-[0.55rem]",
    md: "px-2 py-[3px] text-[0.62rem]",
  }[size];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded font-bold tracking-wide ${padding}`}
      style={{ background: tone.bg, color: tone.ink }}
      title={`Dificultad: ${tone.label}`}
    >
      {tone.short}
    </span>
  );
}

/**
 * Tarjeta de partido, compacta. Los de liga llevan borde y fondo propios: en
 * pretemporada la mitad del calendario son amistosos que no puntúan, y
 * mezclarlos al mismo peso despista.
 */
function FixtureCard({ fixture, played }: { fixture: Fixture; played: boolean }) {
  const rival = fixture.atHome ? fixture.away : fixture.home;
  const league = isLeague(fixture);
  const tone = difficultyTone(fixture.difficulty);

  const outcome = {
    won: "bg-emerald-600 text-white",
    lost: "bg-rose-600 text-white",
    draw: "bg-amber-500 text-white",
  } as const;

  return (
    <FixtureLink
      rival={rival}
      className={`relative w-[178px] shrink-0 overflow-hidden rounded-xl border-2 transition-all hover:-translate-y-0.5 hover:shadow-md ${
        league ? "border-ink/15 bg-panel shadow-sm" : "border-line bg-panel-2/50 opacity-75"
      }`}
    >
      {/* Franja superior: jornada a la izquierda, dificultad ocupando el resto */}
      <div className="flex items-stretch">
        <span
          className={`px-2.5 py-1.5 text-[0.72rem] font-bold ${
            league ? "bg-ink text-white" : "text-faint bg-transparent"
          }`}
        >
          {league ? fixture.phase.replace("Jornada ", "J") : "Amistoso"}
        </span>
        {!played && (
          <span
            className="flex-1 py-1.5 text-center text-[0.66rem] font-bold tracking-wide"
            style={{ background: tone.bg, color: tone.ink }}
          >
            {tone.short}
          </span>
        )}
      </div>

      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          {rival.badge && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={rival.badge} alt="" width={32} height={32} className="shrink-0 object-contain" />
          )}
          <span className="truncate text-[0.92rem] font-bold">{rival.name}</span>
        </div>

        {played ? (
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`tnum rounded px-2 py-[3px] text-[0.85rem] font-bold ${
                fixture.outcome ? outcome[fixture.outcome] : "bg-panel-2 text-muted"
              }`}
            >
              {fixture.result ?? "—"}
            </span>
            <span className="text-lg" title={fixture.atHome ? "En casa" : "Fuera"}>
              {fixture.atHome ? "🏠" : "✈️"}
            </span>
          </div>
        ) : (
          <div className="text-ink mt-2 flex items-center gap-1.5 text-[0.8rem]">
            <span className="text-lg" title={fixture.atHome ? "En casa" : "Fuera"}>
              {fixture.atHome ? "🏠" : "✈️"}
            </span>
            {/* Sin recortar: es el dato que se venía a mirar. */}
            <span className="tnum font-semibold whitespace-nowrap">{fixture.date}</span>
          </div>
        )}
      </div>
    </FixtureLink>
  );
}

/**
 * Fila de partido, en vertical. Es el formato que aguanta un calendario
 * entero: 38 tarjetas en horizontal no se pueden leer.
 */
export function FixtureRow({
  fixture,
  played = false,
  compact = false,
}: {
  fixture: Fixture;
  played?: boolean;
  compact?: boolean;
}) {
  const rival = fixture.atHome ? fixture.away : fixture.home;
  const league = isLeague(fixture);
  const tone = difficultyTone(fixture.difficulty);

  const outcome = {
    won: "bg-emerald-600 text-white",
    lost: "bg-rose-600 text-white",
    draw: "bg-amber-500 text-white",
  } as const;

  return (
    <FixtureLink
      rival={rival}
      className={`flex items-center overflow-hidden rounded-lg border-2 transition-all hover:-translate-y-0.5 hover:shadow-md ${
        compact ? "min-h-[58px] gap-2.5" : "min-h-[62px] gap-4"
      } ${league ? "border-line bg-panel" : "border-line bg-panel-2/60 opacity-70"}`}
    >
      {/* Franja de dificultad, en vertical y a todo lo alto */}
      <span
        className={`flex shrink-0 items-center justify-center self-stretch px-1 text-center leading-tight font-bold ${compact ? "w-[64px] py-2 text-[0.58rem]" : "w-[86px] py-3 text-[0.68rem] tracking-wide"}`}
        style={
          played || !league
            ? { background: "var(--color-panel-2)", color: "var(--color-faint)" }
            : { background: tone.bg, color: tone.ink }
        }
      >
        {played || !league ? (league ? "JUGADO" : "AMISTOSO") : tone.short}
      </span>

      <span className={`text-faint shrink-0 font-bold ${compact ? "w-[26px] text-[0.72rem]" : "w-[44px] text-[0.82rem]"}`}>
        {league ? fixture.phase.replace("Jornada ", "J") : "—"}
      </span>

      {rival.badge && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={rival.badge} alt="" width={compact ? 26 : 32} height={compact ? 26 : 32} className="shrink-0 object-contain" />
      )}

      <span className={`min-w-0 flex-1 truncate font-bold ${compact ? "text-[0.84rem]" : "text-[1rem]"}`}>{rival.name}</span>

      <span className={`shrink-0 ${compact ? "text-lg" : "text-xl"}`} title={fixture.atHome ? "En casa" : "Fuera"}>
        {fixture.atHome ? "🏠" : "✈️"}
      </span>

      {played ? (
        <span
          className={`tnum shrink-0 rounded px-2.5 py-1.5 font-bold ${compact ? "mr-3 text-[0.82rem]" : "mr-4 text-[1rem]"} ${
            fixture.outcome ? outcome[fixture.outcome] : "bg-panel-2 text-muted"
          }`}
        >
          {fixture.result ?? "—"}
        </span>
      ) : (
        <span
          className={`tnum text-ink shrink-0 leading-tight font-semibold ${
            compact ? "mr-2.5 w-[52px] text-right text-[0.78rem]" : "mr-4 text-[0.88rem]"
          }`}
        >
          {compact ? <SplitDate value={fixture.date} /> : fixture.date}
        </span>
      )}
    </FixtureLink>
  );
}

/**
 * "Dom 30/08 · 21:30h" en dos líneas. Puesta en una sola hay que encogerla
 * tanto que no se lee; partida cabe casi al doble de tamaño.
 */
function SplitDate({ value }: { value: string }) {
  const [day, time] = value.split("·").map((p) => p.trim());
  if (!time) return <>{value}</>;
  return (
    <>
      <span className="block">{day}</span>
      <span className="text-muted block text-[0.7rem]">{time}</span>
    </>
  );
}

/**
 * El siguiente partido de liga, en una pastilla: escudo del rival, casa o
 * fuera y la dificultad de fondo. Es lo que se mira antes de decidir si un
 * jugador entra al once esta jornada.
 */
export function NextRival({
  fixtures,
  size = "md",
}: {
  fixtures: Fixture[] | null | undefined;
  size?: "sm" | "md";
}) {
  const next = fixtures?.find(isLeague);
  if (!next) return null;

  const rival = next.atHome ? next.away : next.home;
  const tone = difficultyTone(next.difficulty);
  const href = clubHref(rival.name);
  const small = size === "sm";

  const body = (
    <>
      {rival.badge && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={rival.badge}
          alt=""
          width={small ? 13 : 16}
          height={small ? 13 : 16}
          className="shrink-0 object-contain"
        />
      )}
      <span className={`truncate font-bold ${small ? "text-[0.56rem]" : "text-[0.64rem]"}`}>
        {rival.name}
      </span>
      <span className={small ? "text-[0.5rem]" : "text-[0.56rem]"}>
        {next.atHome ? "🏠" : "✈️"}
      </span>
    </>
  );

  const className = `inline-flex max-w-full items-center gap-1 rounded-md ${
    small ? "px-1 py-[1px]" : "px-1.5 py-[2px]"
  }`;
  const style = { background: tone.bg, color: tone.ink };
  const title = `${next.phase} · ${next.atHome ? "en casa contra" : "fuera contra"} ${rival.name} · ${tone.label}`;

  // `relative z-10`: casi siempre vive dentro de una fila o una ficha que ya es
  // un enlace al jugador.
  return href ? (
    <Link href={href} className={`${className} relative z-10`} style={style} title={title}>
      {body}
    </Link>
  ) : (
    <span className={className} style={style} title={title}>
      {body}
    </span>
  );
}

/**
 * Tira de los próximos partidos de liga: un cuadrito por partido con el color
 * de su dificultad, el escudo del rival y si es en casa o fuera. Sirve para
 * decidir un fichaje de un vistazo, sin abrir nada.
 */
export function FixtureStrip({ fixtures, limit = 5 }: { fixtures: Fixture[]; limit?: number }) {
  const league = fixtures.filter(isLeague).slice(0, limit);
  if (league.length === 0) return null;

  return (
    <div className="flex gap-1">
      {league.map((fixture) => {
        const rival = fixture.atHome ? fixture.away : fixture.home;
        const tone = difficultyTone(fixture.difficulty);
        const href = clubHref(rival.name);

        const body = (
          <>
            {rival.badge && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={rival.badge} alt="" width={18} height={18} className="object-contain" />
            )}
            <span className="text-[0.55rem] leading-none" style={{ color: tone.ink }}>
              {fixture.atHome ? "🏠" : "✈️"}
            </span>
          </>
        );

        const shared = "flex w-[38px] flex-col items-center gap-0.5 rounded px-0.5 py-1";
        const title = `${fixture.phase} · ${fixture.atHome ? "en casa contra" : "fuera contra"} ${rival.name} · ${tone.label}`;

        // `relative z-10`: la tira vive dentro de filas que ya son un enlace al
        // jugador, y sin levantarla el clic no llegaría hasta aquí.
        return href ? (
          <Link
            key={fixture.id}
            href={href}
            className={`${shared} relative z-10 transition-transform hover:scale-110`}
            style={{ background: tone.bg }}
            title={title}
          >
            {body}
          </Link>
        ) : (
          <span key={fixture.id} className={shared} style={{ background: tone.bg }} title={title}>
            {body}
          </span>
        );
      })}
    </div>
  );
}

export function NextFixtures({ fixtures, limit }: { fixtures: Fixture[]; limit?: number }) {
  if (fixtures.length === 0) {
    return <p className="text-faint text-sm">Sin próximos partidos publicados.</p>;
  }
  const shown = limit ? fixtures.slice(0, limit) : fixtures;
  return (
    <div className="flex flex-wrap gap-2.5">
      {shown.map((fixture) => (
        <FixtureCard key={fixture.id} fixture={fixture} played={false} />
      ))}
    </div>
  );
}

export function LastFixtures({ fixtures, limit }: { fixtures: Fixture[]; limit?: number }) {
  if (fixtures.length === 0) {
    return <p className="text-faint text-sm">Sin partidos jugados todavía.</p>;
  }
  const shown = limit ? fixtures.slice(-limit).reverse() : fixtures;
  return (
    <div className="flex flex-wrap gap-2.5">
      {shown.map((fixture) => (
        <FixtureCard key={fixture.id} fixture={fixture} played />
      ))}
    </div>
  );
}
