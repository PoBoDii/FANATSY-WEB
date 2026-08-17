/**
 * El almacén de lo que la web escribe.
 *
 * ── Por qué no es un fichero ──────────────────────────────────────────────
 *
 * Porque la web no corre en un ordenador, corre en máquinas que se crean y se
 * destruyen a cada petición y cuyo disco es de sólo lectura. Un `.txt` escrito
 * ahí dura minutos y no llega a ninguna parte.
 *
 * ── Por qué Upstash ───────────────────────────────────────────────────────
 *
 * Porque es gratis para este volumen (diez mil operaciones al día), se habla
 * por HTTP —así que funciona igual en Netlify, en Vercel o en local— y no hace
 * falta instalar nada: dos variables de entorno y listo.
 *
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * Sin esas variables todo sigue funcionando: se guarda en memoria, que se
 * pierde al reiniciar pero permite trabajar en local sin montar nada.
 */

const url = () => process.env.UPSTASH_REDIS_REST_URL;
const token = () => process.env.UPSTASH_REDIS_REST_TOKEN;

/** Respaldo para desarrollo: se pierde al reiniciar, y no pasa nada. */
const memoria = new Map<string, string>();

async function comando(partes: (string | number)[]): Promise<unknown> {
  const base = url();
  const llave = token();

  if (!base || !llave) return null;

  try {
    const res = await fetch(base, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${llave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(partes),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: unknown };
    return data.result ?? null;
  } catch {
    // Un fallo del almacén no puede tumbar la web: se sigue con lo que haya.
    return null;
  }
}

/* ------------------------------------------------------------ valores */

export async function leer<T>(clave: string): Promise<T | null> {
  const guardado = url()
    ? ((await comando(["GET", clave])) as string | null)
    : (memoria.get(clave) ?? null);

  if (!guardado) return null;
  try {
    return JSON.parse(guardado) as T;
  } catch {
    return null;
  }
}

export async function escribir(clave: string, valor: unknown): Promise<void> {
  const texto = JSON.stringify(valor);
  if (url()) await comando(["SET", clave, texto]);
  else memoria.set(clave, texto);
}

/* -------------------------------------------------------------- listas */

/**
 * Añade al principio de una lista y la recorta.
 *
 * Se usa para las conversaciones: interesan las últimas, no las de hace un
 * mes, y dejar crecer la lista sin límite acabaría costando dinero.
 */
export async function apilar(clave: string, valor: unknown, tope = 200): Promise<void> {
  const texto = JSON.stringify(valor);

  if (url()) {
    await comando(["LPUSH", clave, texto]);
    await comando(["LTRIM", clave, 0, tope - 1]);
    return;
  }

  const lista = JSON.parse(memoria.get(clave) ?? "[]") as string[];
  memoria.set(clave, JSON.stringify([texto, ...lista].slice(0, tope)));
}

export async function pila<T>(clave: string, cuantos = 50): Promise<T[]> {
  const crudo = url()
    ? ((await comando(["LRANGE", clave, 0, cuantos - 1])) as string[] | null)
    : (JSON.parse(memoria.get(clave) ?? "[]") as string[]).slice(0, cuantos);

  return (crudo ?? [])
    .map((linea) => {
      try {
        return JSON.parse(linea) as T;
      } catch {
        return null;
      }
    })
    .filter((v): v is T => v !== null);
}

/** ¿Hay almacén de verdad, o estamos en memoria? Para poder avisarlo. */
export const hayAlmacen = () => Boolean(url() && token());
