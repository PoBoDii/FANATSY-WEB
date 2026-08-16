import type { Player } from "./normalize";
import type { FfPlayer } from "./odds";
import { riseOf } from "./fichajes";

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
 * La cuenta es la que haría el dueño a mano: parte del valor más un diez por
 * ciento —lo que paga la liga sin discutir—, le suma lo que el jugador va a
 * revalorizarse durante los catorce días de blindaje del comprador, y añade un
 * plus si es de los que no se sustituyen. Y por encima de todo eso está la
 * cláusula: vender por menos de lo que cualquiera puede pagar es tirar dinero.
 */
export function precioDe(player: Player, odds: FfPlayer | null): Precio {
  const valor = player.marketValue;
  const clausula = player.buyoutClause ?? valor * 2;

  /**
   * El suelo: valor más un diez por ciento.
   *
   * Es lo que paga la liga por él sin discutir, así que vender por debajo de
   * eso es regalarlo — literalmente sale más a cuenta soltarlo al sistema. De
   * aquí no se baja nunca, pase lo que pase en la conversación.
   */
  const sueloDuro = Math.round(valor * 1.1);

  /**
   * Lo que va a valer cuando el otro pueda revenderlo.
   *
   * Quien lo ficha se lo queda blindado catorce días, y si el jugador sube
   * 500 k€ diarios en ese tiempo se habrá revalorizado siete millones. Ese
   * dinero es suyo si no se cobra ahora, así que se cobra ahora. Las bajadas
   * no se cuentan: el que compra ya asume ese riesgo.
   */
  /**
   * Ojo con extrapolar el día de hoy.
   *
   * Un jugador puede subir 1,3 M€ el día después de marcar y quedarse plano el
   * resto de la semana; multiplicar ese pico por catorce daba precios
   * disparatados. Se usa el ritmo suavizado —el mismo que calcula la sección de
   * fichajes, que pesa la media semanal por encima del día suelto— y se le pone
   * un tope: la revalorización no puede valer más que un cuarto del jugador.
   */
  const sube = Math.max(0, riseOf(odds).rise);
  const revalorizacion = Math.min(sube * 14, valor * 0.25);

  /**
   * Pluses por lo que hace caro a un jugador más allá de su ficha.
   *
   * Un titular de los grandes no se sustituye con otro cualquiera, y eso vale
   * dinero aunque el mercado todavía no lo haya puesto en su valor.
   */
  const GRANDES = /barcelona|madrid|atl[ée]tico|athletic|betis|sociedad|villarreal|sevilla/i;
  const club = `${player.clubName} ${odds?.teamName ?? ""}`;
  const juega = odds?.probability != null ? odds.probability / 100 : 0.5;
  const media =
    player.averagePoints > 0 ? player.averagePoints : (player.lastSeasonPoints ?? 0) / 38;

  let plus = 1;
  if (GRANDES.test(club)) plus += 0.06;
  if (juega >= 0.8) plus += 0.06;
  else if (juega >= 0.65) plus += 0.03;
  if (media >= 6) plus += 0.06;
  else if (media >= 4) plus += 0.03;

  const objetivoBruto = Math.round((sueloDuro + revalorizacion) * plus);

  /**
   * Y por encima de todo: la cláusula.
   *
   * Si alguien puede llevárselo pagando la cláusula, venderlo por menos es
   * perder dinero a cambio de nada. Así que el precio nunca baja de ahí…
   * salvo cuando la cláusula está a punto de abrirse: en las últimas horas
   * más vale cobrar algo que ver cómo se lo llevan por el mismo precio.
   */
  const horasParaAbrir = player.buyoutUnlockAt
    ? (new Date(player.buyoutUnlockAt).getTime() - Date.now()) / 3_600_000
    : 0;
  const seAbrePronto = horasParaAbrir > 0 && horasParaAbrir < 12;

  /**
   * La cláusula manda por los dos lados.
   *
   * Por abajo, porque vender por menos de lo que cualquiera puede pagar es
   * tirar dinero: el suelo se pega a ella. Y por arriba, porque pedir más no
   * sirve de nada — si me paso, el otro deja de negociar y la paga y en paz.
   *
   * La excepción son las últimas horas antes de que se abra: ahí más vale
   * cobrar algo que verla caer, y se admite bajar hasta el suelo de verdad.
   */
  const suelo = seAbrePronto ? sueloDuro : Math.max(sueloDuro, Math.round(clausula * 0.95));
  const objetivo = Math.max(suelo, Math.round(Math.min(objetivoBruto, clausula)));

  // Se abre un poco por encima de la cláusula: si pica, mejor para nosotros.
  const salida = Math.round(objetivo * 1.08);

  const razon = GRANDES.test(club)
    ? "juega en un grande"
    : juega >= 0.8 && media >= 4
      ? "es titular y puntúa"
      : juega >= 0.8
        ? "es titular fijo"
        : media >= 6
          ? "puntúa de sobra"
          : sube >= 300_000
            ? "sube cada día"
            : "va a valer más que hoy";

  return { valor, clausula, minimo: objetivo, salida, razon };
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
          `${jugador.name}, buen ojo. Vale ${money(precio.valor)} y la cláusula está en ` +
          `${money(precio.clausula)}, o sea que baratito no es. ${capitalizar(precio.razon)}, ` +
          `así que empezamos en **${money(precio.salida)}**. Dispara.`,
      };
    }
  }

  if (!ahora.playerId || !ahora.precio) {
    return {
      trato: ahora,
      avisoAlDueno: null,
      texto:
        "A ver, que no adivino. Dime el nombre del jugador y cuánto pones encima " +
        "de la mesa. Por ejemplo: «quiero a Raphinha, te doy 90».",
    };
  }

  const precio = ahora.precio;

  /* ---------------------------------------------------- ¿acepta o rompe? */

  if (intencion === "rechaza" && cifra === null) {
    ahora.fase = "roto";
    return {
      trato: ahora,
      avisoAlDueno: null,
      texto: `Tú mismo. Cuando te lo pienses mejor ya sabes dónde estoy.`,
    };
  }

  if (intencion === "acepta" && cifra === null && ahora.pide > 0) {
    ahora.fase = "acuerdo";
    ahora.ofrece = ahora.pide;
    return {
      trato: ahora,
      avisoAlDueno: aviso(ahora, duenoNombre),
      texto:
        `Cerrado: ${ahora.playerName} por ${money(ahora.pide)}. Aviso a ${duenoNombre}, ` +
        `y en cuanto dé el visto bueno **mandas tú la oferta** y él la acepta. No te arrepientas ahora.`,
    };
  }

  /* -------------------------------------------------------- el regateo */

  if (cifra === null) {
    return {
      trato: ahora,
      avisoAlDueno: null,
      texto: `Por ${ahora.playerName} pido ${money(ahora.pide)}. ¿Tú qué pones?`,
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
        `Trato. ${ahora.playerName} por ${money(cifra)}. Se lo paso a ${duenoNombre} y, ` +
        `en cuanto diga que sí, **mandas tú la oferta** y él la acepta. Un placer hacer negocios.`,
    };
  }

  // Una oferta ridícula no merece contraoferta: se planta.
  if (cifra < precio.minimo * 0.6) {
    return {
      trato: ahora,
      avisoAlDueno: null,
      texto:
        `¿${money(cifra)}? Anda ya. Su cláusula está en ${money(precio.clausula)}, ` +
        `págala si tienes prisa. Yo sigo en ${money(ahora.pide)}.`,
    };
  }

  const nuevo = cede(ahora.pide, precio.minimo, ahora.rondas);

  // Si ya no queda margen, el mínimo es el mínimo.
  if (nuevo <= precio.minimo && ahora.pide <= precio.minimo) {
    return {
      trato: ahora,
      avisoAlDueno: null,
      texto:
        `${money(precio.minimo)}. Y de ahí no me muevo, ${precio.razon}. ` +
        `Si no te cuadra, paga la cláusula y te dejo de contar el rollo.`,
    };
  }

  ahora.pide = nuevo;

  const cerca = (nuevo - cifra) / nuevo < 0.08;
  return {
    trato: ahora,
    avisoAlDueno: null,
    texto: cerca
      ? `Ya casi. ${money(nuevo)} y no te doy más la brasa.`
      : `${money(cifra)}, ¿en serio? ${capitalizar(precio.razon)}. Te lo dejo en ${money(nuevo)} y voy siendo generoso.`,
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
