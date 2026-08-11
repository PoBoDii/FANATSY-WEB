/**
 * Un color por equipo de la liga.
 *
 * Sirve para reconocer de un vistazo quién tiene a cada jugador en los campos
 * sin tener que leer el nombre. El índice es la posición del equipo en
 * `/v5/leagues/{id}/teams`, que es estable, así que el mismo manager sale
 * siempre del mismo color en todas las pantallas.
 *
 * Se evita el verde (el césped se lo come) y el ámbar queda reservado para mi
 * propio equipo.
 */
const MINE = "#b45309";

const PALETTE = [
  "#1d4ed8",
  "#7c3aed",
  "#be123c",
  "#0e7490",
  "#a21caf",
  "#c2410c",
  "#4338ca",
  "#1e293b",
  "#9d174d",
  "#0f766e",
];

export function managerColor(index: number, isMe: boolean): string {
  return isMe ? MINE : PALETTE[index % PALETTE.length];
}
