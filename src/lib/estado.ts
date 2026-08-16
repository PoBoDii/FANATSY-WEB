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
 * En el almacén de Netlify, que es gratis y no cuenta como ejecución. Si no
 * está disponible —en local, o si algún día la web se muda a otro sitio— se
 * cae a memoria: dentro de la misma ejecución no se repite nada, y entre
 * ejecuciones puede colarse algún duplicado. Preferible a caerse.
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
  const store = (await netlifyStore()) ?? memoryStore;
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
