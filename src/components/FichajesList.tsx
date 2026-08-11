"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { money, num, signed } from "@/lib/format";
import { PlayerPhoto } from "./PlayerPhoto";
import { PositionTag } from "./ui";
import type { Position } from "@/lib/normalize";

/**
 * Lista de operaciones, con sus pestañas y su ordenación **en el navegador**.
 *
 * Antes cada filtro era una vuelta al servidor: se recalculaba la liga entera,
 * se volvía a leer futbolfantasy y llegaban 300 KB de respuesta. En el móvil
 * eso son segundos de rueda girando. Los datos ya están aquí, así que ordenar
 * y filtrar es cosa de la propia página: instantáneo y sin una sola petición.
 */

/** Lo justo para pintar una fila; nada de objetos enteros del servidor. */
export type CandidateView = {
  id: string;
  name: string;
  position: Position;
  photo: string | null;
  ownerName: string;
  ownerTeamId: string;
  probability: number | null;
  value: number;
  clause: number;
  premium: number;
  premiumPct: number;
  ratio: number;
  dailyRise: number;
  adjustedRise: number;
  momentum: number;
  /** Dinero que queda al vender tras el blindaje. Es el número que manda. */
  profit: number;
  profitSafe: number;
  floorToday: number;
  roi: number;
  daysToBreakEven: number | null;
  opensInHours: number;
  opensAt: string | null;
  isOpen: boolean;
  opensSoon: boolean;
  affordable: boolean;
  score: number;
  reasons: string[];
  rival: { name: string; badge: string | null; atHome: boolean; bg: string; ink: string } | null;
};

type Tab = "clausulazos" | "negociar";
type Sort =
  | "recomendado"
  | "ganancia"
  | "roi"
  | "prima"
  | "valor"
  | "sube"
  | "recupera"
  | "abre";

const SORTS: { key: Sort; label: string; only?: Tab }[] = [
  { key: "recomendado", label: "Recomendado" },
  { key: "ganancia", label: "Lo que ganas", only: "clausulazos" },
  { key: "roi", label: "Rentabilidad", only: "clausulazos" },
  { key: "sube", label: "Lo que sube al día" },
  { key: "prima", label: "Prima más baja" },
  { key: "valor", label: "Valor" },
  { key: "recupera", label: "Se recupera antes", only: "clausulazos" },
  { key: "abre", label: "Se libera antes", only: "negociar" },
];

export function FichajesList({
  clausulazos,
  negociar,
  protectionDays,
  tooExpensive,
}: {
  clausulazos: CandidateView[];
  negociar: CandidateView[];
  protectionDays: number;
  tooExpensive: number;
}) {
  const [tab, setTab] = useState<Tab>("clausulazos");
  const [sort, setSort] = useState<Sort>("recomendado");
  const [onlyAffordable, setOnlyAffordable] = useState(false);
  const [onlyProfitable, setOnlyProfitable] = useState(false);
  const [info, setInfo] = useState(false);

  const rows = useMemo(() => {
    const list = tab === "clausulazos" ? clausulazos : negociar;
    const visible = list.filter(
      (c) => (!onlyAffordable || c.affordable) && (!onlyProfitable || c.profit > 0),
    );

    const compare = (a: CandidateView, b: CandidateView) => {
      switch (sort) {
        case "ganancia":
          return b.profit - a.profit;
        case "roi":
          return b.roi - a.roi;
        case "prima":
          return a.premiumPct - b.premiumPct;
        case "valor":
          return b.value - a.value;
        case "sube":
          return b.dailyRise - a.dailyRise;
        case "recupera":
          return (a.daysToBreakEven ?? Infinity) - (b.daysToBreakEven ?? Infinity);
        case "abre":
          return a.opensInHours - b.opensInHours;
        default:
          return b.score - a.score;
      }
    };

    return [...visible].sort(compare);
  }, [tab, sort, onlyAffordable, onlyProfitable, clausulazos, negociar]);

  const chip = (active: boolean) =>
    `cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors ${
      active
        ? "border-acid/60 bg-acid/15 text-acid"
        : "border-line text-muted hover:border-faint hover:text-ink"
    }`;

  return (
    <>
      <div className="border-line flex border-b">
        {(
          [
            ["clausulazos", "Clausulazos", clausulazos.length],
            ["negociar", "A negociar", negociar.length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 cursor-pointer border-b-2 px-4 py-3 text-center transition-colors ${
              tab === key ? "border-acid text-acid" : "border-transparent text-faint hover:text-muted"
            }`}
          >
            <span className="display text-base">{label}</span>
            <span className="tnum ml-2 text-sm">{num(count)}</span>
          </button>
        ))}
      </div>

      <div className="text-muted border-line bg-panel-2/40 flex items-start gap-3 border-b px-4 py-3 text-[0.8rem] sm:px-6 lg:px-10">
        <p className="flex-1">
          {tab === "clausulazos" ? (
            <>
              Un clausulazo es una <strong>inversión</strong>: pagas la cláusula, el jugador sigue
              subiendo mientras está blindado {protectionDays} días y lo vendes antes de que nadie
              pueda quitártelo. Se ordena por el dinero que queda al final. Entran también los que
              se liberan en las próximas 48 horas.
            </>
          ) : (
            <>
              Aquí hay que hablar con el dueño: o están <strong>blindados</strong>, o su cláusula
              pasa de ×{tooExpensive.toFixed(1)} su valor y pagarla es tirar el dinero.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setInfo((v) => !v)}
          aria-label="Cómo se calcula la puntuación"
          className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border text-[0.75rem] font-bold transition-colors ${
            info ? "border-acid bg-acid text-white" : "border-line text-muted hover:text-ink"
          }`}
        >
          i
        </button>
      </div>

      {info && <ScoreHelp tab={tab} protectionDays={protectionDays} />}

      <div className="border-line flex flex-wrap items-center gap-1.5 border-b px-3.5 py-3 sm:px-5 lg:px-6">
        <span className="label mr-1">Ordenar por</span>
        {SORTS.filter((s) => !s.only || s.only === tab).map((s) => (
          <button key={s.key} type="button" onClick={() => setSort(s.key)} className={chip(sort === s.key)}>
            {s.label}
          </button>
        ))}
        {tab === "clausulazos" && (
          <>
            <button
              type="button"
              onClick={() => setOnlyProfitable((v) => !v)}
              className={chip(onlyProfitable)}
            >
              Sólo los que dan dinero
            </button>
            <button
              type="button"
              onClick={() => setOnlyAffordable((v) => !v)}
              className={chip(onlyAffordable)}
            >
              Sólo lo que puedo pagar
            </button>
          </>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-faint px-5 py-12 text-center text-sm">
          {tab === "clausulazos"
            ? "Ninguna cláusula abierta con estos filtros."
            : "Nadie a quien negociar ahora mismo."}
        </p>
      ) : (
        <div className="space-y-2 p-2.5 sm:p-3 lg:p-4">
          {rows.map((c, i) => (
            <Card key={c.id} c={c} rank={i + 1} tab={tab} protectionDays={protectionDays} />
          ))}
        </div>
      )}
    </>
  );
}

/** "mañana a las 16:54", "el jueves a las 09:00"… */
function opensLabel(iso: string): string {
  const at = new Date(iso);
  const hoy = new Date();
  const dias = Math.round(
    (new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime() -
      new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()) /
      86_400_000,
  );
  const hora = at.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  if (dias <= 0) return `hoy a las ${hora}`;
  if (dias === 1) return `mañana a las ${hora}`;
  const dia = at.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" });
  return `el ${dia} a las ${hora}`;
}

/* ------------------------------------------------------------- tarjeta */

/**
 * Todas las tarjetas tienen la misma rejilla, con las mismas columnas en el
 * mismo sitio aunque a un jugador le falte algún dato. Antes se montaban con
 * cajas flexibles y bastaba que uno no tuviera próximo rival o motivos para
 * que se le descolocara todo.
 */
const GRID =
  "grid grid-cols-[28px_44px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-2 " +
  "sm:grid-cols-[32px_52px_minmax(0,1fr)_52px_112px_124px_118px_52px] sm:gap-x-3";

function Card({
  c,
  rank,
  tab,
  protectionDays,
}: {
  c: CandidateView;
  rank: number;
  tab: Tab;
  protectionDays: number;
}) {
  const top = rank <= 3;
  const rises = c.dailyRise > 0;
  // Sólo se habla de recuperar cuando de verdad se recupera.
  const recovers =
    tab === "clausulazos" &&
    c.premium > 0 &&
    c.daysToBreakEven !== null &&
    c.daysToBreakEven <= protectionDays;

  return (
    <div
      className={`border-line hover:border-acid/40 relative rounded-2xl border bg-panel px-3 py-3 shadow-sm transition-all hover:shadow-md sm:px-4 ${GRID}`}
    >
      <Link href={`/jugador/${c.id}`} className="absolute inset-0" aria-label={c.name} />

      <span
        className={`tnum flex h-7 w-7 items-center justify-center rounded-lg text-[0.8rem] font-bold ${
          top ? "bg-acid text-white" : "bg-panel-2 text-faint"
        }`}
      >
        {rank}
      </span>

      <div className="border-line bg-panel-2 h-11 w-11 overflow-hidden rounded-xl border sm:h-[52px] sm:w-[52px]">
        <PlayerPhoto src={c.photo} name={c.name} size={52} className="h-full w-full" />
      </div>

      {/* Identidad */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <PositionTag position={c.position} />
          <span className="truncate text-[0.92rem] leading-tight font-bold sm:text-[1rem]">
            {c.name}
          </span>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          <Link
            href={`/equipo/${c.ownerTeamId}`}
            className="relative z-10 shrink-0 rounded-md border border-info/50 bg-info-soft px-1.5 py-[1px] text-[0.64rem] font-semibold text-info"
          >
            {c.ownerName}
          </Link>
          {c.rival && (
            <span
              className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-[1px]"
              style={{ background: c.rival.bg, color: c.rival.ink }}
            >
              {c.rival.badge && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.rival.badge} alt="" width={12} height={12} className="shrink-0" />
              )}
              <span className="truncate text-[0.6rem] font-bold">{c.rival.name}</span>
              <span className="text-[0.55rem]">{c.rival.atHome ? "🏠" : "✈️"}</span>
            </span>
          )}
        </div>
      </div>

      {/* Los tres bloques de datos: siempre presentes y siempre en su sitio */}
      <div className="col-span-3 grid grid-cols-[46px_1fr_1fr_1fr_46px] items-center gap-1.5 sm:contents">
        <Cell label="Juega" className="text-center sm:text-center">
          {c.probability !== null ? (
            <span className="tnum text-[0.95rem] font-bold">{c.probability}%</span>
          ) : (
            <span className="text-faint text-[0.8rem]">—</span>
          )}
        </Cell>

        <Cell label="Valor" className="text-right">
          <span className="tnum text-ink text-[1rem] leading-none font-bold sm:text-[1.1rem]">
            {money(c.value)}
          </span>
          <span
            className={`tnum mt-1 block text-[0.68rem] font-semibold ${
              rises ? "text-up" : c.dailyRise < 0 ? "text-down" : "text-faint"
            }`}
            title={
              rises
                ? `Sube ${signed(Math.round(c.dailyRise))} al día. Para la previsión se cuenta ${signed(
                    Math.round(c.adjustedRise),
                  )}, descontando el riesgo de que el ritmo no siga.`
                : undefined
            }
          >
            {c.dailyRise === 0 ? "estable" : `${signed(Math.round(c.dailyRise))}/día`}
          </span>
        </Cell>

        <Cell label="Cláusula" className="text-right">
          <span
            className={`tnum text-[1rem] leading-none font-bold sm:text-[1.1rem] ${
              c.affordable ? "text-ink" : "text-faint"
            }`}
          >
            {money(c.clause)}
          </span>
          <span className="tnum text-warn mt-1 block text-[0.68rem] font-semibold whitespace-nowrap">
            +{money(c.premium)}{" "}
            <span className="text-faint">({Math.round(c.premiumPct * 100)}%)</span>
          </span>
        </Cell>

        <Cell label={tab === "clausulazos" ? "Ganas" : "Nota"} className="text-right sm:text-right">
          {tab === "clausulazos" ? (
            <>
              <span
                className={`tnum text-[1rem] leading-none font-bold sm:text-[1.1rem] ${
                  c.profit > 0 ? "text-up" : "text-down"
                }`}
              >
                {c.profit > 0 ? "+" : "−"}
                {money(Math.abs(c.profit))}
              </span>
              <span className="tnum text-faint mt-1 block text-[0.68rem] font-semibold">
                {Math.round(c.roi * 100)}% en {protectionDays}d
              </span>
            </>
          ) : (
            <span className="tnum text-ink text-[1rem] font-bold">
              {c.opensInHours > 0
                ? c.opensInHours < 24
                  ? `${Math.ceil(c.opensInHours)} h`
                  : `${Math.ceil(c.opensInHours / 24)} d`
                : "abierta"}
            </span>
          )}
        </Cell>

        <Cell label="Nota" className="text-center">
          <span
            className={`tnum inline-block w-full rounded-lg py-1.5 text-[0.95rem] font-bold ${
              c.score >= 55 ? "bg-acid text-white" : "bg-panel-2 text-muted"
            }`}
          >
            {Math.round(c.score)}
          </span>
        </Cell>
      </div>

      {/* Pie: sólo lo que aporta algo. Si no sube, no se habla de recuperar. */}
      <div className="text-muted col-span-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 sm:col-span-8 sm:pl-[88px]">
        {c.opensSoon && c.opensAt && (
          <span className="bg-warn-soft text-warn rounded-full px-2 py-[2px] text-[0.66rem] font-bold">
            🔒 Se libera {opensLabel(c.opensAt)}
          </span>
        )}
        {recovers && (
          <span className="text-up text-[0.7rem] font-semibold">
            Recupera la prima en {Math.max(1, Math.ceil(c.daysToBreakEven!))} días
          </span>
        )}
        {tab === "clausulazos" && rises && (
          <span className="text-faint text-[0.66rem]">
            Valor previsto a {protectionDays} días: {money(Math.round(c.value + c.adjustedRise * protectionDays))}
          </span>
        )}
        {c.reasons.map((r) => (
          <span key={r} className="bg-panel-2 rounded-full px-2 py-[2px] text-[0.64rem]">
            {r}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Celda con su rótulo encima, para que todas midan y caigan igual. */
function Cell({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="label text-[0.5rem] leading-none">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- ayuda */

function ScoreHelp({ tab, protectionDays }: { tab: Tab; protectionDays: number }) {
  const rows =
    tab === "clausulazos"
      ? [
          ["38%", "Rentabilidad", "Beneficio ÷ lo invertido. Es lo que permite comparar a uno de 2 M€ con otro de 60 M€ sin que gane siempre el caro."],
          ["22%", "Dinero", "El beneficio en euros, porque ganar 6 M€ mueve más que ganar 300 k€."],
          ["18%", "Ritmo", "Lo que sube al día. 500 k€ ya es bueno; 1 M€ es mucho."],
          ["14%", "Continuidad", "Si va a jugar, si puntúa, si lleva días subiendo y si el calendario acompaña. Es lo que dice si la subida va a seguir."],
          ["8%", "Suelo", "Que siga saliendo a cuenta aunque la liga te pague su oferta mala (−10%)."],
        ]
      : [
          ["26%", "Urgencia", "Lo poco que le queda para liberarse: su dueño decide o lo pierde."],
          ["24%", "Ritmo", "Lo que sube al día."],
          ["22%", "Cláusula baja", "Cuanto más cerca del valor, más le renta venderlo a su dueño."],
          ["16%", "Continuidad", "Probabilidad de jugar, puntos, racha y calendario."],
          ["12%", "Ganga", "Puntos por millón de valor."],
        ];

  return (
    <div className="border-line bg-panel-2/60 border-b px-4 py-4 sm:px-6 lg:px-10">
      <h3 className="display text-base">Cómo se calcula la nota</h3>
      {tab === "clausulazos" && (
        <p className="text-muted mt-1 text-[0.78rem]">
          Todo se mide contra <strong>vender al acabar el blindaje</strong>: pagas la cláusula, el
          jugador sube {protectionDays} días sin que nadie pueda tocarlo, y lo colocas. La subida
          diaria se descuenta según la confianza en que continúe, para que un pico de un día no
          parezca una mina.
        </p>
      )}
      <p className="text-muted mt-2 text-[0.78rem]">
        Cada factor se normaliza entre 0 y 1 y se suma con este peso. El resultado va de 0 a 100.
      </p>
      <dl className="mt-3 space-y-2">
        {rows.map(([weight, name, what]) => (
          <div key={name} className="flex gap-3">
            <dt className="tnum text-acid w-10 shrink-0 text-[0.8rem] font-bold">{weight}</dt>
            <dd className="text-[0.78rem]">
              <span className="font-semibold">{name}.</span>{" "}
              <span className="text-muted">{what}</span>
            </dd>
          </div>
        ))}
      </dl>
      {tab === "clausulazos" && (
        <p className="text-faint mt-3 text-[0.74rem]">
          La nota se recorta al 30% si la operación pierde dinero, al 60% si no te llega el saldo y
          al 85% si la cláusula todavía no está abierta. Ninguno desaparece: puedes vender antes o
          esperar a mañana.
        </p>
      )}
    </div>
  );
}
