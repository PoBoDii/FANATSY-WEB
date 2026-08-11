"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { money, num } from "@/lib/format";
import { oddsTone, type PlayerAlert } from "@/lib/odds";
import { Countdown } from "./Countdown";
import { AlertBadge, PriceDelta } from "./ui";

export type PriceEntry = {
  /** Nombre normalizado; es la clave del cruce. */
  name: string;
  displayName: string;
  image: string | null;
  clubBadge: string | null;
  club: string;
  teamId: string | null;
  position: string | null;
  /** Id de LaLiga, sólo si el jugador pertenece a alguien de la liga. */
  playerId: string | null;
  value: number;
  previousValue: number | null;
  diff: number;
  diffPct: number | null;
  streak: number;
  probability: number | null;
  alerts: PlayerAlert[];
  ownerName: string | null;
  ownerIsMe: boolean;
  buyoutClause: number | null;
  buyoutUnlockAt: string | null;
};

/* ---------------------------------------------------------------- filtros */

/** Multi-selección compacta: cada opción es un botón que se enciende. */
function Chips({
  options,
  selected,
  onToggle,
  tone = "acid",
}: {
  options: [string, string][];
  selected: Set<string>;
  onToggle: (value: string) => void;
  tone?: "acid" | "sky";
}) {
  const on =
    tone === "sky"
      ? "border-sky-500 bg-sky-500/15 text-sky-700"
      : "border-acid bg-acid/15 text-acid";
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(([value, label]) => {
        const active = selected.has(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => onToggle(value)}
            className={`rounded-sm border px-2 py-[3px] text-[0.7rem] transition-colors ${
              active ? on : "border-line text-muted hover:border-faint hover:text-ink"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function PriceFilters({
  teams,
  positions,
  managers,
  current,
}: {
  teams: [string, string][];
  positions: string[];
  /** Equipos de mi liga fantasy, para filtrar por dueño. */
  managers: { name: string; isMe: boolean }[];
  current: { q?: string; equipo?: string; pos?: string; manager?: string };
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [query, setQuery] = useState(current.q ?? "");

  const selectedTeams = useMemo(
    () => new Set((current.equipo ?? "").split(",").filter(Boolean)),
    [current.equipo],
  );
  const selectedPos = useMemo(
    () => new Set((current.pos ?? "").split(",").filter(Boolean)),
    [current.pos],
  );
  const selectedManagers = useMemo(
    () => new Set((current.manager ?? "").split(",").filter(Boolean)),
    [current.manager],
  );

  const push = (patch: { q?: string; equipo?: string; pos?: string; manager?: string }) => {
    const next = { ...current, ...patch };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
    start(() => router.replace(`/precios${params.size ? `?${params}` : ""}`, { scroll: false }));
  };

  // Buscar según se escribe, sin botón. El respiro evita una navegación por
  // cada tecla pulsada.
  useEffect(() => {
    if (query === (current.q ?? "")) return;
    const id = setTimeout(() => push({ q: query }), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const toggle = (set: Set<string>, value: string, key: "equipo" | "pos" | "manager") => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    push({ [key]: [...next].join(",") });
  };

  const anyFilter = query || selectedTeams.size || selectedPos.size || selectedManagers.size;

  return (
    <div className="border-line space-y-2.5 border-b px-5 py-3 lg:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar jugador…"
          className="border-line bg-panel text-ink focus:border-acid min-w-[180px] flex-1 border px-2.5 py-1.5 text-sm outline-none"
        />
        <Chips
          options={positions.map((p) => [p, p.slice(0, 4)])}
          selected={selectedPos}
          onToggle={(v) => toggle(selectedPos, v, "pos")}
        />
        {anyFilter ? (
          <button
            onClick={() => {
              setQuery("");
              start(() => router.replace("/precios", { scroll: false }));
            }}
            className="text-faint hover:text-down shrink-0 text-xs underline"
          >
            Limpiar
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="label shrink-0">Club</span>
        <Chips
          options={teams}
          selected={selectedTeams}
          onToggle={(v) => toggle(selectedTeams, v, "equipo")}
        />
      </div>

      {managers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="label shrink-0">Equipo de la liga</span>
          <Chips
            options={managers.map((m) => [m.name, m.isMe ? `${m.name} · tú` : m.name])}
            selected={selectedManagers}
            onToggle={(v) => toggle(selectedManagers, v, "manager")}
            tone="sky"
          />
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- lista */

/**
 * Suben y bajan como pestañas, no en dos columnas: puestas una al lado de la
 * otra se confunden y hay que leer el encabezado para saber cuál es cuál.
 */
export function PriceTabs({
  risers,
  fallers,
}: {
  risers: PriceEntry[];
  fallers: PriceEntry[];
}) {
  const [tab, setTab] = useState<"up" | "down">("up");
  const entries = tab === "up" ? risers : fallers;

  // La pestaña activa se rellena en vez de subrayarse: el subrayado era del
  // mismo verde/rojo que las barras de cada fila y se confundían.
  const tabClass = (mine: "up" | "down", active: string) =>
    `flex-1 px-4 py-3.5 text-center transition-colors ${
      tab === mine ? active : "bg-panel-2 text-faint hover:text-muted"
    }`;

  return (
    <>
      <div className="border-line flex gap-px border-b">
        <button
          onClick={() => setTab("up")}
          className={tabClass("up", "bg-up text-white")}
        >
          <span className="display text-lg">Suben</span>
          <span className="tnum ml-2 text-sm opacity-80">{num(risers.length)}</span>
        </button>
        <button
          onClick={() => setTab("down")}
          className={tabClass("down", "bg-down text-white")}
        >
          <span className="display text-lg">Bajan</span>
          <span className="tnum ml-2 text-sm opacity-80">{num(fallers.length)}</span>
        </button>
      </div>
      <PriceList entries={entries} direction={tab} />
    </>
  );
}

export function PriceList({
  entries,
  direction,
}: {
  entries: PriceEntry[];
  direction: "up" | "down";
}) {
  const tone = direction === "up" ? "text-up" : "text-down";
  const bar = direction === "up" ? "bg-up" : "bg-down";
  const top = Math.max(1, ...entries.map((e) => Math.abs(e.diff)));

  return (
    <section className="pt-5">
      {entries.length === 0 ? (
        <p className="text-faint px-5 py-10 text-center text-sm lg:px-6">
          Nadie {direction === "up" ? "sube" : "baja"} con estos filtros.
        </p>
      ) : (
        entries.slice(0, 120).map((entry, i) => (
          <PriceRow key={entry.name} entry={entry} tone={tone} bar={bar} top={top} delay={i * 14} />
        ))
      )}

      {entries.length > 120 && (
        <p className="text-faint px-5 py-4 text-center text-xs lg:px-6">
          Se muestran los 120 primeros de {num(entries.length)}. Afina con los filtros.
        </p>
      )}
    </section>
  );
}

function PriceRow({
  entry,
  tone,
  bar,
  top,
  delay,
}: {
  entry: PriceEntry;
  tone: string;
  bar: string;
  top: number;
  delay: number;
}) {
  const width = `${Math.max(4, (Math.abs(entry.diff) / top) * 100)}%`;
  const prob = entry.probability !== null ? oddsTone(entry.probability) : null;

  const body = (
    <>
      {/* Barra vertical con el color de la probabilidad de jugar */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[4px]"
        style={{ background: prob?.color ?? "transparent" }}
      />
      {/* Barra horizontal proporcional a la variación del día */}
      <span
        aria-hidden
        className={`absolute bottom-0 left-0 h-[2px] opacity-40 ${bar}`}
        style={{ width }}
      />

      <div className="border-line bg-panel-2 relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-lg border-2">
        {entry.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.image}
            alt=""
            className="h-full w-full object-cover object-top"
            loading="lazy"
          />
        ) : (
          <span className="display text-faint flex h-full w-full items-center justify-center text-[0.6rem]">
            {entry.displayName.slice(0, 2)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[1rem] leading-tight font-bold">
            {entry.displayName}
          </span>
          <AlertBadge alerts={entry.alerts} />
          {entry.probability !== null && (
            <span
              className="tnum shrink-0 rounded-sm px-1.5 py-[2px] text-[0.62rem] leading-none font-semibold"
              style={{
                background: oddsTone(entry.probability).color,
                color: oddsTone(entry.probability).ink,
              }}
            >
              {entry.probability}%
            </span>
          )}
          {entry.ownerName && (
            <span
              className={`shrink-0 rounded-sm border px-1.5 py-[2px] text-[0.68rem] leading-none font-semibold ${
                entry.ownerIsMe
                  ? "border-acid bg-acid/20 text-acid"
                  : "border-sky-400/50 bg-sky-400/15 text-sky-300"
              }`}
            >
              {entry.ownerIsMe ? "TUYO" : entry.ownerName}
            </span>
          )}
        </div>

        <div className="text-faint mt-1 flex flex-wrap items-center gap-x-2 text-[0.68rem]">
          <span className="text-muted inline-flex items-center gap-1.5 text-[0.75rem] font-medium">
            {entry.clubBadge && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={entry.clubBadge} alt="" width={16} height={16} className="object-contain" />
            )}
            {entry.club}
          </span>
          {entry.position && (
            <span className="border-line text-muted rounded-sm border px-1.5 py-[1px] text-[0.62rem]">
              {entry.position}
            </span>
          )}
          {entry.streak !== 0 && (
            <span className={tone}>
              · {Math.abs(entry.streak)} {Math.abs(entry.streak) === 1 ? "día" : "días"}{" "}
              {entry.streak > 0 ? "subiendo" : "bajando"}
            </span>
          )}
          {entry.buyoutClause ? (
            <>
              <span>· cláusula {money(entry.buyoutClause)}</span>
              {entry.buyoutUnlockAt ? (
                <Countdown until={entry.buyoutUnlockAt} />
              ) : (
                <span className="text-up font-semibold">· ABIERTA</span>
              )}
            </>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <PriceDelta diff={entry.diff} pct={entry.diffPct} size="md" />
        <div className="tnum text-ink mt-1 text-[0.75rem]">{money(entry.value)}</div>
        {entry.previousValue !== null && (
          <div className="tnum text-faint text-[0.65rem]">antes {money(entry.previousValue)}</div>
        )}
      </div>
    </>
  );

  return (
    <div
      className="border-line rise hover:bg-panel-2 relative mx-auto flex max-w-4xl items-center gap-3.5 border-b px-4 py-3 transition-colors"
      style={{ animationDelay: `${delay}ms` }}
    >
      {entry.playerId && (
        <Link
          href={`/jugador/${entry.playerId}`}
          className="absolute inset-0"
          aria-label={entry.displayName}
        />
      )}
      {body}
    </div>
  );
}
