import { escribir, leer } from "./db";

/**
 * Los precios que fijas tú a mano.
 *
 * La fórmula del bot acierta en general, pero hay casos que sólo sabes tú: al
 * que acabas de fichar y no piensas soltar, al que quieres quitarte de encima,
 * o aquel por el que un rival ya te ofreció una barbaridad. Estos valores
 * mandan sobre el cálculo.
 *
 * Se guardan todos juntos en una sola clave: son veinticuatro jugadores como
 * mucho y así se leen de una vez, sin una petición por jugador.
 */

export type PrecioManual = {
  /** Lo que pide el bot en el primer mensaje. */
  salida?: number;
  /** Por debajo de esto no vende, pase lo que pase. */
  minimo?: number;
  /** Una nota tuya, que el bot no usa pero tú sí lees. */
  nota?: string;
};

export type PreciosManuales = Record<string, PrecioManual>;

const CLAVE = "precios-manuales";

export async function leerPrecios(): Promise<PreciosManuales> {
  return (await leer<PreciosManuales>(CLAVE)) ?? {};
}

export async function guardarPrecio(
  playerId: string,
  precio: PrecioManual,
): Promise<PreciosManuales> {
  const todos = await leerPrecios();

  // Vaciar las dos casillas es la forma de volver al precio calculado.
  if (!precio.salida && !precio.minimo && !precio.nota) delete todos[playerId];
  else todos[playerId] = precio;

  await escribir(CLAVE, todos);
  return todos;
}
