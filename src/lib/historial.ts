import { escribir, leer } from "./db";
import { fantasy, safe } from "./api";
import { lineupPlayers, type ActivityEntry, type Player } from "./normalize";

/**
 * El historial de compraventa: qué pagué, qué me costó protegerlo, qué cobré.
 *
 * La liga tiene un feed de actividad, pero rota: al cabo de unos días los
 * movimientos viejos desaparecen y ya no hay forma de saber por cuánto fichaste
 * a nadie. Por eso lo que pasa por el feed se copia aquí en cuanto se ve, y a
 * partir de ese momento es nuestro para siempre.
 *
 * Lo mismo con las subidas de cláusula y con los puntos de cada jornada: nada
 * de esto lo guarda el juego más allá de unos días, así que se va apuntando.
 */

/* --------------------------------------------------------- lo que se guarda */

export type Movimiento = {
  /** El id del feed. Es lo que evita apuntar dos veces el mismo fichaje. */
  id: string;
  kind: "signing" | "sale";
  playerId: string;
  playerName: string;
  amount: number;
  date: string;
  /** A quién se lo compré o a quién se lo vendí. Vacío si fue al mercado. */
  contraparte: string | null;
};

/** Una subida de cláusula pagada de mi bolsillo. */
export type Subida = {
  /** Cuándo se detectó. */
  at: number;
  de: number;
  a: number;
  /** Lo que costó: la mitad de lo que subió. */
  gastado: number;
};

const MOVIMIENTOS = "historial:movimientos";
const CLAUSULAS = "historial:clausulas";
const PUNTOS = "historial:puntos";

export async function leerMovimientos(): Promise<Record<string, Movimiento>> {
  return (await leer<Record<string, Movimiento>>(MOVIMIENTOS)) ?? {};
}

/* --------------------------------------- copiar el feed antes de que rote */

/**
 * Copia al historial los fichajes y ventas míos que haya en el feed.
 *
 * Sólo los míos: lo que hagan los demás ya se ve en Actividad y aquí sólo
 * estorbaría. Se llama en cada visita a la página, que es gratis comparado con
 * perder un movimiento porque ese día no entré a mirar.
 */
export async function sincronizar(
  entries: ActivityEntry[],
  myUserId: string | null,
  nombreDe: (userId: string | null) => string | null,
  jugadorDe: (playerId: string) => string | null,
): Promise<Record<string, Movimiento>> {
  const guardados = await leerMovimientos();
  let nuevos = 0;

  for (const entry of entries) {
    if (entry.kind !== "signing" && entry.kind !== "sale") continue;
    if (!entry.playerId || !entry.amount || guardados[entry.id]) continue;

    /**
     * ¿Es mío el movimiento?
     *
     * El feed manda un único `user1Id`, que es quien hace la operación: en un
     * fichaje el que paga y en una venta el que cobra. La otra parte no viene,
     * ni siquiera cuando el fichaje es un clausulazo a otro manager.
     */
    const actor = entry.fromUserId ?? entry.toUserId;
    if (String(actor) !== String(myUserId)) continue;

    guardados[entry.id] = {
      id: entry.id,
      kind: entry.kind,
      playerId: entry.playerId,
      playerName: entry.playerName ?? jugadorDe(entry.playerId) ?? "Jugador",
      amount: entry.amount,
      date: entry.date ?? new Date().toISOString(),
      contraparte: entry.toUserId ? nombreDe(entry.toUserId) : null,
    };
    nuevos++;
  }

  if (nuevos > 0) await escribir(MOVIMIENTOS, guardados);
  return guardados;
}

/* ------------------------------------------------- las subidas de cláusula */

type Seguimiento = {
  /** El fichaje al que corresponde: si le vuelvo a fichar, se empieza de cero. */
  fichaje: string | null;
  /** La última cláusula que le vimos. */
  clausula: number;
  subidas: Subida[];
};

/**
 * Detecta lo que voy gastando en blindar, sin apuntar nada a mano.
 *
 * La cláusula de un jugador sube por dos motivos muy distintos:
 *
 *  1. **Porque pago.** Voy a su ficha y la subo: cada euro que pongo la sube
 *     dos. Eso es dinero gastado y tiene que sumarse a lo que me costó.
 *
 *  2. **Porque su valor de mercado la alcanza.** La cláusula nunca puede quedar
 *     por debajo del valor, así que cuando el valor la adelanta, sube sola. Ahí
 *     no he pagado nada y no cuenta.
 *
 * Distinguirlas es sólo mirar de dónde venía: sin poner un euro, la cláusula se
 * queda donde estaba o iguala al valor, lo que sea más alto. Todo lo que supere
 * eso lo he puesto yo.
 */
export async function seguirClausulas(
  mios: Player[],
  movimientos: Record<string, Movimiento>,
): Promise<Record<string, Subida[]>> {
  const guardado = (await leer<Record<string, Seguimiento>>(CLAUSULAS)) ?? {};
  let cambios = false;

  // El último fichaje de cada jugador, para saber si el seguimiento sigue
  // valiendo o es de una etapa anterior.
  const ultimoFichaje = new Map<string, Movimiento>();
  for (const mov of Object.values(movimientos)) {
    if (mov.kind !== "signing") continue;
    const previo = ultimoFichaje.get(mov.playerId);
    if (!previo || mov.date > previo.date) ultimoFichaje.set(mov.playerId, mov);
  }

  for (const player of mios) {
    const clausula = player.buyoutClause;
    if (!clausula) continue;

    const fichaje = ultimoFichaje.get(player.id) ?? null;
    let seguimiento = guardado[player.id];

    if (!seguimiento || seguimiento.fichaje !== (fichaje?.id ?? null)) {
      /**
       * De dónde parte la cuenta.
       *
       * Si el fichaje fue un clausulazo, la cláusula quedó exactamente en lo
       * que pagué, y ese número es la base buena aunque ya le haya subido algo
       * antes de que la web mirase. Se reconoce en que lo pagado y la cláusula
       * de hoy son casi la misma cifra: un fichaje de mercado se paga muy por
       * debajo de la cláusula que asigna el juego.
       */
      const clausulazo = fichaje !== null && fichaje.amount >= clausula * 0.9;
      seguimiento = {
        fichaje: fichaje?.id ?? null,
        clausula: clausulazo ? fichaje.amount : clausula,
        subidas: [],
      };
      cambios = true;
    }

    // Lo que la cláusula habría hecho sin que yo pusiera un euro.
    const sola = Math.max(seguimiento.clausula, player.marketValue);

    if (clausula > sola) {
      seguimiento = {
        ...seguimiento,
        subidas: [
          ...seguimiento.subidas,
          {
            at: Date.now(),
            de: seguimiento.clausula,
            a: clausula,
            gastado: Math.round((clausula - sola) / 2),
          },
        ],
      };
      cambios = true;
    }

    if (clausula !== seguimiento.clausula) {
      seguimiento = { ...seguimiento, clausula };
      cambios = true;
    }

    guardado[player.id] = seguimiento;
  }

  if (cambios) await escribir(CLAUSULAS, guardado);

  return Object.fromEntries(Object.entries(guardado).map(([id, s]) => [id, s.subidas]));
}

/* --------------------------------------------------------- puntos de verdad */

type SemanaPuntos = {
  /** Cuándo se apuntó, para saber a qué etapa pertenecen esos puntos. */
  at: number;
  /** Puntos de cada jugador que salió de titular esa jornada. */
  jugadores: Record<string, number>;
};

/**
 * Cuántos puntos me ha dado cada jugador jugando **en mi once**.
 *
 * No son sus puntos de la temporada: son los que sumó las jornadas que le
 * alineé de titular. Un delantero que hizo veinte puntos sentado en mi
 * banquillo no me ha dado ninguno.
 *
 * Se apunta jornada a jornada porque el juego no guarda esto: en cuanto vendes
 * al jugador desaparece de tu plantilla y con él sus estadísticas.
 */
export async function seguirPuntos(
  teamId: string,
  /** Mi plantilla de hoy, de donde salen los puntos por jornada. */
  mios: Player[],
): Promise<Record<string, SemanaPuntos>> {
  const guardado = (await leer<Record<string, SemanaPuntos>>(PUNTOS)) ?? {};

  const { data: semanaRaw } = await safe(fantasy.currentWeek());
  const semana = semanaRaw as { weekNumber?: number; isLive?: boolean } | null;
  const actual = semana?.weekNumber ?? 0;
  if (!actual) return guardado;

  /**
   * Sólo jornadas terminadas.
   *
   * Con la jornada en marcha los puntos todavía se mueven, y apuntarlos ahora
   * los dejaría congelados a medias.
   */
  const ultima = semana?.isLive ? actual - 1 : actual;
  const pendientes: number[] = [];
  for (let w = 1; w <= ultima; w++) if (!guardado[String(w)]) pendientes.push(w);
  if (pendientes.length === 0) return guardado;

  // Los puntos por jornada vienen en la propia plantilla (`lastStats`), así que
  // sólo hay que pedir las alineaciones. Una jornada pasada ya no cambia.
  const puntosDe = new Map<string, Map<number, number>>();
  for (const player of mios) {
    puntosDe.set(player.id, new Map((player.weekPoints ?? []).map((w) => [w.week, w.points])));
  }

  for (const week of pendientes) {
    const { data } = await safe(fantasy.lineupWeek(teamId, week));
    const { starters } = lineupPlayers(data);
    if (starters.length === 0) continue;

    const jugadores: Record<string, number> = {};
    for (const player of starters) {
      const puntos = puntosDe.get(player.id)?.get(week);
      if (puntos != null) jugadores[player.id] = puntos;
    }

    guardado[String(week)] = { at: Date.now(), jugadores };
  }

  await escribir(PUNTOS, guardado);
  return guardado;
}

/* ------------------------------------------------------------- el resumen */

export type Etapa = {
  /** Un mismo jugador puede tener varias: fichado, vendido y vuelto a fichar. */
  id: string;
  playerId: string;
  playerName: string;
  fichado: Movimiento;
  vendido: Movimiento | null;
  subidas: Subida[];
  /** Lo gastado en subir la cláusula durante esta etapa. */
  blindaje: number;
  /** Lo que la cláusula ganó con ese dinero: el doble. */
  clausulaGanada: number;
  /** Puntos que me dio alineado de titular. */
  puntos: number;
  /**
   * El dinero.
   *
   * Mientras es mío está en negativo, porque de momento sólo he gastado. Al
   * venderlo entra lo cobrado y ahí se ve si la operación salió bien o mal.
   */
  balance: number;
  cerrado: boolean;
};

export function resumir(
  movimientos: Record<string, Movimiento>,
  subidas: Record<string, Subida[]>,
  semanas: Record<string, SemanaPuntos>,
): Etapa[] {
  const porJugador = new Map<string, Movimiento[]>();
  for (const mov of Object.values(movimientos)) {
    const lista = porJugador.get(mov.playerId) ?? [];
    lista.push(mov);
    porJugador.set(mov.playerId, lista);
  }

  const etapas: Etapa[] = [];

  for (const [playerId, lista] of porJugador) {
    lista.sort((a, b) => a.date.localeCompare(b.date));

    /**
     * Cada fichaje abre una etapa y la venta siguiente la cierra.
     *
     * Fichar, vender y volver a fichar son dos operaciones distintas y van por
     * separado: mezclarlas daría un balance que no es el de ninguna de las dos.
     */
    for (let i = 0; i < lista.length; i++) {
      const mov = lista[i];
      if (mov.kind !== "signing") continue;

      const venta = lista.slice(i + 1).find((m) => m.kind === "sale") ?? null;
      const desde = new Date(mov.date).getTime();
      const hasta = venta ? new Date(venta.date).getTime() : Infinity;

      // Sólo lo que ocurrió dentro de esta etapa.
      const suyas = (subidas[playerId] ?? []).filter((s) => s.at >= desde && s.at <= hasta);
      const blindaje = suyas.reduce((total, s) => total + s.gastado, 0);

      const puntos = Object.values(semanas)
        .filter((s) => s.at >= desde && s.at <= hasta)
        .reduce((total, s) => total + (s.jugadores[playerId] ?? 0), 0);

      etapas.push({
        id: mov.id,
        playerId,
        playerName: venta?.playerName ?? mov.playerName,
        fichado: mov,
        vendido: venta,
        subidas: suyas,
        blindaje,
        clausulaGanada: blindaje * 2,
        puntos,
        balance: (venta?.amount ?? 0) - mov.amount - blindaje,
        cerrado: Boolean(venta),
      });
    }
  }

  // Lo abierto primero, y dentro de cada grupo lo más reciente arriba.
  return etapas.sort(
    (a, b) =>
      Number(a.cerrado) - Number(b.cerrado) ||
      (b.vendido ?? b.fichado).date.localeCompare((a.vendido ?? a.fichado).date),
  );
}

/** Lo que hay en juego ahora mismo y lo que ya está cobrado. */
export function totales(etapas: Etapa[]) {
  const cerradas = etapas.filter((e) => e.cerrado);
  const abiertas = etapas.filter((e) => !e.cerrado);

  return {
    cerradas,
    abiertas,
    /** Lo ganado o perdido de verdad: sólo cuenta lo que ya he vendido. */
    realizado: cerradas.reduce((t, e) => t + e.balance, 0),
    /** Lo que tengo metido en la plantilla de hoy. */
    invertido: abiertas.reduce((t, e) => t + e.fichado.amount + e.blindaje, 0),
    blindajes: etapas.reduce((t, e) => t + e.blindaje, 0),
    puntos: etapas.reduce((t, e) => t + e.puntos, 0),
  };
}
