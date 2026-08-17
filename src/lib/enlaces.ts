import { createHmac } from "node:crypto";

/**
 * Enlaces personales para el chat de negociación.
 *
 * ── Por qué no basta con elegirse a uno mismo de una lista ────────────────
 *
 * Porque el aviso que llega al dueño dice quién ha cerrado el trato, y con un
 * desplegable cualquiera puede firmar como otro — a propósito o por gracia. Con
 * un enlace por persona el nombre viaja **firmado**: se puede leer, pero no
 * fabricar sin la llave del servidor.
 *
 * La firma es corta (diez caracteres) porque no protege un banco: sólo evita
 * que alguien se haga pasar por otro escribiendo un nombre en la barra.
 */

const secreto = () =>
  process.env.INFORME_TOKEN ?? process.env.APP_PASSWORD ?? "poboficha";

function firma(nombre: string): string {
  return createHmac("sha256", secreto()).update(nombre).digest("base64url").slice(0, 10);
}

/** El trozo de URL que identifica a una persona: nombre + firma. */
export function enlaceDe(nombre: string): string {
  return `${encodeURIComponent(nombre)}~${firma(nombre)}`;
}

/** Devuelve el nombre si la firma cuadra, y `null` si alguien la ha tocado. */
export function nombreDe(token: string): string | null {
  const corte = token.lastIndexOf("~");
  if (corte < 1) return null;

  const nombre = decodeURIComponent(token.slice(0, corte));
  const dada = token.slice(corte + 1);
  return firma(nombre) === dada ? nombre : null;
}
