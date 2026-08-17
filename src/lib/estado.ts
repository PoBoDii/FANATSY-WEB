import { escribir, hayAlmacen, leer } from "./db";

/**
 * Memoria de lo que ya se ha avisado.
 *
 * ── Por qué hace falta ────────────────────────────────────────────────────
 *
 * El reloj de las alertas pasa cada diez minutos y mira qué está a punto de
 * ocurrir. Sin memoria, un mismo suceso —"en media hora se abre la cláusula de
 * X"— se anunciaría en cada pasada hasta que ocurra: seis mensajes idénticos
 * por jugador.
 *
 * Se podría evitar afinando las ventanas para que sólo una pasada las acierte,
 * pero entonces basta que GitHub retrase un disparo (lo hace, y bastante) para
 * que el aviso **no llegue nunca**. Y eso es justo lo que no se puede permitir:
 * más vale un aviso repetido que uno perdido.
 *
 * ── Dónde se guarda ───────────────────────────────────────────────────────
 *
 * Por orden: Upstash si está configurado, el almacén de Netlify si la web vive
 * allí, y memoria como último recurso.
 *
 * Upstash va primero porque es el único que funciona en cualquier sitio. Con la
 * mudanza a Vercel el almacén de Netlify deja de existir, y quedarse en memoria
 * sería lo peor posible: cada disparo del reloj arranca una ejecución nueva con
 * la memoria en blanco, así que el ledger no recordaría nada y llegaría el mismo
 * aviso cada diez minutos hasta que el suceso ocurriera.
 */

type Store = {
  get: () => Promise<string[]>;
  set: (keys: string[]) => Promise<void>;
};

/** Los avisos caducan: no hace falta recordar los de la semana pasada. */
const KEEP_HOURS = 36;

/** Respaldo en memoria, para desarrollo y para cuando el almacén no está. */
let memory: string[] = [];

const memoryStore: Store = {
  get: async () => memory,
  set: async (keys) => {
    memory = keys;
  },
};

/**
 * El almacén de Netlify se carga sólo si existe. Va con `import()` dinámico y
 * dentro de un `try` a propósito: en local el paquete puede no estar instalado
 * y eso no debe impedir que las alertas funcionen.
 */
async function netlifyStore(): Promise<Store | null> {
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore({ name: "alertas", consistency: "strong" });

    return {
      get: async () => {
        const raw = await store.get("enviadas", { type: "json" });
        return Array.isArray(raw) ? (raw as string[]) : [];
      },
      set: async (keys) => {
        await store.setJSON("enviadas", keys);
      },
    };
  } catch {
    return null;
  }
}

/**
 * Upstash: el único que sobrevive a un cambio de casa.
 *
 * Se reutiliza el mismo almacén que guarda precios e historial, así que no hay
 * nada nuevo que configurar más allá de las dos variables que ya lleva la web.
 */
function upstashStore(): Store | null {
  if (!hayAlmacen()) return null;

  return {
    get: async () => (await leer<string[]>("alertas:enviadas")) ?? [],
    set: async (keys) => escribir("alertas:enviadas", keys),
  };
}

/** Marca de tiempo con la que cada clave sabe cuándo caduca. */
const stamp = (key: string, at: number) => `${at}|${key}`;

export type Ledger = {
  /** ¿Se avisó ya de esto? */
  has: (key: string) => boolean;
  /** Apúntalo como avisado. */
  add: (key: string) => void;
  /** Guarda lo apuntado. Se llama una vez al final. */
  flush: () => Promise<void>;
};

export async function openLedger(now = Date.now()): Promise<Ledger> {
  const store = upstashStore() ?? (await netlifyStore()) ?? memoryStore;
  const raw = await store.get().catch(() => []);

  const alive = new Map<string, number>();
  for (const entry of raw) {
    const [at, ...rest] = entry.split("|");
    const time = Number(at);
    const key = rest.join("|");
    if (Number.isFinite(time) && now - time < KEEP_HOURS * 3600_000) alive.set(key, time);
  }

  const added: string[] = [];

  return {
    has: (key) => alive.has(key),
    add: (key) => {
      if (!alive.has(key)) {
        alive.set(key, now);
        added.push(key);
      }
    },
    flush: async () => {
      if (added.length === 0) return;
      const keys = [...alive.entries()].map(([key, at]) => stamp(key, at));
      await store.set(keys).catch(() => {});
    },
  };
}
