"use client";

import { useMemo, useState } from "react";
import { num } from "@/lib/format";
import { PlayerCard, type CardData } from "./PlayerCard";

/**
 * Las tres listas de operaciones, con sus filtros y su orden **en el navegador**.
 *
 * Antes cada filtro era una vuelta al servidor: se recalculaba la liga entera,
 * se volvía a leer futbolfantasy y llegaban cientos de kilobytes de respuesta.
 * Los datos ya están aquí, así que ordenar y filtrar es cosa de la página:
 * instantáneo y sin una sola petición.
 *
 * Las tarjetas son las mismas que en el resto de la web; lo único que añaden es
 * el puesto en la lista y la nota de la operación.
 */

type Tab = "negocio" | "plantilla" | "negociar";

const TABS: { key: Tab; eyebrow: string; label: string }[] = [
  { key: "negocio", eyebrow: "Clausulazos", label: "Para ganar dinero" },
  { key: "plantilla", eyebrow: "Clausulazos", label: "Para el once" },
  { key: "negociar", eyebrow: "A negociar", label: "Fichajes" },
];

type Sort = "nota" | "juega" | "sube" | "valor" | "clausula" | "abre";

const SORTS: { key: Sort; label: string }[] = [
  { key: "nota", label: "Nota" },
  { key: "juega", label: "Probabilidad" },
  { key: "sube", label: "Lo que sube" },
  { key: "clausula", label: "Cláusula" },
  { key: "valor", label: "Valor" },
  { key: "abre", label: "Se abre antes" },
];

export function FichajesList({
  negocio,
  plantilla,
  negociar,
  leagueId,
  protectionDays,
  tooExpensive,
}: {
  negocio: CardData[];
  plantilla: CardData[];
  negociar: CardData[];
  leagueId: string;
  protectionDays: number;
  tooExpensive: number;
}) {
  /**
   * Se abre en la primera pestaña que tenga algo.
   *
   * Hay días en que no hay ni una cláusula abierta —todo el mundo acaba de
   * fichar y está blindado— y entrar en una lista vacía parece que la página
   * está rota, teniendo cien jugadores a negociar al lado.
   */
  const [tab, setTab] = useState<Tab>(
    negocio.length > 0 ? "negocio" : plantilla.length > 0 ? "plantilla" : "negociar",
  );
  const [sort, setSort] = useState<Sort>("nota");
  const [onlyPlaying, setOnlyPlaying] = useState(false);
  const [info, setInfo] = useState(false);

  const rows = useMemo(() => {
    const list = tab === "negocio" ? negocio : tab === "plantilla" ? plantilla : negociar;
    const visible = list.filter(
      (c) => !onlyPlaying || ((c.probability ?? 0) >= 70 && c.status === "ok"),
    );

    const unlock = (c: CardData) =>
      c.clauseOpen || !c.unlockAt ? 0 : new Date(c.unlockAt).getTime();

    const compare = (a: CardData, b: CardData) => {
      switch (sort) {
        case "juega":
          return (b.probability ?? -1) - (a.probability ?? -1);
        case "sube":
          return (b.diff ?? 0) - (a.diff ?? 0);
        case "valor":
          return b.value - a.value;
        case "clausula":
          return a.clause - b.clause;
        case "abre":
          return unlock(a) - unlock(b);
        default:
          return (b.deal?.score ?? 0) - (a.deal?.score ?? 0);
      }
    };

    // El número que se pinta sobre la foto es el puesto en la lista tal como
    // se está viendo, no una propiedad del jugador.
    return [...visible].sort(compare).map((c, i) => ({
      ...c,
      deal: c.deal ? { ...c.deal, rank: i + 1 } : null,
    }));
  }, [tab, sort, onlyPlaying, negocio, plantilla, negociar]);

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
        {TABS.map(({ key, eyebrow, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 cursor-pointer border-b-2 px-1.5 py-2.5 text-center transition-colors sm:px-4 ${
              tab === key ? "border-acid text-acid" : "border-transparent text-faint hover:text-muted"
            }`}
          >
            <span className="label block text-[0.55rem]">{eyebrow}</span>
            <span className="display block text-[0.9rem] sm:text-base">{label}</span>
            <span className="tnum text-[0.72rem] opacity-70">{num(counts[key])}</span>
          </button>
        ))}
      </div>

      <div className="text-muted border-line flex items-start gap-3 border-b px-3.5 py-3 text-[0.8rem] sm:px-6 lg:px-10">
        <p className="flex-1">
          {tab === "negocio" ? (
            <>
              Pagar la cláusula para <strong>revender</strong>: el jugador sigue subiendo los{" "}
              {protectionDays} días que está blindado y lo vendes antes de que nadie pueda
              quitártelo. Manda el ritmo al que sube y lo poco que pagas de más.
            </>
          ) : tab === "plantilla" ? (
            <>
              Pagar la cláusula para <strong>quedárselo</strong>: aquí no importa lo que suba,
              importa que juegue, lo que puntúa por millón y el calendario que le viene.
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
          aria-label="Cómo se calcula la nota"
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
        {SORTS.map((s) => (
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
        <button type="button" onClick={() => setOnlyPlaying((v) => !v)} className={chip(onlyPlaying)}>
          Sólo titulares
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-faint px-5 py-12 text-center text-sm">Nadie encaja con estos filtros.</p>
      ) : (
        /* En una columna: la lista es un ranking y en tres hay que leer en
           zigzag para saber quién va antes que quién. */
        <div className="mx-auto grid max-w-2xl grid-cols-[minmax(0,1fr)] gap-2 p-2.5 sm:p-3 lg:p-4">
          {rows.map((card, i) => (
            <PlayerCard
              key={card.id}
              card={card}
              leagueId={leagueId}
              delay={Math.min(i * 18, 280)}
            />
          ))}
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- ayuda */

/** Los pesos exactos con los que se calcula cada nota, tal cual los usa el código. */
const WEIGHTS: Record<Tab, [string, string, string][]> = {
  negocio: [
    ["32%", "Ritmo de subida", "Lo que sube al día, ya descontado el riesgo de que el ritmo no siga. De aquí sale el beneficio entero."],
    ["24%", "Cláusula barata", "Cuánto pagas por encima de su valor. Máximo si está clavada en su valor; a partir del +40% ya no suma."],
    ["20%", "Rentabilidad", "Beneficio ÷ lo invertido a 14 días. Permite comparar a uno de 2 M€ con otro de 60 M€."],
    ["14%", "Dinero", "El beneficio en euros: ganar 6 M€ mueve más que ganar 300 k€."],
    ["10%", "Suelo", "Que siga saliendo a cuenta aunque la liga te pague su oferta mala (−10%)."],
  ],
  plantilla: [
    ["30%", "Forma", "Lo que está puntuando de media. Sin temporada empezada, lo del año pasado repartido entre 38."],
    ["26%", "Puntos por millón", "Lo que rinde por lo que cuesta: un titular de 5 M€ vale más que uno de 40 M€ que puntúa igual."],
    ["24%", "Calendario", "Dificultad media de sus tres próximos partidos de liga."],
    ["20%", "Precio de la cláusula", "El múltiplo sobre su valor, no la cifra: ×2 sobre 2 M€ es barato y sobre 20 M€ no."],
  ],
  negociar: [
    ["26%", "Forma", "Lo que viene puntuando."],
    ["22%", "Urgencia", "Lo poco que le queda para liberarse: su dueño decide o lo pierde."],
    ["20%", "Precio de la cláusula", "Cuanto más cerca de su valor, más le renta venderlo a su dueño."],
    ["18%", "Ritmo de subida", "Lo que sube al día."],
    ["14%", "Ganga", "Puntos por millón de valor."],
  ],
};

function ScoreHelp({ tab, protectionDays }: { tab: Tab; protectionDays: number }) {
  return (
    <div className="border-line bg-panel-2/40 border-b px-4 py-4 sm:px-6 lg:px-10">
      <h3 className="display text-base">Cómo se calcula la nota</h3>

      {/* Lo primero es lo que de verdad decide, y no es ninguno de los pesos. */}
      <p className="text-muted mt-2 text-[0.78rem]">
        Primero se suman estos factores, cada uno normalizado entre 0 y 1. Después{" "}
        <strong>todo se multiplica por la probabilidad de jugar</strong>, que es lo que de verdad
        decide: quien no sale ni sube de valor ni puntúa, así que un 0% deja la nota casi a cero por
        barata que tenga la cláusula, y por debajo del 50% se queda en menos de la mitad.
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

      <p className="text-faint mt-3 text-[0.74rem]">
        {tab === "negocio" && (
          <>
            Se mide todo contra vender al acabar el blindaje: pagas, sube {protectionDays} días sin
            que nadie pueda tocarlo, y lo colocas. La nota se recorta a menos de la mitad si la
            operación pierde dinero y al 60% si no te llega el saldo.{" "}
          </>
        )}
        {tab === "plantilla" && (
          <>
            La nota se recorta a la octava parte si está lesionado o sancionado, a cuatro quintos si
            es duda y a algo más de la mitad si no te llega el saldo.{" "}
          </>
        )}
        El resultado se enseña sobre 10.
      </p>
    </div>
  );
}
