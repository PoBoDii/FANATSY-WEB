"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { money, num } from "@/lib/format";
import { oddsTone, type PlayerAlert } from "@/lib/odds";
import { Countdown } from "./Countdown";
import { AlertBadge, PositionTag, PriceDelta } from "./ui";
import type { Position } from "@/lib/normalize";

/** Nombre largo de futbolfantasy → etiqueta de puesto del resto de la web. */
const POS_TAG: Record<string, Position> = {
  Portero: "PT",
  Defensa: "DF",
  Mediocampista: "MC",
  Delantero: "DL",
  Entrenador: "EN",
};

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
      ? "border-info/50 bg-sky-500/15 text-info"
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
            className={`rounded-full border px-2.5 py-[3px] text-[0.7rem] transition-colors ${
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
    <div className="border-line space-y-2.5 border-b px-3.5 py-3 sm:px-5 sm:py-3.5 lg:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar jugador…"
          className="border-line bg-panel text-ink focus:border-acid min-w-[180px] flex-1 rounded-xl border px-3.5 py-2 text-sm outline-none transition-colors"
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
    `flex-1 rounded-xl px-4 py-3 text-center transition-all ${
      tab === mine ? `${active} shadow-md` : "text-faint hover:text-ink hover:bg-white/70"
    }`;

  return (
    <>
      <div className="border-line bg-panel-2/60 mx-2.5 mt-3 flex gap-1.5 rounded-2xl border p-1.5 sm:mx-4 sm:mt-4 sm:gap-2 lg:mx-6">
        <button
          onClick={() => setTab("up")}
          className={tabClass("up", "bg-gradient-to-br from-emerald-500 to-emerald-700 text-white")}
        >
          <span className="display text-lg">Suben</span>
          <span className="tnum ml-2 text-sm opacity-80">{num(risers.length)}</span>
        </button>
        <button
          onClick={() => setTab("down")}
          className={tabClass("down", "bg-gradient-to-br from-rose-500 to-rose-700 text-white")}
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
    <section className="space-y-2 p-2.5 sm:p-4 lg:p-6">
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

  /**
   * Misma anatomía que la tarjeta de plantilla: foto a sangre, nombre y puesto
   * arriba, y el dato que manda —aquí la variación del día— en grande a la
   * derecha. Las tres listas de la web se leen igual.
   */
  return (
    <article
      className="rise bg-panel border-line hover:border-faint/60 relative mx-auto flex min-h-[104px] w-full max-w-4xl overflow-hidden rounded-2xl border transition-colors"
      style={{ animationDelay: `${delay}ms` }}
    >
      {entry.playerId && (
        <Link
          href={`/jugador/${entry.playerId}`}
          className="absolute inset-0"
          aria-label={entry.displayName}
        />
      )}

      <div className="bg-panel-2 relative w-[72px] shrink-0 overflow-hidden sm:w-[84px]">
        {entry.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.image}
            alt=""
            className="h-full w-full object-cover object-top"
            loading="lazy"
          />
        ) : (
          <span className="display text-faint flex h-full w-full items-center justify-center text-[0.7rem]">
            {entry.displayName.slice(0, 2)}
          </span>
        )}
        {entry.clubBadge && (
          <span className="absolute bottom-1 left-1 rounded-md bg-black/55 p-[3px] backdrop-blur-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={entry.clubBadge} alt="" width={16} height={16} className="block object-contain" />
          </span>
        )}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ background: prob?.color ?? "transparent" }}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5 px-2.5 py-2.5 sm:px-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {entry.position && <PositionTag position={POS_TAG[entry.position] ?? "?"} size="sm" />}
            <h3 className="truncate text-[1rem] leading-tight font-semibold sm:text-[1.1rem]">
              {entry.displayName}
            </h3>
            <AlertBadge alerts={entry.alerts} />
          </div>

          <div className="shrink-0 text-right">
            <PriceDelta diff={entry.diff} pct={entry.diffPct} size="md" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {prob && (
            <span
              className="tnum rounded-md px-1.5 py-[3px] text-[0.72rem] leading-none font-semibold"
              style={{ background: prob.color, color: prob.ink }}
            >
              {entry.probability}%
            </span>
          )}
          <span className="tnum text-[0.95rem] leading-none font-semibold">
            {money(entry.value)}
          </span>
          {entry.previousValue !== null && (
            <span className="tnum text-faint text-[0.68rem]">
              antes {money(entry.previousValue)}
            </span>
          )}
          {entry.streak !== 0 && (
            <span className={`text-[0.68rem] font-medium ${tone}`}>
              {Math.abs(entry.streak)} {Math.abs(entry.streak) === 1 ? "día" : "días"}{" "}
              {entry.streak > 0 ? "subiendo" : "bajando"}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {entry.ownerName ? (
            <span
              className={`text-[0.7rem] font-semibold ${entry.ownerIsMe ? "text-acid" : "text-info"}`}
            >
              {entry.ownerIsMe ? "tuyo" : entry.ownerName}
            </span>
          ) : (
            <span className="text-faint text-[0.7rem]">libre</span>
          )}

          {entry.buyoutClause ? (
            <>
              <span
                className={`tnum text-[0.8rem] leading-none font-semibold ${
                  entry.buyoutUnlockAt ? "text-down" : "text-up"
                }`}
              >
                🔒 {money(entry.buyoutClause)}
              </span>
              {entry.buyoutUnlockAt && <Countdown until={entry.buyoutUnlockAt} />}
            </>
          ) : null}
        </div>
      </div>

      {/* Barra proporcional a lo que se ha movido hoy, al pie de la tarjeta. */}
      <span
        aria-hidden
        className={`absolute bottom-0 left-0 h-[2px] opacity-50 ${bar}`}
        style={{ width }}
      />
    </article>
  );
}
