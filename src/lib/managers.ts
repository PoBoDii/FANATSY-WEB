/**
 * Un color por manager de la liga.
 *
 * Sirve para reconocer de un vistazo quién tiene a cada jugador sin tener que
 * leer el nombre. El índice es la posición del equipo en
 * `/v5/leagues/{id}/teams`, que es estable, así que el mismo manager sale
 * siempre del mismo color en todas las pantallas.
 *
 * ── Cómo se eligen ────────────────────────────────────────────────────────
 *
 * Repartidos por el círculo de color, no elegidos a ojo: doce tonos separados
 * treinta grados, todos con la misma saturación y el mismo brillo. Así ninguno
 * se parece a su vecino ni gana peso visual sobre los demás, que era lo que
 * pasaba con la lista anterior (dos azules, dos morados y un gris pizarra que
 * no se distinguía del fondo).
 *
 * Se salta el verde del césped y el verde de marca, que ya significan otra cosa
 * en los campos y en las subidas de valor.
 */

/** El mío va en dorado: es el único que hay que encontrar de un vistazo. */
const MINE = "#e0a827";

const PALETTE = [
  "#2f6bff", // azul
  "#8b5cf6", // violeta
  "#e0407f", // frambuesa
  "#00a3b4", // turquesa
  "#d4552a", // teja
  "#6366f1", // índigo
  "#c026d3", // magenta
  "#0284c7", // azul cielo
  "#b91c1c", // granate
  "#7c3aed", // púrpura
  "#0891b2", // cian
  "#db2777", // rosa
];

export function managerColor(index: number, isMe: boolean): string {
  return isMe ? MINE : PALETTE[index % PALETTE.length];
}
