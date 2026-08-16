"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { money, num, signed } from "@/lib/format";
import { PlayerPhoto } from "./PlayerPhoto";
import { PositionTag, StatusIcon } from "./ui";
import type { Position, PlayerStatus } from "@/lib/normalize";

/**
 * Lista de operaciones, con sus pestañas y su ordenación **en el navegador**.
 *
 * Antes cada filtro era una vuelta al servidor: se recalculaba la liga entera,
 * se volvía a leer futbolfantasy y llegaban 300 KB de respuesta. En el móvil
 * eso son segundos de rueda girando. Los datos ya están aquí, así que ordenar
 * y filtrar es cosa de la propia página: instantáneo y sin una sola petición.
 */

/** Lo justo para pintar una tarjeta; nada de objetos enteros del servidor. */
export type CandidateView = {
  id: string;
  name: string;
  position: Position;
  photo: string | null;
  badge: string | null;
  status: PlayerStatus;
  points: number;
  average: number;
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
  /** Los tres próximos partidos de liga, con el color de su dificultad. */
  next3: { name: string; badge: string | null; atHome: boolean; bg: string; label: string }[];
};

type Tab = "negocio" | "plantilla" | "negociar";

const TABS: { key: Tab; label: string }[] = [
  { key: "negocio", label: "Para ganar dinero" },
  { key: "plantilla", label: "Para el once" },
  { key: "negociar", label: "A negociar" },
];

type Sort =
  | "recomendado"
  | "ganancia"
  | "roi"
  | "prima"
  | "valor"
  | "sube"
  | "juega"
  | "recupera"
  | "abre";

const SORTS: { key: Sort; label: string; only?: Tab }[] = [
  { key: "recomendado", label: "Recomendado" },
  { key: "ganancia", label: "Lo que ganas", only: "negocio" },
  { key: "roi", label: "Rentabilidad", only: "negocio" },
  { key: "juega", label: "Probabilidad", only: "plantilla" },
  { key: "sube", label: "Lo que sube al día" },
  { key: "prima", label: "Prima más baja" },
  { key: "valor", label: "Valor" },
  { key: "recupera", label: "Se recupera antes", only: "negocio" },
  { key: "abre", label: "Se libera antes", only: "negociar" },
];

export function FichajesList({
  negocio,
  plantilla,
  negociar,
  protectionDays,
  tooExpensive,
}: {
  negocio: CandidateView[];
  plantilla: CandidateView[];
  negociar: CandidateView[];
  protectionDays: number;
  tooExpensive: number;
}) {
  const [tab, setTab] = useState<Tab>("negocio");
  const [sort, setSort] = useState<Sort>("recomendado");
  const [onlyAffordable, setOnlyAffordable] = useState(false);
  const [onlyPlaying, setOnlyPlaying] = useState(false);
  const [info, setInfo] = useState(false);

  const rows = useMemo(() => {
    const list = tab === "negocio" ? negocio : tab === "plantilla" ? plantilla : negociar;
    const visible = list.filter(
      (c) =>
        (!onlyAffordable || c.affordable) &&
        (!onlyPlaying || ((c.probability ?? 0) >= 70 && c.status === "ok")),
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
        case "juega":
          return (b.probability ?? -1) - (a.probability ?? -1);
        case "recupera":
          return (a.daysToBreakEven ?? Infinity) - (b.daysToBreakEven ?? Infinity);
        case "abre":
          return a.opensInHours - b.opensInHours;
        default:
          return b.score - a.score;
      }
    };

    return [...visible].sort(compare);
  }, [tab, sort, onlyAffordable, onlyPlaying, negocio, plantilla, negociar]);

  const chip = (active: boolean) =>
    `cursor-pointer shrink-0 rounded-full px-3 py-1.5 text-[0.78rem] transition-colors ${
      active ? "bg-ink text-void font-semibold" : "bg-panel-2 text-muted hover:text-ink"
    }`;

  const counts: Record<Tab, number> = {
    negocio: negocio.length,
    plantilla: plantilla.length,
    negociar: negociar.length,
  };

  return (
    <>
      <div className="border-line flex border-b">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 cursor-pointer border-b-2 px-1.5 py-3 text-center transition-colors sm:px-4 ${
              tab === key ? "border-acid text-acid" : "border-transparent text-faint hover:text-muted"
            }`}
          >
            <span className="display text-[0.88rem] sm:text-base">{label}</span>
            <span className="tnum ml-1.5 text-[0.78rem]">{num(counts[key])}</span>
          </button>
        ))}
      </div>

      <div className="text-muted border-line flex items-start gap-3 border-b px-3.5 py-3 text-[0.8rem] sm:px-6 lg:px-10">
        <p className="flex-1">
          {tab === "negocio" ? (
            <>
              Comprar para <strong>revender</strong>: pagas la cláusula, el jugador sigue subiendo
              los {protectionDays} días que está blindado y lo vendes antes de que nadie pueda
              quitártelo. Manda que la cláusula esté cerca de su valor y que suba cada día.
            </>
          ) : tab === "plantilla" ? (
            <>
              Comprar para <strong>quedárselo</strong>: aquí no importa lo que suba, importa que
              juegue. Manda la probabilidad de ser titular, lo que puntúa por millón y el
              calendario de las próximas tres jornadas.
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

      <div className="border-line flex items-center gap-1.5 overflow-x-auto border-b px-3.5 py-2.5 sm:px-5 lg:px-6">
        <span className="label shrink-0 pr-1">Ordenar</span>
        {SORTS.filter((s) => !s.only || s.only === tab).map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSort(s.key)}
            className={chip(sort === s.key)}
          >
            {s.label}
          </button>
        ))}
        <span className="bg-line mx-1 w-px shrink-0 self-stretch" />
        <button
          type="button"
          onClick={() => setOnlyAffordable((v) => !v)}
          className={chip(onlyAffordable)}
        >
          Puedo pagarla
        </button>
        <button type="button" onClick={() => setOnlyPlaying((v) => !v)} className={chip(onlyPlaying)}>
          Titulares
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-faint px-5 py-12 text-center text-sm">
          Nadie encaja con estos filtros.
        </p>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 p-2.5 sm:p-3 lg:grid-cols-2 lg:p-4 2xl:grid-cols-3">
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
 * Misma anatomía que la tarjeta de plantilla —foto a sangre, nombre grande, el
 * dato que manda arriba a la derecha— para que las dos listas se lean igual.
 * Lo único que cambia es qué se pone en grande: el dinero que deja la operación
 * o la probabilidad de que juegue.
 */
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
  const rises = c.dailyRise > 0;
  const recovers =
    tab === "negocio" &&
    c.premium > 0 &&
    c.daysToBreakEven !== null &&
    c.daysToBreakEven <= protectionDays;

  return (
    <article className="bg-panel border-line hover:border-faint/60 relative flex min-h-[124px] overflow-hidden rounded-2xl border transition-colors">
      <Link href={`/jugador/${c.id}`} className="absolute inset-0" aria-label={c.name} />

      <div className="bg-panel-2 relative w-[76px] shrink-0 overflow-hidden sm:w-[88px]">
        <PlayerPhoto src={c.photo} name={c.name} size={96} className="h-full w-full" />
        {c.badge && (
          <span className="absolute bottom-1 left-1 rounded-md bg-black/55 p-[3px] backdrop-blur-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.badge} alt="" width={16} height={16} className="block object-contain" />
          </span>
        )}
        <span
          className={`tnum absolute top-1 left-1 rounded-md px-1.5 py-[1px] text-[0.62rem] font-bold ${
            rank <= 3 ? "bg-acid text-white" : "bg-black/55 text-white/80"
          }`}
        >
          {rank}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <PositionTag position={c.position} />
              <h3 className="truncate text-[1rem] leading-tight font-semibold">{c.name}</h3>
              <StatusIcon status={c.status} size={14} />
            </div>
            <Link
              href={`/equipo/${c.ownerTeamId}`}
              className="text-faint hover:text-ink relative z-10 mt-1 inline-block truncate text-[0.7rem]"
            >
              lo tiene {c.ownerName}
            </Link>
          </div>

          {/* El dato que decide, en grande: dinero o titularidad */}
          <div className="shrink-0 text-right leading-none">
            {tab === "plantilla" ? (
              <>
                <span
                  className={`tnum text-[1.35rem] font-semibold ${
                    (c.probability ?? 0) >= 70 ? "text-up" : "text-ink"
                  }`}
                >
                  {c.probability === null ? "s/d" : `${c.probability}%`}
                </span>
                <span className="text-faint mt-[3px] block text-[0.6rem]">
                  {num(c.average, 1)} media
                </span>
              </>
            ) : tab === "negocio" ? (
              <>
                <span
                  className={`tnum text-[1.35rem] font-semibold ${
                    c.profit > 0 ? "text-up" : "text-down"
                  }`}
                >
                  {c.profit > 0 ? "+" : "−"}
                  {money(Math.abs(c.profit))}
                </span>
                <span className="text-faint mt-[3px] block text-[0.6rem]">
                  {Math.round(c.roi * 100)}% en {protectionDays}d
                </span>
              </>
            ) : (
              <>
                <span className="tnum text-[1.35rem] font-semibold">
                  {c.opensInHours > 0
                    ? c.opensInHours < 24
                      ? `${Math.ceil(c.opensInHours)}h`
                      : `${Math.ceil(c.opensInHours / 24)}d`
                    : "libre"}
                </span>
                <span className="text-faint mt-[3px] block text-[0.6rem]">para liberarse</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {tab !== "plantilla" && c.probability !== null && (
            <span className="tnum text-muted text-[0.72rem] font-semibold">{c.probability}%</span>
          )}
          <span className="tnum text-[0.92rem] leading-none font-semibold">{money(c.value)}</span>
          <span
            className={`tnum text-[0.72rem] leading-none font-semibold ${
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
          <span
            className={`tnum text-[0.8rem] leading-none font-semibold ${
              c.affordable ? "text-ink" : "text-faint"
            }`}
            title={c.affordable ? "Cláusula" : "No te llega el saldo"}
          >
            🔒 {money(c.clause)}
          </span>
          <span className="tnum text-faint text-[0.7rem] leading-none">
            +{Math.round(c.premiumPct * 100)}%
          </span>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="text-faint min-w-0 truncate text-[0.68rem]">
            {c.opensSoon && c.opensAt
              ? `Se libera ${opensLabel(c.opensAt)}`
              : recovers
                ? `Recupera la prima en ${Math.max(1, Math.ceil(c.daysToBreakEven!))} días`
                : (c.reasons[0] ?? "")}
          </div>

          {c.next3.length > 0 && (
            <div className="flex shrink-0 gap-1">
              {c.next3.map((f, i) => (
                <span
                  key={`${f.name}-${i}`}
                  className="bg-panel-2 flex w-[32px] flex-col items-center gap-1 rounded-lg px-1 pt-1 pb-[3px]"
                  title={`${f.atHome ? "En casa contra" : "Fuera contra"} ${f.name} · ${f.label}`}
                >
                  <span className="flex items-center gap-[2px]">
                    {f.badge && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.badge} alt="" width={15} height={15} className="object-contain" />
                    )}
                    {!f.atHome && (
                      <span className="text-faint text-[0.5rem] leading-none" aria-hidden>
                        ✈
                      </span>
                    )}
                  </span>
                  <span
                    className="h-[3px] w-full rounded-full"
                    style={{ background: f.bg }}
                    aria-hidden
                  />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------- ayuda */

/** Los pesos exactos con los que se calcula cada nota, tal cual los usa el código. */
const WEIGHTS: Record<Tab, [string, string, string][]> = {
  negocio: [
    ["30%", "Rentabilidad", "Beneficio ÷ lo invertido a los 14 días. Permite comparar a uno de 2 M€ con otro de 60 M€ sin que gane siempre el caro."],
    ["22%", "Cláusula barata", "Cuánto pagas por encima de su valor. Puntúa el máximo si la cláusula está en su valor y se agota a partir del +40%."],
    ["20%", "Ritmo", "Lo que sube al día. 500 k€ ya es bueno; 1 M€ es el tope de la escala."],
    ["14%", "Dinero", "El beneficio en euros, porque ganar 6 M€ mueve más que ganar 300 k€."],
    ["8%", "Continuidad", "Si va a jugar, si puntúa, si lleva días subiendo y si el calendario acompaña: dice si la subida va a seguir."],
    ["6%", "Suelo", "Que siga saliendo a cuenta aunque la liga te pague su oferta mala (−10%)."],
  ],
  plantilla: [
    ["42%", "Que juegue", "Probabilidad de ser titular, elevada al cuadrado: entre un 90% y un 60% hay mucha más distancia de la que parece, porque el fijo acumula y el otro depende de que le toque."],
    ["18%", "Lo que puntúa", "Su media esta temporada; si aún no hay, lo del año pasado repartido entre 38 jornadas."],
    ["16%", "Puntos por millón", "Lo que rinde por lo que cuesta. Un titular de 5 M€ vale más que uno de 40 M€ que puntúa igual: deja saldo para dos fichajes más."],
    ["14%", "Calendario", "Dificultad media de sus tres próximos partidos de liga."],
    ["10%", "Precio de la cláusula", "Cuenta, pero poco: si es un fijo que puntúa, pagar el doble de su valor sigue siendo buen negocio deportivo."],
  ],
  negociar: [
    ["26%", "Urgencia", "Lo poco que le queda para liberarse: su dueño decide o lo pierde."],
    ["24%", "Ritmo", "Lo que sube al día."],
    ["22%", "Cláusula baja", "Cuanto más cerca del valor, más le renta venderlo a su dueño."],
    ["16%", "Continuidad", "Probabilidad de jugar, puntos, racha y calendario."],
    ["12%", "Ganga", "Puntos por millón de valor."],
  ],
};

function ScoreHelp({ tab, protectionDays }: { tab: Tab; protectionDays: number }) {
  return (
    <div className="border-line bg-panel-2/40 border-b px-4 py-4 sm:px-6 lg:px-10">
      <h3 className="display text-base">Cómo se calcula la nota</h3>

      {tab === "negocio" && (
        <p className="text-muted mt-1 text-[0.78rem]">
          Todo se mide contra <strong>vender al acabar el blindaje</strong>: pagas la cláusula, el
          jugador sube {protectionDays} días sin que nadie pueda tocarlo, y lo colocas. La subida
          diaria se descuenta según la confianza en que continúe, para que un pico de un día no
          parezca una mina.
        </p>
      )}
      {tab === "plantilla" && (
        <p className="text-muted mt-1 text-[0.78rem]">
          Aquí no se mide dinero: se mide <strong>lo que va a puntuar</strong>. Un jugador que no
          sale vale cero por barato que esté, así que la titularidad pesa más que todo lo demás
          junto.
        </p>
      )}

      <p className="text-muted mt-2 text-[0.78rem]">
        Cada factor se normaliza entre 0 y 1 y se suma con este peso. El resultado va de 0 a 100.
      </p>

      <dl className="mt-3 space-y-2">
        {WEIGHTS[tab].map(([weight, name, what]) => (
          <div key={name} className="flex gap-3">
            <dt className="tnum text-acid w-10 shrink-0 text-[0.8rem] font-bold">{weight}</dt>
            <dd className="text-[0.78rem]">
              <span className="font-semibold">{name}.</span>{" "}
              <span className="text-muted">{what}</span>
            </dd>
          </div>
        ))}
      </dl>

      {tab === "negocio" && (
        <p className="text-faint mt-3 text-[0.74rem]">
          La nota se recorta al 30% si la operación pierde dinero, al 60% si no te llega el saldo y
          al 85% si la cláusula todavía no está abierta. Ninguno desaparece: puedes vender antes o
          esperar a mañana.
        </p>
      )}
      {tab === "plantilla" && (
        <p className="text-faint mt-3 text-[0.74rem]">
          La nota se recorta a la cuarta parte si está lesionado o sancionado, a tres cuartos si es
          duda, a la mitad si no te llega el saldo y al 90% si la cláusula todavía no está abierta.
        </p>
      )}
    </div>
  );
}
