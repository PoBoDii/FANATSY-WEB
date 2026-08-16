import type { Player } from "./normalize";
import type { FfPlayer } from "./odds";

/**
 * El negociador.
 *
 * ── Qué es y qué no ───────────────────────────────────────────────────────
 *
 * Un rival entra en la página del bot, dice a quién quiere y cuánto ofrece, y
 * el bot regatea en nombre del dueño hasta llegar a un precio o romper la
 * conversación. Cuando hay acuerdo, avisa al dueño y espera su visto bueno: el
 * bot **nunca cierra nada solo**, sólo llega al número.
 *
 * ── Por qué no lleva un modelo de lenguaje ────────────────────────────────
 *
 * Porque no hace falta y porque cuesta dinero. Estas conversaciones tienen un
 * vocabulario diminuto —un nombre, una cifra, un sí o un no— y con reconocer
 * eso se cubre casi todo. Un modelo entendería mejor las frases raras, pero a
 * cambio de una factura por mensaje y de la posibilidad de que se invente un
 * precio. Aquí el precio sale de una fórmula que se puede leer.
 *
 * ── Cómo regatea ──────────────────────────────────────────────────────────
 *
 * Con tres números por jugador: lo que vale, lo mínimo que se acepta y lo que
 * se pide de salida. Se abre alto, se cede despacio y nunca por debajo del
 * mínimo. Si el otro no sube, el bot tampoco: quien tiene prisa es el que
 * quiere al jugador.
 */

/* ------------------------------------------------------------------ tipos */

export type Precio = {
  /** Lo que vale hoy en el juego. */
  valor: number;
  /** Su cláusula, que es lo que le costaría llevárselo por la fuerza. */
  clausula: number;
  /** Por debajo de esto no se vende. */
  minimo: number;
  /** Lo que se pide en el primer mensaje. */
  salida: number;
  /** Por qué vale eso, en una frase, para poder explicarlo. */
  razon: string;
};

export type Fase = "saludo" | "regateo" | "acuerdo" | "roto";

export type Trato = {
  /** Quién está negociando, tal como se ha presentado. */
  quien: string;
  playerId: string | null;
  playerName: string | null;
  fase: Fase;
  /** Lo último que ha pedido el bot. */
  pide: number;
  /** Lo último que ha ofrecido el rival. */
  ofrece: number;
  /** Cuántas veces ha subido su oferta. Se usa para ceder despacio. */
  rondas: number;
  precio: Precio | null;
  /** Momento del último mensaje, para caducar conversaciones olvidadas. */
  at: number;
};

export const tratoNuevo = (quien: string): Trato => ({
  quien,
  playerId: null,
  playerName: null,
  fase: "saludo",
  pide: 0,
  ofrece: 0,
  rondas: 0,
  precio: null,
  at: Date.now(),
});

/* --------------------------------------------------------------- precios */

/**
 * Lo que cuesta llevarse a un jugador mío.
 *
 * La idea es sencilla: cuanto más me sirve a mí, más caro le sale a él. Un
 * suplente que no juega se va por poco más de su valor; un titular fijo hay que
 * pagarlo casi como si se clausulara, porque perderlo me obliga a rehacer el
 * once.
 *
 * El techo siempre es la cláusula: pedir más que eso es absurdo, porque
 * entonces le sale más barato pagarla y quedarse con él igualmente.
 */
export function precioDe(player: Player, odds: FfPlayer | null): Precio {
  const valor = player.marketValue;
  const clausula = player.buyoutClause ?? valor * 2;

  const juega = odds?.probability != null ? odds.probability / 100 : 0.5;
  const media =
    player.averagePoints > 0 ? player.averagePoints : (player.lastSeasonPoints ?? 0) / 38;

  // De 1,10 (no juega y no puntúa) a 1,75 (fijo que rinde).
  const utilidad = 1.1 + 0.45 * juega + 0.2 * Math.min(1, media / 8);

  // Que esté subiendo también encarece: si sube solo, no hay prisa por vender.
  const subiendo = (odds?.diff ?? 0) > 200_000 ? 1.08 : 1;

  const bruto = valor * utilidad * subiendo;

  // Nunca por encima de la cláusula: a ese precio se la paga y punto.
  const minimo = Math.min(Math.round(bruto), Math.round(clausula * 0.92));

  // Se abre alto para tener recorrido, pero sin pasarse de la cláusula.
  const salida = Math.min(Math.round(minimo * 1.45), Math.round(clausula * 0.98));

  const razon =
    juega >= 0.75 && media >= 4
      ? "es titular y viene puntuando"
      : juega >= 0.75
        ? "es titular fijo"
        : media >= 4
          ? "puntúa bien"
          : (odds?.diff ?? 0) > 200_000
            ? "está subiendo de valor"
            : "no es de los que más juego me dan";

  return { valor, clausula, minimo, salida, razon };
}

/* ---------------------------------------------------- leer lo que escriben */

/**
 * La cifra de un mensaje.
 *
 * En estas conversaciones se habla en millones y de mil maneras: "50", "50M",
 * "50 kilos", "50,5", "12000000". Un número suelto por debajo de 300 son
 * millones —nadie ofrece 50 euros— y por encima, euros contados.
 */
export function leerCifra(texto: string): number | null {
  const limpio = texto.toLowerCase().replace(/\./g, "").replace(/,/g, ".");
  const match = /(\d+(?:\.\d+)?)\s*(m|mill[oó]n(?:es)?|kilos?|k)?/.exec(limpio);
  if (!match) return null;

  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;

  const unidad = match[2] ?? "";
  if (unidad.startsWith("k") && n < 10_000) return Math.round(n * 1_000_000); // "50 kilos"
  if (unidad) return Math.round(n * 1_000_000);
  return n < 300 ? Math.round(n * 1_000_000) : Math.round(n);
}

/** ¿A qué jugador se refiere? Por nombre suelto o apellido. */
export function buscarJugador(texto: string, squad: Player[]): Player | null {
  const limpio = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ");

  let mejor: { player: Player; puntos: number } | null = null;

  for (const player of squad) {
    const nombre = player.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]/g, " ");

    for (const parte of nombre.split(" ").filter((w) => w.length >= 4)) {
      if (limpio.includes(parte)) {
        // Gana la coincidencia más larga: "vicente" antes que "vice".
        const puntos = parte.length;
        if (!mejor || puntos > mejor.puntos) mejor = { player, puntos };
      }
    }
  }

  return mejor?.player ?? null;
}

const SI = /\b(s[ií]|vale|ok|okay|hecho|trato|acepto|venga|dale|perfecto|de acuerdo)\b/i;
const NO = /\b(no|paso|nada|olvida|d[ée]jalo|imposible|ni de co|ni loco)\b/i;

export type Intencion = "acepta" | "rechaza" | "otra";

export function leerIntencion(texto: string): Intencion {
  if (NO.test(texto)) return "rechaza";
  if (SI.test(texto)) return "acepta";
  return "otra";
}

/* --------------------------------------------------------- el regateo */

export type Respuesta = {
  texto: string;
  trato: Trato;
  /** Cuando hay acuerdo, lo que hay que contarle al dueño. */
  avisoAlDueno: string | null;
};

const money = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(2).replace(".", ",")} M€`;
  return `${Math.round(abs / 1000)} k€`;
};

/**
 * Cuánto cede el bot en cada vuelta.
 *
 * Poco, y cada vez menos: de la diferencia que queda hasta el mínimo se suelta
 * un tercio la primera vez, un quinto la segunda y casi nada después. Así el
 * rival ve que subir le acerca, pero que hay un suelo.
 */
function cede(pide: number, minimo: number, ronda: number): number {
  const margen = pide - minimo;
  if (margen <= 0) return minimo;
  const paso = ronda <= 1 ? 0.34 : ronda === 2 ? 0.2 : 0.1;
  return Math.max(minimo, Math.round(pide - margen * paso));
}

/**
 * La respuesta del bot a un mensaje.
 *
 * Es una función pura: entra el estado y el mensaje, sale el estado nuevo y lo
 * que hay que contestar. Así se puede probar sin levantar nada.
 */
export function responder(
  trato: Trato,
  mensaje: string,
  squad: Player[],
  precioPara: (player: Player) => Precio,
  duenoNombre: string,
): Respuesta {
  const ahora = { ...trato, at: Date.now() };
  const jugador = buscarJugador(mensaje, squad);
  const cifra = leerCifra(mensaje);
  const intencion = leerIntencion(mensaje);

  /* ------------------------------------------------ ¿de quién hablamos? */

  if (jugador && jugador.id !== ahora.playerId) {
    const precio = precioPara(jugador);
    ahora.playerId = jugador.id;
    ahora.playerName = jugador.name;
    ahora.precio = precio;
    ahora.pide = precio.salida;
    ahora.ofrece = 0;
    ahora.rondas = 0;
    ahora.fase = "regateo";

    // Si en el mismo mensaje ya viene una oferta, se contesta a la oferta.
    if (cifra === null) {
      return {
        trato: ahora,
        avisoAlDueno: null,
        texto:
          `${jugador.name}. Vale ${money(precio.valor)} y su cláusula está en ` +
          `${money(precio.clausula)}. ${capitalizar(precio.razon)}, así que no lo suelto barato: ` +
          `**${money(precio.salida)}**. ¿Qué ofreces?`,
      };
    }
  }

  if (!ahora.playerId || !ahora.precio) {
    return {
      trato: ahora,
      avisoAlDueno: null,
      texto:
        "Dime por quién preguntas y te digo precio. Escribe su nombre tal cual " +
        "(por ejemplo: «me interesa Raphinha, te doy 90»).",
    };
  }

  const precio = ahora.precio;

  /* ---------------------------------------------------- ¿acepta o rompe? */

  if (intencion === "rechaza" && cifra === null) {
    ahora.fase = "roto";
    return {
      trato: ahora,
      avisoAlDueno: null,
      texto: `Pues nada. Si cambias de idea sobre ${ahora.playerName}, aquí sigo.`,
    };
  }

  if (intencion === "acepta" && cifra === null && ahora.pide > 0) {
    ahora.fase = "acuerdo";
    ahora.ofrece = ahora.pide;
    return {
      trato: ahora,
      avisoAlDueno: aviso(ahora, duenoNombre),
      texto:
        `Hecho: ${ahora.playerName} por ${money(ahora.pide)}. Se lo paso a ${duenoNombre} ` +
        `para que lo confirme. Cuando te diga que sí, **manda tú la oferta** en el juego y él la acepta.`,
    };
  }

  /* -------------------------------------------------------- el regateo */

  if (cifra === null) {
    return {
      trato: ahora,
      avisoAlDueno: null,
      texto: `Por ${ahora.playerName} pido ${money(ahora.pide)}. Dime tu número.`,
    };
  }

  ahora.ofrece = cifra;
  ahora.rondas++;

  // Se acepta lo que llegue al precio pedido o lo roce por muy poco.
  if (cifra >= ahora.pide * 0.985) {
    ahora.fase = "acuerdo";
    return {
      trato: ahora,
      avisoAlDueno: aviso(ahora, duenoNombre),
      texto:
        `Trato hecho: ${ahora.playerName} por ${money(cifra)}. Se lo paso a ${duenoNombre} ` +
        `para que lo confirme. Cuando te diga que sí, **manda tú la oferta** y él la acepta.`,
    };
  }

  // Una oferta ridícula no merece contraoferta: se planta.
  if (cifra < precio.minimo * 0.6) {
    return {
      trato: ahora,
      avisoAlDueno: null,
      texto:
        `${money(cifra)} por ${ahora.playerName} no es una oferta, es una broma. ` +
        `Su cláusula está en ${money(precio.clausula)}. Sigo en ${money(ahora.pide)}.`,
    };
  }

  const nuevo = cede(ahora.pide, precio.minimo, ahora.rondas);

  // Si ya no queda margen, el mínimo es el mínimo.
  if (nuevo <= precio.minimo && ahora.pide <= precio.minimo) {
    return {
      trato: ahora,
      avisoAlDueno: null,
      texto:
        `${money(precio.minimo)} y no bajo más. Por menos me quedo con él, ` +
        `que ${precio.razon}. Tú decides.`,
    };
  }

  ahora.pide = nuevo;

  const cerca = (nuevo - cifra) / nuevo < 0.08;
  return {
    trato: ahora,
    avisoAlDueno: null,
    texto: cerca
      ? `Estamos cerca. ${money(nuevo)} y cerramos.`
      : `${money(cifra)} se queda corto: ${precio.razon}. Te lo dejo en ${money(nuevo)}.`,
  };
}

function aviso(trato: Trato, dueno: string): string {
  return (
    `🤝 <b>Acuerdo cerrado por el bot</b>\n\n` +
    `<b>${trato.quien}</b> quiere a <b>${trato.playerName}</b> por ` +
    `<b>${money(trato.ofrece)}</b>.\n` +
    `Vale ${money(trato.precio?.valor ?? 0)} · cláusula ${money(trato.precio?.clausula ?? 0)} · ` +
    `tu mínimo era ${money(trato.precio?.minimo ?? 0)}.\n\n` +
    `Si te vale, dile que mande la oferta y acéptala. ${dueno}, tú decides.`
  );
}

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
