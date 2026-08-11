import { difficultyTone, type Fixture } from "@/lib/equipos";

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
  size?: "sm" | "md";
}) {
  const tone = difficultyTone(level);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded font-bold tracking-wide ${
        size === "sm" ? "px-1.5 py-[2px] text-[0.55rem]" : "px-2 py-[3px] text-[0.62rem]"
      }`}
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
    <a
      href={fixture.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`relative min-w-[126px] flex-1 overflow-hidden rounded-xl border-2 transition-all hover:-translate-y-0.5 hover:shadow-md ${
        league ? "border-ink/15 bg-white shadow-sm" : "border-line bg-panel-2/50 opacity-75"
      }`}
    >
      {/* Franja superior: jornada a la izquierda, dificultad ocupando el resto */}
      <div className="flex items-stretch">
        <span
          className={`px-2 py-1 text-[0.62rem] font-bold ${
            league ? "bg-ink text-white" : "text-faint bg-transparent"
          }`}
        >
          {league ? fixture.phase.replace("Jornada ", "J") : "Amistoso"}
        </span>
        {!played && (
          <span
            className="flex-1 py-1 text-center text-[0.6rem] font-bold tracking-wide"
            style={{ background: tone.bg, color: tone.ink }}
          >
            {tone.short}
          </span>
        )}
      </div>

      <div className="px-2.5 py-2">
        <div className="flex items-center gap-2">
          {rival.badge && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={rival.badge} alt="" width={26} height={26} className="object-contain" />
          )}
          <span className="truncate text-[0.82rem] font-bold">{rival.name}</span>
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
          <div className="text-muted mt-1.5 flex items-center gap-1.5 text-[0.7rem]">
            <span className="text-base" title={fixture.atHome ? "En casa" : "Fuera"}>
              {fixture.atHome ? "🏠" : "✈️"}
            </span>
            <span className="tnum truncate font-medium">{fixture.date}</span>
          </div>
        )}
      </div>
    </a>
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
    <a
      href={fixture.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center overflow-hidden rounded-lg border-2 transition-all hover:-translate-y-0.5 hover:shadow-md ${
        compact ? "min-h-[42px] gap-2" : "min-h-[62px] gap-4"
      } ${league ? "border-line bg-white" : "border-line bg-panel-2/60 opacity-70"}`}
    >
      {/* Franja de dificultad, en vertical y a todo lo alto */}
      <span
        className={`flex shrink-0 items-center justify-center self-stretch px-1 text-center leading-tight font-bold ${compact ? "w-[62px] py-1.5 text-[0.52rem]" : "w-[86px] py-3 text-[0.68rem] tracking-wide"}`}
        style={
          played || !league
            ? { background: "var(--color-panel-2)", color: "var(--color-faint)" }
            : { background: tone.bg, color: tone.ink }
        }
      >
        {played || !league ? (league ? "JUGADO" : "AMISTOSO") : tone.short}
      </span>

      <span className={`text-faint shrink-0 font-bold ${compact ? "w-[34px] text-[0.62rem]" : "w-[44px] text-[0.82rem]"}`}>
        {league ? fixture.phase.replace("Jornada ", "J") : "—"}
      </span>

      {rival.badge && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={rival.badge} alt="" width={compact ? 20 : 32} height={compact ? 20 : 32} className="shrink-0 object-contain" />
      )}

      <span className={`min-w-0 flex-1 truncate font-bold ${compact ? "text-[0.75rem]" : "text-[1rem]"}`}>{rival.name}</span>

      <span className={`shrink-0 ${compact ? "text-base" : "text-xl"}`} title={fixture.atHome ? "En casa" : "Fuera"}>
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
          className={`tnum text-ink shrink-0 font-semibold ${
            compact ? "mr-2 text-[0.62rem]" : "mr-4 text-[0.88rem]"
          }`}
        >
          {fixture.date}
        </span>
      )}
    </a>
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
        return (
          <span
            key={fixture.id}
            className="flex w-[38px] flex-col items-center gap-0.5 rounded px-0.5 py-1"
            style={{ background: tone.bg }}
            title={`${fixture.phase} · ${fixture.atHome ? "en casa contra" : "fuera contra"} ${rival.name} · ${tone.label}`}
          >
            {rival.badge && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={rival.badge} alt="" width={18} height={18} className="object-contain" />
            )}
            <span className="text-[0.55rem] leading-none" style={{ color: tone.ink }}>
              {fixture.atHome ? "🏠" : "✈️"}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function NextFixtures({ fixtures }: { fixtures: Fixture[] }) {
  if (fixtures.length === 0) {
    return <p className="text-faint text-sm">Sin próximos partidos publicados.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {fixtures.map((fixture) => (
        <FixtureCard key={fixture.id} fixture={fixture} played={false} />
      ))}
    </div>
  );
}

export function LastFixtures({ fixtures }: { fixtures: Fixture[] }) {
  if (fixtures.length === 0) {
    return <p className="text-faint text-sm">Sin partidos jugados todavía.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {fixtures.map((fixture) => (
        <FixtureCard key={fixture.id} fixture={fixture} played />
      ))}
    </div>
  );
}
