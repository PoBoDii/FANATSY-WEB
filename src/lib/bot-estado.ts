import { escribir, leer } from "./db";

/**
 * El interruptor del chat negociador.
 *
 * El enlace del bot se reparte por el grupo, así que un día alguien se aburre y
 * se pone a darle a la tecla. Esto permite cerrarlo desde la web en un clic:
 * entero, o sólo para el pesado de turno. Quien lo tenga abierto deja de poder
 * escribir en cuanto lo intenta — no hace falta que cierre nada ni que se entere
 * de nada.
 */

export type EstadoBot = {
  /** Con esto en falso, el chat no atiende a nadie. */
  abierto: boolean;
  /** Nombres de managers a los que se les ha cerrado la puerta a ellos solos. */
  vetados: string[];
  /** Lo que se les enseña cuando escriben. */
  motivo?: string;
};

const CLAVE = "bot:estado";

const POR_DEFECTO: EstadoBot = { abierto: true, vetados: [] };

export async function leerEstado(): Promise<EstadoBot> {
  const guardado = await leer<EstadoBot>(CLAVE);
  return guardado ? { ...POR_DEFECTO, ...guardado } : POR_DEFECTO;
}

export async function guardarEstado(estado: Partial<EstadoBot>): Promise<EstadoBot> {
  const nuevo = { ...(await leerEstado()), ...estado };
  await escribir(CLAVE, nuevo);
  return nuevo;
}

/**
 * ¿Puede escribir esta persona?
 *
 * Devuelve el motivo del cierre, o null si tiene vía libre. Se devuelve el
 * texto y no un booleano para poder decirle por qué está cerrado, que es más
 * útil que un chat que deja de contestar sin explicación.
 */
export function cerradoPara(estado: EstadoBot, quien: string): string | null {
  if (!estado.abierto) {
    return estado.motivo || "El chat está cerrado ahora mismo. Prueba más tarde.";
  }

  // Se compara sin distinguir mayúsculas: el nombre viaja desde el navegador y
  // no hay por qué fiarse de que llegue tal cual se guardó.
  const vetado = estado.vetados.some((v) => v.toLowerCase() === quien.toLowerCase());
  if (vetado) {
    return estado.motivo || "Se te ha cerrado el chat. Habla con PoBoDii si te parece mal.";
  }

  return null;
}
