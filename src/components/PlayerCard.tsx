import Link from "next/link";
import type { Player, PlayerStatus, Position } from "@/lib/normalize";
import type { FfPlayer } from "@/lib/odds";
import { ffBadge, oddsTone } from "@/lib/odds";
import { difficultyTone, type Fixture } from "@/lib/equipos";
import { dateTime, money, num, signed } from "@/lib/format";
import { Countdown } from "./Countdown";
import { PlayerPhoto } from "./PlayerPhoto";
import { PositionTag, StatusIcon } from "./ui";

/**
 * Tarjeta de jugador.
 *
 * ── Por qué está montada así ──────────────────────────────────────────────
 *
 * La versión anterior era una fila ancha con siete recuadros, cada uno con su
 * rótulo, su borde y su color. Cabía en un monitor y en el móvil se convertía
 * en un muro: mucha tinta para poca información.
 *
 * Ahora manda la jerarquía, no la caja. Sólo hay tres tamaños de letra —el
 * nombre y los puntos arriba, las cifras en medio, el resto en gris pequeño— y
 * un único borde: el de la tarjeta. La foto va a sangre, ocupando el lateral
 * entero, y el escudo se apoya encima en lugar de repetir el nombre del club.
 *
 * El color se reserva para lo que significa algo: la probabilidad de jugar, si
 * el valor sube o baja, y si la cláusula está abierta. Todo lo demás es gris.
 *
 * ── Por qué recibe un objeto plano ────────────────────────────────────────
 *
 * Porque la lista que la usa filtra y ordena **en el navegador**, y para eso
 * los datos tienen que viajar. Mandar el `Player` entero con su ficha de
 * futbolfantasy y sus treinta y ocho partidos multiplicaba por diez el peso de
 * la página. `toCard` deja sólo lo que se pinta.
 */

/** Lo justo para pintar una tarjeta, ya listo para viajar al navegador. */
export type CardData = {
  id: string;
  name: string;
  position: Position;
  photo: string | null;
  badge: string | null;
  status: PlayerStatus;

  points: number;
  average: number;
  value: number;
  /** Variación de valor respecto a ayer. */
  diff: number | null;
  probability: number | null;

  clause: number;
  clauseOpen: boolean;
  unlockAt: string | null;
  /** "12 ago 20:01", para saber el momento exacto sin abrir nada. */
  unlockLabel: string | null;

  /**
   * Días seguidos subiendo (+) o bajando (−) de valor, tal como los cuenta
   * futbolfantasy. Es la única racha que se puede saber de toda la plantilla de
   * golpe: los puntos por jornada sólo vienen en la ficha de cada jugador.
   */
  riseStreak: number;

  /** Los tres próximos de liga, con el color de su dificultad. */
  next3: { name: string; badge: string | null; atHome: boolean; bg: string; label: string }[];

  /** De quién es, en las listas que mezclan plantillas. */
  owner?: { name: string; teamId: string; isMe: boolean } | null;
  /** Una línea al pie: por qué está aquí, qué le pasa… */
  note?: string | null;

  /**
   * Si está en el mercado, lo suyo: el precio de salida sustituye a la cláusula
   * en la línea de abajo, porque es lo que se paga aquí.
   */
  market?: {
    price: number;
    /** Lo que pide de más (o de menos) sobre su valor. */
    overValue: number;
    /** "3 h 20 m", ya formateado. */
    timeLeft: string | null;
    bids: number;
    myBid: number | null;
  } | null;
};

/** Aplana lo que hace falta para la tarjeta y descarta el resto. */
export function toCard(
  player: Player,
  odds: FfPlayer | null,
  fixtures: Fixture[] | null,
  extra?: { owner?: CardData["owner"]; note?: string | null; market?: CardData["market"] },
): CardData {
  const unlockAt = player.buyoutUnlockAt ?? null;
  const clause = player.buyoutClause ?? 0;

  return {
    id: player.id,
    name: player.name,
    position: player.position,
    photo: player.image,
    badge: player.clubBadge ?? ffBadge(odds?.teamId ?? null),
    status: player.status,

    points: player.points,
    average: player.averagePoints,
    value: player.marketValue,
    diff: odds?.diff ?? null,
    probability: odds?.probability ?? null,

    clause,
    clauseOpen: clause > 0 && (!unlockAt || new Date(unlockAt).getTime() <= Date.now()),
    unlockAt,
    unlockLabel: unlockAt ? dateTime(unlockAt) : null,
    riseStreak: odds?.streak ?? 0,

    next3: (fixtures ?? [])
      .filter((f) => /liga/i.test(f.competition))
      .slice(0, 3)
      .map((f) => {
        const rival = f.atHome ? f.away : f.home;
        const tone = difficultyTone(f.difficulty);
        return {
          name: rival.name,
          badge: rival.badge,
          atHome: f.atHome,
          bg: tone.bg,
          label: tone.label,
        };
      }),

    owner: extra?.owner ?? null,
    note: extra?.note ?? null,
    market: extra?.market ?? null,
  };
}

export function PlayerCard({
  card,
  leagueId,
  dim = false,
  delay = 0,
}: {
  card: CardData;
  leagueId: string | null;
  /** Apagado, para los que no pueden jugar. */
  dim?: boolean;
  delay?: number;
}) {
  const tone = card.probability != null ? oddsTone(card.probability) : null;

  return (
    <article
      className={`rise bg-panel border-line relative flex min-h-[112px] overflow-hidden rounded-2xl border transition-colors sm:min-h-[120px] ${
        dim ? "opacity-60" : "hover:border-faint/60"
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {leagueId && (
        <Link href={`/jugador/${card.id}`} className="absolute inset-0" aria-label={card.name} />
      )}

      {/* Foto a sangre: sin marco, recortada al alto entero de la tarjeta */}
      <div className="bg-panel-2 relative w-[76px] shrink-0 overflow-hidden sm:w-[88px]">
        <PlayerPhoto src={card.photo} name={card.name} size={96} className="h-full w-full" />
        {card.badge && (
          <span className="absolute bottom-1 left-1 rounded-md bg-black/55 p-[3px] backdrop-blur-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.badge} alt="" width={16} height={16} className="block object-contain" />
          </span>
        )}
        {/* Franja de probabilidad: el color del jugador, de un vistazo */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ background: tone?.color ?? "transparent" }}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5 px-2.5 py-2.5 sm:px-3.5">
        {/* Nombre y puntos */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <PositionTag position={card.position} size="sm" />
            <h3 className="truncate text-[1rem] leading-tight font-semibold tracking-[-0.01em] sm:text-[1.15rem]">
              {card.name}
            </h3>
            <StatusIcon status={card.status} size={15} />
          </div>

          <div className="shrink-0 text-right leading-none">
            <span className="tnum text-[1.35rem] font-semibold sm:text-[1.65rem]">
              {num(card.points)}
            </span>
            <span className="text-faint mt-[3px] block text-[0.6rem] sm:text-[0.68rem]">
              {num(card.average, 1)} media
            </span>
          </div>
        </div>

        {/* Probabilidad, valor y su variación del día */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {tone ? (
            <span
              className="tnum rounded-md px-1.5 py-[3px] text-[0.72rem] leading-none font-semibold sm:text-[0.8rem]"
              style={{ background: tone.color, color: tone.ink }}
              title={`${tone.label} — ${card.probability}% de salir de titular`}
            >
              {card.probability}%
            </span>
          ) : (
            <span className="tnum text-faint text-[0.72rem]">s/d</span>
          )}

          {/* En el mercado la cifra que manda es lo que cuesta, no lo que vale:
              enseñar las dos, casi iguales, sólo hacía dudar de cuál era cuál. */}
          <span className="tnum text-[1rem] leading-none font-semibold sm:text-[1.15rem]">
            {money(card.market ? card.market.price : card.value)}
          </span>

          {card.diff ? (
            <span
              className={`tnum rounded-md px-1.5 py-[3px] text-[0.72rem] leading-none font-semibold sm:text-[0.82rem] ${
                card.diff > 0 ? "bg-up/15 text-up" : "bg-down/15 text-down"
              }`}
              title={`${card.diff > 0 ? "Sube" : "Baja"} ${money(Math.abs(card.diff))} respecto a ayer`}
            >
              {card.diff > 0 ? "▲" : "▼"} {signed(card.diff)}
            </span>
          ) : (
            <span className="text-faint text-[0.7rem]">sin cambio</span>
          )}

          {/* Días seguidos en la misma dirección: dice si el cambio de hoy es
              una racha o un rebote suelto. */}
          {card.riseStreak !== 0 && (
            <span
              className={`hidden text-[0.68rem] font-medium sm:inline ${
                card.riseStreak > 0 ? "text-up" : "text-down"
              }`}
            >
              {Math.abs(card.riseStreak)} {Math.abs(card.riseStreak) === 1 ? "día" : "días"}{" "}
              {card.riseStreak > 0 ? "subiendo" : "bajando"}
            </span>
          )}

          {card.owner && (
            <Link
              href={`/equipo/${card.owner.teamId}`}
              className={`relative z-10 truncate text-[0.7rem] font-medium ${
                card.owner.isMe ? "text-acid" : "text-muted hover:text-ink"
              }`}
            >
              {card.owner.isMe ? "tuyo" : card.owner.name}
            </Link>
          )}
        </div>

        {/* Cláusula (o precio, si está en el mercado) y calendario */}
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            {card.market ? (
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span
                  className={`tnum text-[0.68rem] leading-none ${
                    card.market.overValue > 0 ? "text-down" : "text-up"
                  }`}
                  title="Diferencia entre lo que piden y su valor de mercado"
                >
                  {signed(card.market.overValue)} s/ valor
                </span>
                {card.market.timeLeft && (
                  <span className="text-faint text-[0.68rem] leading-none">
                    cierra en {card.market.timeLeft}
                  </span>
                )}
                {/* Las pujas son la señal de si hay pelea por él. */}
                {card.market.myBid ? (
                  <span className="text-acid text-[0.7rem] leading-none font-bold">
                    pujaste {money(card.market.myBid)}
                  </span>
                ) : card.market.bids > 0 ? (
                  <span className="text-warn text-[0.7rem] leading-none font-semibold">
                    {card.market.bids} {card.market.bids === 1 ? "puja" : "pujas"}
                  </span>
                ) : (
                  <span className="text-faint text-[0.68rem] leading-none">sin pujas</span>
                )}
              </span>
            ) : card.clause > 0 ? (
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <LockIcon open={card.clauseOpen} />
                {/* Verde si se puede pagar ya, rojo mientras siga blindada. */}
                <span
                  className={`tnum text-[0.82rem] leading-none font-semibold sm:text-[0.95rem] ${
                    card.clauseOpen ? "text-up" : "text-down"
                  }`}
                  title={card.clauseOpen ? "Cláusula abierta: cualquiera puede pagarla" : "Cláusula"}
                >
                  {money(card.clause)}
                </span>
                <span
                  className="tnum text-faint text-[0.68rem] leading-none"
                  title="Lo que cuesta por encima de su valor"
                >
                  {signed(card.clause - card.value)}
                </span>
                {!card.clauseOpen && card.unlockAt && <Countdown until={card.unlockAt} />}
                {/* El momento exacto sólo cabe donde hay sitio. */}
                {!card.clauseOpen && card.unlockLabel && (
                  <span className="tnum text-faint hidden text-[0.66rem] lg:inline">
                    {card.unlockLabel}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-faint text-[0.7rem]">sin cláusula</span>
            )}
          </div>

          {card.next3.length > 0 && (
            <div className="flex shrink-0 gap-1">
              {card.next3.map((f, i) => (
                <span
                  key={`${f.name}-${i}`}
                  className="bg-panel-2 flex w-[30px] flex-col items-center gap-1 rounded-lg px-1 pt-1 pb-[3px] sm:w-[34px]"
                  title={`${f.atHome ? "En casa contra" : "Fuera contra"} ${f.name} · ${f.label}`}
                >
                  <span className="flex items-center gap-[2px]">
                    {f.badge ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.badge} alt="" width={15} height={15} className="object-contain" />
                    ) : (
                      <span className="text-faint text-[0.5rem]">{f.name.slice(0, 3)}</span>
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

        {card.note && (
          <p className="text-faint truncate text-[0.68rem] leading-tight">{card.note}</p>
        )}
      </div>
    </article>
  );
}

/** Candado abierto o cerrado, del tamaño del texto que acompaña. */
function LockIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 10 12"
      className={`h-3 w-2.5 shrink-0 ${open ? "text-up" : "text-faint"}`}
      aria-hidden
    >
      <path
        d={open ? "M2.4 5V3.4a2.6 2.6 0 0 1 5.2 0" : "M2.4 5V3.4a2.6 2.6 0 0 1 5.2 0V5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect x="0.6" y="5" width="8.8" height="6.4" rx="1.6" fill="currentColor" />
    </svg>
  );
}
