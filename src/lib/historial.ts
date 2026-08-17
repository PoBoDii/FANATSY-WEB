import { escribir, leer } from "./db";
import type { ActivityEntry } from "./normalize";

/**
 * El historial de compraventa: qué pagué, qué cobré y qué me dejó cada uno.
 *
 * La liga tiene un feed de actividad, pero rota: al cabo de unos días los
 * movimientos viejos desaparecen y ya no hay forma de saber por cuánto fichaste
 * a nadie. Por eso lo que pasa por el feed se copia aquí en cuanto se ve, y a
 * partir de ese momento es nuestro para siempre.
 */

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
  /**
   * Los puntos que llevaba el jugador cuando se apuntó el movimiento.
   *
   * Restando el del fichaje al de hoy sale lo que ha rendido conmigo, que es
   * distinto de sus puntos totales: lo que hizo antes de ser mío no cuenta.
   */
  puntos: number;
};

/** Lo gastado blindando a un jugador. Cada millón sube dos de cláusula. */
export type Blindajes = Record<string, number>;

const MOVIMIENTOS = "historial:movimientos";
const BLINDAJES = "historial:blindajes";

export async function leerMovimientos(): Promise<Record<string, Movimiento>> {
  return (await leer<Record<string, Movimiento>>(MOVIMIENTOS)) ?? {};
}

export async function leerBlindajes(): Promise<Blindajes> {
  return (await leer<Blindajes>(BLINDAJES)) ?? {};
}

export async function guardarBlindaje(playerId: string, gastado: number): Promise<Blindajes> {
  const todos = await leerBlindajes();
  if (gastado > 0) todos[playerId] = gastado;
  else delete todos[playerId];
  await escribir(BLINDAJES, todos);
  return todos;
}

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
  puntosDe: (playerId: string) => number,
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
      puntos: puntosDe(entry.playerId),
    };
    nuevos++;
  }

  if (nuevos > 0) await escribir(MOVIMIENTOS, guardados);
  return guardados;
}

export type Ficha = {
  playerId: string;
  playerName: string;
  fichado: Movimiento | null;
  vendido: Movimiento | null;
  /** Dinero metido en subir su cláusula. */
  blindaje: number;
  /** Lo que ese dinero le añadió a la cláusula: el doble. */
  clausulaGanada: number;
  /** Puntos desde que es mío. */
  puntos: number;
  /**
   * El balance.
   *
   * Vendido, es dinero contante: lo cobrado menos lo pagado menos los blindajes.
   * En plantilla es lo que ganaría vendiéndolo hoy a precio de mercado, que es
   * una estimación y se marca como tal.
   */
  balance: number;
  cerrado: boolean;
};

/**
 * Monta la ficha de cada jugador que ha pasado por mi equipo.
 *
 * Se recorre por jugador y no por movimiento porque lo que interesa no es el
 * apunte suelto, sino la operación entera: lo fiché, lo blindé, lo vendí, y de
 * todo eso salió tanto.
 */
export function resumir(
  movimientos: Record<string, Movimiento>,
  blindajes: Blindajes,
  /** Lo que vale hoy, para los que sigo teniendo. Null si ya no es mío. */
  valorDe: (playerId: string) => number | null,
  puntosDe: (playerId: string) => number | null,
): Ficha[] {
  const porJugador = new Map<string, Movimiento[]>();
  for (const mov of Object.values(movimientos)) {
    const lista = porJugador.get(mov.playerId) ?? [];
    lista.push(mov);
    porJugador.set(mov.playerId, lista);
  }

  const fichas: Ficha[] = [];

  for (const [playerId, lista] of porJugador) {
    lista.sort((a, b) => a.date.localeCompare(b.date));

    // El último ciclo: el fichaje más reciente y, si lo hay, la venta que vino
    // después. Si lo fiché dos veces, la operación que cuenta es la última.
    const fichado = [...lista].reverse().find((m) => m.kind === "signing") ?? null;
    const vendido =
      [...lista]
        .reverse()
        .find((m) => m.kind === "sale" && (!fichado || m.date >= fichado.date)) ?? null;

    const blindaje = blindajes[playerId] ?? 0;
    const pagado = fichado?.amount ?? 0;
    const cobrado = vendido?.amount ?? 0;
    const valorHoy = valorDe(playerId);
    const cerrado = Boolean(vendido);

    const puntosAhora = vendido ? vendido.puntos : (puntosDe(playerId) ?? fichado?.puntos ?? 0);

    fichas.push({
      playerId,
      playerName: vendido?.playerName ?? fichado?.playerName ?? "Jugador",
      fichado,
      vendido,
      blindaje,
      clausulaGanada: blindaje * 2,
      puntos: Math.max(0, puntosAhora - (fichado?.puntos ?? 0)),
      balance: cerrado ? cobrado - pagado - blindaje : (valorHoy ?? pagado) - pagado - blindaje,
      cerrado,
    });
  }

  // Lo abierto primero, y dentro de cada grupo lo más reciente arriba.
  return fichas.sort(
    (a, b) =>
      Number(a.cerrado) - Number(b.cerrado) ||
      (b.vendido ?? b.fichado)?.date.localeCompare((a.vendido ?? a.fichado)?.date ?? "") ||
      0,
  );
}
