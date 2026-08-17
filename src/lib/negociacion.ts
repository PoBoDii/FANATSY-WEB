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
  /** Le queda mucho blindaje y sube: el precio va a sonar alto y hay que decirlo. */
  mucha: boolean;
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
  /**
   * Lo que ya se cerró por este jugador, si se cerró algo.
   *
   * Un acuerdo no se deshace: una vez que se dice que sí a una cifra, esa cifra
   * pasa a ser el suelo. Sin esto, el listo de turno decía "vale, 121" y acto
   * seguido "120,5" para arañar medio millón a un bot que ya había aceptado.
   */
  acordado: number;
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
  acordado: 0,
  precio: null,
  at: Date.now(),
});

/**
 * Redondea a medio millón.
 *
 * En el juego las ofertas se hacen así, en pasos de 0,5 M€, y un bot que pide
 * "118,26 M€" se delata solo: nadie negocia con esos decimales.
 */
const redondea = (v: number) => Math.round(v / 500_000) * 500_000;

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
export function precioDe(
  player: Player,
  odds: FfPlayer | null,
  /** Lo que hayas fijado tú a mano para este jugador, si has fijado algo. */
  aMano?: { salida?: number; minimo?: number },
): Precio {
  const valor = player.marketValue;
  const clausula = player.buyoutClause ?? valor * 2;

  /**
   * La prima: lo que se gana por encima del valor de mercado.
   *
   * Un cuarto del valor, con un mínimo de seis millones. Puesto en números
   * reales: por uno de 85 M€ se piden unos 21 M€ de más, y por uno de 5 M€ se
   * piden 6 M€ — que proporcionalmente es muchísimo más, y así debe ser,
   * porque por un jugador barato nadie discute dos millones arriba o abajo.
   */
  const prima = Math.max(6_000_000, valor * 0.25);

  /**
   * Nunca por debajo de la cláusula, y siempre un pelín por encima.
   *
   * Si alguien puede llevárselo pagándola, aceptar menos es perder dinero por
   * gusto; y si viene a negociar es porque no quiere soltar todo eso de golpe.
   */
  const sueloClausula = Math.round(clausula * 1.05);

  /**
   * El recargo por lo que dejo de ganar esperando.
   *
   * Si el jugador sube y le queda blindaje por delante, dentro de esos días
   * valdrá más y entonces pediría más por él. Vender hoy es renunciar a eso, y
   * se cobra — pero **como un recargo acotado**, no extrapolando la subida a
   * catorce días, que era lo que disparaba el precio a cifras de risa.
   */
  const sube = Math.max(0, riseOf(odds).rise);
  const dias = player.buyoutUnlockAt
    ? Math.max(0, (new Date(player.buyoutUnlockAt).getTime() - Date.now()) / 86_400_000)
    : 0;
  const mucha = dias >= 7 && sube >= 200_000;
  const recargo = mucha ? 1.08 : dias >= 4 && sube >= 200_000 ? 1.04 : 1;

  /* --------------------------------------------------------------- pluses */

  const GRANDES = /barcelona|madrid|atl[ée]tico|athletic|betis|sociedad|villarreal|sevilla/i;
  const club = `${player.clubName} ${odds?.teamName ?? ""}`;
  const juega = odds?.probability != null ? odds.probability / 100 : 0.5;
  const media =
    player.averagePoints > 0 ? player.averagePoints : (player.lastSeasonPoints ?? 0) / 38;

  let plus = 1;
  if (GRANDES.test(club)) plus += 0.03;
  if (juega >= 0.8) plus += 0.04;
  if (media >= 6) plus += 0.04;

  /**
   * En las últimas horas antes de que se abra la cláusula el que corre soy yo:
   * más vale cobrar la prima que ver cómo se lo llevan pagando la cláusula.
   */
  const ultimasHoras = dias > 0 && dias < 0.5;
  const base = ultimasHoras
    ? valor + prima
    : Math.max(valor + prima, sueloClausula);

  const objetivo = redondea(base * recargo * plus);

  /**
   * Se abre sólo un poco por encima.
   *
   * Pedir el doble de lo que se espera no es negociar duro, es que te tomen
   * por loco y se acabe la conversación. Se abre un 6% arriba y se baja poco.
   */
  const salida = redondea(objetivo * 1.06);

  const razon = mucha
    ? "le queda cláusula por delante y sube cada día"
    : juega >= 0.8 && media >= 4
      ? "es titular y puntúa"
      : GRANDES.test(club)
        ? "juega en un grande"
        : juega >= 0.8
          ? "es titular fijo"
          : sube >= 300_000
            ? "sube cada día"
            : "vale más de lo que parece";

  /**
   * Lo que fijes tú manda sobre el cálculo.
   *
   * Si sólo pones uno de los dos, el otro se deduce: un mínimo a mano arrastra
   * la salida por encima, y una salida a mano nunca puede quedar por debajo
   * del mínimo, o el bot empezaría pidiendo menos de lo que acepta.
   */
  const minimoFinal = aMano?.minimo ?? objetivo;
  const salidaFinal = Math.max(aMano?.salida ?? salida, minimoFinal);

  return {
    valor,
    clausula,
    minimo: minimoFinal,
    salida: salidaFinal,
    razon: aMano?.minimo ? "es de los que no quiero soltar" : razon,
    mucha: aMano?.minimo ? false : mucha,
  };
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
  /**
   * El punto es de millar o decimal según lo que venga detrás.
   *
   * "1.200.000" son puntos de millar; "120.5" es ciento veinte y medio. Antes
   * se borraban todos por igual y "120.5" acababa leyéndose como 1.205 euros,
   * así que una oferta de 120,5 M€ se contestaba con un "¿1 k€?".
   */
  const limpio = texto
    .toLowerCase()
    .replace(/(\d)\.(?=\d{3}(?!\d))/g, "$1")
    .replace(/,/g, ".");
  const match = /(\d+(?:\.\d+)?)\s*(m|mill[oó]n(?:es)?|kilos?|k)?/.exec(limpio);
  if (!match) return null;

  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;

  const unidad = match[2] ?? "";
  if (unidad.startsWith("k") && n < 10_000) return Math.round(n * 1_000_000); // "50 kilos"
  if (unidad) return Math.round(n * 1_000_000);
  return n < 300 ? Math.round(n * 1_000_000) : Math.round(n);
}

/**
 * Aplana un nombre para poder compararlo con lo que escribe la gente.
 *
 * Se le quitan los acentos, las haches y las letras repetidas, que es donde se
 * cometen todas las erratas: así "rapinha", "raphina" y "Raphinha" acaban
 * siendo la misma palabra.
 */
function raiz(palabra: string): string {
  return palabra
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/h/g, "")
    .replace(/(.)+/g, "$1");
}

/** ¿A qué jugador se refiere? Por nombre suelto, apellido o errata. */
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
      // Primero tal cual, y si no, comparando raíces por si hay erratas.
      const exacto = limpio.includes(parte);
      const aproximado =
        !exacto &&
        parte.length >= 5 &&
        limpio.split(" ").some((palabra) => palabra.length >= 4 && raiz(palabra) === raiz(parte));

      if (exacto || aproximado) {
        // Gana la coincidencia más larga: "vicente" antes que "vice".
        const puntos = parte.length + (exacto ? 1 : 0);
        if (!mejor || puntos > mejor.puntos) mejor = { player, puntos };
      }
    }
  }

  return mejor?.player ?? null;
}

const SI = /\b(s[ií]|vale|ok|okay|hecho|trato|acepto|venga|dale|perfecto|de acuerdo)\b/i;
/**
 * Sólo un portazo de verdad rompe la conversación.
 *
 * Antes bastaba con que apareciera un "no" suelto en cualquier sitio, y frases
 * como "no llego a tanto" —que es negociar, no marcharse— daban la charla por
 * terminada. Ahora hay que decirlo con todas las letras.
 */
const NO = /\b(paso|olv[ií]dalo|d[ée]jalo|ni de co|ni loco|no gracias|no me interesa|lo dejo)\b/i;

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
 * Converge hacia el objetivo en vez de picotear: se recorta más de la mitad de
 * lo que separa la petición del objetivo en la primera vuelta y cada vez menos
 * después. Bajar de millón en millón estando a cuarenta de distancia no es ser
 * duro, es hacer perder el tiempo a los dos.
 */
function cede(pide: number, objetivo: number, ronda: number, ofrece: number): number {
  const margen = pide - objetivo;
  if (margen <= 0) return objetivo;

  // Lo que se suelta por el simple hecho de ir avanzando la conversación.
  const porMargen = margen * (ronda <= 1 ? 0.55 : ronda === 2 ? 0.45 : 0.35);

  /**
   * Y lo que se suelta por cortesía: si el otro pega un salto de siete, bajar
   * medio millón es una tomadura de pelo y se nota. Se responde a la mitad del
   * hueco que queda hasta su oferta, sin bajar nunca del objetivo.
   */
  const hueco = Math.max(0, pide - Math.max(ofrece, objetivo));
  const porHueco = hueco * 0.5;

  return Math.max(objetivo, redondea(pide - Math.max(porMargen, porHueco)));
}

/**
 * La respuesta del bot a un mensaje.
 *
 * Es una función pura: entra el estado y el mensaje, sale el estado nuevo y lo
 * que hay que contestar. Así se puede probar sin levantar nada.
 */
/**
 * Lo que dice cuando la oferta es un insulto en sí misma.
 *
 * Sólo salen aquí: si el otro está negociando de verdad, vacilarle es hacerle
 * perder las ganas. La guasa se reserva para quien ofrece el valor de mercado o
 * menos, que es pedir el jugador de regalo.
 */
const BORDES = [
  "Estás fatal. Igual tienes el potasio bajo: cómete un plátano y me lo cuentas.",
  "Con esos números lo que te falta no es dinero, es magnesio. Descansa un poco.",
  "Payaso. Con todo el cariño del mundo, pero payaso.",
  "Eso no es una oferta, es una falta de respeto con cifras.",
  "¿Te has caído de la cuna o te empujaron?",
  "Menuda cara tienes, macho. Deberías mirarte el hierro.",
  "Anda, tómate un zumo de naranja y vuelve con la cabeza fría.",
  "Ni con un chute de vitamina B12 se te ocurre algo peor.",
  "Vete a que te miren los niveles de vitamina D, que estás flojo.",
  "Esa oferta la ha escrito alguien con la tensión por los suelos.",
];

/** Cuando se acerca de verdad, se le anima en vez de vacilarle. */
const CERCA = [
  "Ya estamos hablando. {n} y lo cerramos ahora mismo.",
  "Casi lo tienes. Ponme {n} y nos damos la mano.",
  "Venga, {n} y dejo de darte la lata.",
  "Estamos a nada. {n} y es tuyo.",
  "Me lo estás poniendo difícil. {n} y trato hecho.",
  "Un último empujón: {n} y firmamos.",
];

/**
 * La primera respuesta a una oferta baja.
 *
 * No es una rebaja: es decir el precio por primera vez. Decir "bajo hasta" en
 * el primer mensaje era regalar la idea de que ya se está cediendo, cuando
 * todavía no se ha movido nada.
 */
const PRIMERA = [
  "¿{o} por {x}? Ni de broma. {r}: mi precio es {n}.",
  "{o} para empezar está bien... para ti. {r}. Mi número es {n}.",
  "Vamos a ahorrarnos el paseo. {r}, así que el precio es {n}. Desde ahí hablamos.",
  "Guárdate esos {o} para el fantasy de tu primo. {r}. Son {n}.",
  "Empezamos mal, ¿eh? {r}, así que el precio es {n}.",
  "Bonito intento. {r}. Estoy en {n} y de ahí todavía no me he movido.",
  "{o}. Muy gracioso. {r}: {n}.",
  "Por {x} se pagan {n}, que {r}. Tus {o} me los quedo de propina.",
];

/** Cuando ya se está regateando en serio y toca ceder un poco. */
const LEJOS = [
  "Por {o} no lo suelto: {r}. Bajo a {n} y ya me duele.",
  "{o} se queda corto. {r}. Te lo dejo en {n}.",
  "Ahí no llegamos: {r}. Hasta {n} llego, más abajo no.",
  "Entiendo la jugada, pero {r}. Mi número es {n}.",
  "Por {o} me lo quedo yo, que {r}. Hablamos si llegas a {n}.",
  "Vas subiendo, algo es algo. {r}: {n} y seguimos.",
  "{o}... {r}. Te hago un esfuerzo: {n}.",
  "Me estás haciendo trabajar. {r}. {n}, y porque hoy estoy generoso.",
  "No me llega con {o}. {r}. {n} es lo que hay.",
  "Sube, hombre, sube. {r}. Yo bajo a {n}.",
  "Con {o} no me compras ni la camiseta. {r}. {n}.",
  "Casi me convences. Casi. {r}. {n}.",
];

/** Cuando repiten la misma cifra. */
const FIRME = [
  "Ya me habías dicho {o}. Sigo en {n}, que no soy una máquina expendedora.",
  "Puedes repetirlo las veces que quieras: {n}.",
  "Insistir no me baja el precio. {n}.",
  "Mi número no se mueve porque tú escribas más rápido: {n}.",
  "{o} otra vez no. {n}, y van tres.",
  "Que no, pesado. {n}.",
  "Copiar y pegar no es negociar. {n}.",
];

/** Cuando bajan la oferta, que es de una cara enorme. */
const BAJA = [
  "Acabas de ofrecerme menos que antes. Así vamos para atrás: {n}.",
  "¿De {o} para abajo? Se negocia subiendo, campeón. {n}.",
  "Vas en dirección contraria. {n}.",
  "Cada vez que escribes me ofreces menos. A este paso me lo quedo gratis. {n}.",
];

/**
 * Cuando sueltan algo que no es ni un jugador ni una cifra.
 *
 * Aquí caen los insultos, las preguntas raras y el que viene a dar palique. Se
 * responde con borderío y se vuelve al precio, que es a lo que se ha venido:
 * `{p}` es la frase con lo que se pide ahora mismo.
 */
const BRUSCO = [
  "Eres un payaso. Si quieres fichar, paga; si quieres charla, búscate un grupo. {p}",
  "Menos hablar y más ofrecer. {p}",
  "Yo de terapia no entiendo, de precios sí. {p}",
  "A ver si te lavas esa cara de payaso y me pones un número. {p}",
  "Se te nota que no desayunas. Magnesio y una oferta, por ese orden. {p}",
  "Eso no es una cifra. Vuelve cuando sepas contar. {p}",
  "Me da igual tu opinión, macho. {p}",
  "¿Has venido a fichar o a que te haga compañía? {p}",
  "Escribe un número o vete a molestar a otro. {p}",
  "Te falta hierro y te sobra morro. {p}",
  "Esto no es un confesionario. {p}",
  "Cuéntaselo a tu almohada. {p}",
  "Con esa boca comes, y encima mal. Vitamina B12 y a ofertar. {p}",
  "Mucho teclado y poco dinero, lo de siempre. {p}",
];

/** Cuando ni siquiera han dicho de quién hablan. */
const SIN_JUGADOR = [
  "A ver, que no soy adivino. Dime el jugador y el número. Algo como «quiero a Raphinha, te doy 90».",
  "No me has dicho ni a quién quieres. Nombre y cifra, que no es tan difícil.",
  "Empieza por decirme un nombre, campeón. Y una cifra detrás.",
  "¿Y yo qué hago con eso? Dime a quién quieres y cuánto pones.",
  "Menos rollo: nombre del jugador y número. Lo demás me sobra.",
  "Aquí se viene con los deberes hechos: un nombre y un número.",
];

/**
 * Chistes.
 *
 * Van escritos aquí y no salen de internet porque el bot no navega: no lleva
 * un modelo detrás, así que lo que no esté en esta lista no lo sabe contar. A
 * cambio no se inventa nada y no cuesta un céntimo.
 */
const CHISTES = [
  "Chiste: —Doctor, ¿me va a doler? —A mí no.",
  "El médico me dio seis meses de vida. Como no le pagué, me dio seis más.",
  "Mi abuelo murió durmiendo, tan tranquilo. Los pasajeros de su autobús no tuvieron tanta suerte.",
  "Mi mujer y yo fuimos felices veinte años. Luego nos conocimos.",
  "—Papá, ¿por qué me llamo Rosa? —Porque te cayó una rosa en la cabeza. —Gracias, papá. —De nada, Ladrillo.",
  "Mi abuela decía que la vida es como una caja de bombones. Murió atragantada.",
  "—¿Y tu hermano? —Salió a por tabaco. —¿Y cuándo vuelve? —Nunca: no fumaba.",
  "Mi psicólogo dice que tengo problemas con la venganza. Ya veremos quién ríe el último.",
  "Dicen que el dinero no da la felicidad, pero llorando en un yate se llora mejor.",
  "—Camarero, hay una mosca en mi sopa. —Tranquilo, la araña del pan se la come.",
  "Me apunté a un grupo de gente con mala memoria. No me acuerdo de cuándo era la reunión.",
  "Un ateo en un ataúd es un tío muy bien vestido y sin ningún sitio al que ir.",
];


const elige = (frases: string[], semilla: number) => frases[Math.abs(semilla) % frases.length];

/**
 * Mayúscula después de punto.
 *
 * Las frases se montan por trozos y la razón del precio ("le queda cláusula por
 * delante") está escrita en minúscula porque a veces va a mitad de frase.
 * Cuando le toca ir después de un punto hay que levantarla, o se lee como si lo
 * hubiera escrito un robot con prisa.
 */
const puntuar = (texto: string) =>
  texto.replace(/(^|[.!?]\s+)([a-záéíóúüñ])/g, (_, antes: string, letra: string) =>
    antes + letra.toUpperCase(),
  );

const rellena = (
  frase: string,
  datos: { n?: string; o?: string; r?: string; x?: string; p?: string },
) =>
  puntuar(
    frase
      .replace("{n}", datos.n ?? "")
      .replace("{o}", datos.o ?? "")
      .replace("{r}", datos.r ?? "")
      .replace("{x}", datos.x ?? "")
      .replace("{p}", datos.p ?? ""),
  );

/**
 * Un chiste de vez en cuando, no siempre.
 *
 * Uno de cada cuatro mensajes de los bordes. Contarlo cada vez lo convertiría
 * en una muletilla y dejaría de tener gracia a los tres mensajes.
 */
const conChiste = (texto: string, semilla: number) =>
  Math.abs(semilla) % 4 === 0 ? `${texto} ${elige(CHISTES, semilla + 5)}` : texto;

/**
 * Lo que la gente dice de verdad en estas conversaciones.
 *
 * No es entender castellano —para eso haría falta un modelo—, pero cubre lo que
 * sale una y otra vez en el grupo: preguntar el precio, quejarse de que es caro,
 * jurar que es su última oferta, pedir tiempo, saludar o proponer un cambio.
 * Cada una tiene su respuesta, que es lo que separa a un bot que conversa de uno
 * que contesta lo mismo a todo.
 */
const PREGUNTA_PRECIO = /(cu[aá]nt|precio|pides|vale|cuesta|cifra|c[oó]mo va|en qu[eé] te quedas)/i;
const CARO = /(mucho|muy car|car[ií]simo|te pasas|pasando|barbaridad|locura|exager|una pasada|abusiv|atraco|robo)/i;
const ULTIMA = /([uú]ltima (oferta|palabra)|no llego a m[aá]s|no puedo m[aá]s|es todo lo que|no tengo m[aá]s|lo tomas o lo dejas|m[aá]ximo que)/i;
const PIENSO = /(me lo pienso|lo pienso|d[eé]jame pensar|ahora te digo|luego te digo|te digo algo|lo consulto)/i;
const SALUDO = /^\s*(hola|buenas|hey|ey|qu[eé] tal|buenos d[ií]as|buenas tardes|buenas noches|saludos)/i;
const CAMBIO = /(cambio|intercambi|trueque|te doy a |m[aá]s un jugador|te meto a )/i;

/** Cuando dicen que el precio es un atraco. */
const ES_CARO = [
  "Claro que es caro, es que es bueno. {r}. {p}",
  "Caro es pagar por uno que no juega. Este {r}. {p}",
  "Si fuera barato ya no lo tendría yo. {r}. {p}",
  "Lo caro es quedarse sin él. {r}. {p}",
  "Pues no lo compres, nadie te obliga. {p}",
];

/** Cuando juran que es su última oferta. */
const ES_ULTIMA = [
  "«Última oferta» me han dicho ocho personas esta semana. {p}",
  "Si es la última, la mía también: {p}",
  "Pues nos hemos quedado sin trato, porque {p}",
  "Vale. Entonces se queda conmigo y tan amigos. {p}",
];

export function responder(
  trato: Trato,
  mensaje: string,
  squad: Player[],
  precioPara: (player: Player) => Precio,
  duenoNombre: string,
  ajenos?: (texto: string) => { nombre: string; dueno: string | null } | null,
): Respuesta {
  const ahora = { ...trato, at: Date.now() };
  const jugador = buscarJugador(mensaje, squad);
  const cifra = leerCifra(mensaje);
  const intencion = leerIntencion(mensaje);

  // Con la conversación rota no se vuelve: el que faltó al respeto que empiece
  // de cero en otro momento.
  /**
   * Después de una oferta insultante el bot corta, pero no para siempre.
   *
   * Si el otro recapacita y vuelve con una cifra que se sostiene, se retoma la
   * conversación: el objetivo es vender caro, no quedarse con la última
   * palabra.
   */
  if (ahora.fase === "roto") {
    const sube = cifra !== null && ahora.precio !== null && cifra > ahora.precio.valor * 1.05;
    if (!sube && !jugador) {
      return {
        trato: ahora,
        avisoAlDueno: null,
        texto: "Ya hemos terminado por hoy. Vuelve cuando traigas una oferta seria.",
      };
    }
    ahora.fase = "regateo";
  }

  /* --------------------------------------------- ¿ese jugador es mío? */

  if (!jugador) {
    const otro = ajenos?.(mensaje);
    if (otro) {
      return {
        trato: ahora,
        avisoAlDueno: null,
        texto: otro.dueno
          ? `${otro.nombre} no es mío, lo tiene ${otro.dueno}. Ve a marearle a él, ` +
            `que yo bastante tengo.`
          : `${otro.nombre} no lo tiene nadie, está libre. Míralo en el mercado antes ` +
            `de venir a preguntarme, hombre.`,
      };
    }
  }

  /* ------------------------------------------------ ¿de quién hablamos? */

  if (jugador && jugador.id !== ahora.playerId) {
    const precio = precioPara(jugador);
    ahora.playerId = jugador.id;
    ahora.playerName = jugador.name;
    ahora.precio = precio;
    ahora.pide = precio.salida;
    ahora.ofrece = 0;
    ahora.rondas = 0;
    ahora.acordado = 0;
    ahora.fase = "regateo";

    if (cifra === null) {
      const aviso = precio.mucha
        ? ` Le queda cláusula por delante y sube cada día, así que si lo suelto ahora ` +
          `me tienes que compensar lo que voy a dejar de ganar.`
        : "";

      return {
        trato: ahora,
        avisoAlDueno: null,
        texto:
          `${jugador.name}, buen ojo. Vale ${money(precio.valor)} y la cláusula está en ` +
          `${money(precio.clausula)}.${aviso} Lo dejo en **${money(precio.salida)}**. Tú dirás.`,
      };
    }
  }

  /**
   * Una semilla que cambia con cada mensaje.
   *
   * Lleva la hora dentro a propósito: así el que escribe dos veces lo mismo no
   * se lleva dos veces la misma contestación, que era justo lo que delataba al
   * bot como bot.
   */
  const chispa = mensaje.length * 13 + Math.floor(ahora.at / 997);

  if (!ahora.playerId || !ahora.precio) {
    return {
      trato: ahora,
      avisoAlDueno: null,
      texto: conChiste(elige(SIN_JUGADOR, chispa), chispa),
    };
  }

  const precio = ahora.precio;

  /**
   * Los cambios se cortan de raíz, traigan cifra o no.
   *
   * "Te doy 115 y te meto a Lewandowski" llevaba un número dentro, así que el
   * bot lo leía como una oferta limpia de 115 y contestaba sin enterarse de que
   * le estaban colando un jugador.
   */
  if (CAMBIO.test(mensaje)) {
    return {
      trato: ahora,
      avisoAlDueno: null,
      texto:
        `Cambios no hago: bastante lío tengo ya con mi plantilla. Dinero y nos entendemos. ` +
        `Por ${ahora.playerName} estoy en ${money(ahora.pide)}.`,
    };
  }

  /* ---------------------------------------------------- ¿acepta o rompe? */

  if (intencion === "rechaza" && cifra === null) {
    ahora.fase = "roto";
    return {
      trato: ahora,
      avisoAlDueno: null,
      texto: "Tú mismo. Ya sabes dónde estoy cuando te lo pienses mejor.",
    };
  }

  /**
   * "¿Cuánto vale?" no es un sí.
   *
   * La palabra "vale" significa las dos cosas en castellano y el bot cerraba el
   * trato a quien sólo estaba preguntando el precio. Si hay pregunta, no hay
   * acuerdo.
   */
  if (intencion === "acepta" && cifra === null && ahora.pide > 0 && !PREGUNTA_PRECIO.test(mensaje)) {
    ahora.fase = "acuerdo";
    ahora.ofrece = ahora.pide;
    ahora.acordado = ahora.pide;
    return {
      trato: ahora,
      avisoAlDueno: aviso(ahora, duenoNombre),
      texto: cierre(ahora.playerName!, ahora.pide, duenoNombre),
    };
  }

  /* -------------------------------------------------------- el regateo */

  /**
   * Ha escrito algo que no es una oferta.
   *
   * Si pregunta por el precio se le contesta; si viene a insultar o a dar
   * conversación, se le contesta igual de mal y se vuelve al número, que es a
   * lo que se ha venido. Repetir "¿tú qué pones?" a todo era lo peor de las dos
   * cosas: ni respondía ni picaba.
   */
  if (cifra === null) {
    const linea = `Por ${ahora.playerName} estoy en ${money(ahora.pide)}.`;

    const di = (texto: string) => ({ trato: ahora, avisoAlDueno: null, texto });

    if (PREGUNTA_PRECIO.test(mensaje)) return di(`${linea} ¿Tú qué pones?`);

    if (CARO.test(mensaje))
      return di(rellena(elige(ES_CARO, chispa), { p: linea, r: precio.razon }));

    if (ULTIMA.test(mensaje)) return di(rellena(elige(ES_ULTIMA, chispa), { p: linea }));

    if (PIENSO.test(mensaje))
      return di(
        `Piénsatelo, pero no tardes: sube cada día y mañana este precio ya no está. ${linea}`,
      );

    if (SALUDO.test(mensaje))
      return di(`Buenas. Al grano, que tengo veinticuatro jugadores que atender. ${linea}`);

    return di(conChiste(rellena(elige(BRUSCO, chispa), { p: linea }), chispa));
  }

  /**
   * Sólo se cede cuando el otro sube.
   *
   * Repetir la misma cifra —o bajarla— no puede salirle gratis: si cada mensaje
   * arrancara una rebaja, bastaría con insistir para llevarse al jugador al
   * precio que le diera la gana.
   */
  const mejora = ahora.ofrece === 0 || cifra > ahora.ofrece;
  const anterior = ahora.ofrece;
  ahora.ofrece = cifra;
  if (mejora) ahora.rondas++;

  /**
   * Ofrecer su valor de mercado o menos es pedirlo de regalo: el juego paga
   * eso sin discutir. Ahí se acaba la conversación.
   */
  if (cifra <= precio.valor * 1.02) {
    ahora.fase = "roto";
    return {
      trato: ahora,
      avisoAlDueno: null,
      texto:
        `¿${money(cifra)} por ${ahora.playerName}? Vale ${money(precio.valor)}: me estás ` +
        `ofreciendo menos de lo que me da la liga por él. ` +
        `${elige(BORDES, Math.round(cifra / 1_000_000) + mensaje.length)}`,
    };
  }

  /**
   * El suelo de la conversación.
   *
   * Normalmente es el mínimo del jugador, pero si ya se cerró un trato pasa a
   * ser esa cifra: lo aceptado, aceptado está, y de ahí no se baja por mucho
   * que el otro lo intente después.
   */
  const objetivo = Math.max(precio.minimo, ahora.acordado ?? 0);

  if (ahora.acordado && cifra < ahora.acordado) {
    return {
      trato: ahora,
      avisoAlDueno: null,
      texto:
        `Ya habíamos cerrado en ${money(ahora.acordado)} y ahora me vienes con ` +
        `${money(cifra)}. Por ahí no paso: ${money(ahora.acordado)} o nada.`,
    };
  }

  /**
   * Nunca se acepta a la primera, aunque el número esté bien: quien abre
   * fuerte casi siempre guarda otro escalón. Se pide un poco más una vez, y si
   * repite o sube, se cierra.
   */
  if (cifra >= objetivo && ahora.rondas === 1) {
    const rasca = redondea(Math.max(cifra * 1.04, cifra + 2_000_000));
    ahora.pide = rasca;
    return {
      trato: ahora,
      avisoAlDueno: null,
      texto:
        `Buen número, no te voy a mentir. Redondéame a ${money(rasca)} y firmamos ahora, ` +
        `que ${precio.razon}.`,
    };
  }

  if (cifra >= objetivo) {
    ahora.fase = "acuerdo";
    ahora.acordado = cifra;
    return {
      trato: ahora,
      avisoAlDueno: aviso(ahora, duenoNombre),
      texto: cierre(ahora.playerName!, cifra, duenoNombre),
    };
  }

  const semilla = ahora.rondas + Math.round(cifra / 1_000_000) + mensaje.length;

  /**
   * "Es mi última oferta" y no llega.
   *
   * Es un farol clásico y merece su respuesta, no una rebaja: si de verdad es
   * la última, ceder ahora sólo enseña que el farol funciona.
   */
  if (ULTIMA.test(mensaje)) {
    return {
      trato: ahora,
      avisoAlDueno: null,
      texto: rellena(elige(ES_ULTIMA, semilla), {
        p: `Por ${ahora.playerName} estoy en ${money(ahora.pide)}.`,
      }),
    };
  }

  if (!mejora) {
    return {
      trato: ahora,
      avisoAlDueno: null,
      texto: conChiste(
        rellena(elige(cifra < anterior ? BAJA : FIRME, semilla), {
          n: money(ahora.pide),
          o: money(anterior),
        }),
        chispa,
      ),
    };
  }

  /**
   * A la primera oferta no se cede: se dice el precio.
   *
   * Antes la primera respuesta ya recortaba y encima lo anunciaba —"bajo hasta
   * tanto"—, así que el otro empezaba la conversación viendo que el bot se
   * movía sin haber puesto nada encima de la mesa.
   */
  if (ahora.rondas === 1) {
    ahora.pide = precio.salida;
    return {
      trato: ahora,
      avisoAlDueno: null,
      texto: rellena(elige(PRIMERA, semilla), {
        n: money(precio.salida),
        o: money(cifra),
        r: precio.razon,
        x: ahora.playerName ?? "ese",
      }),
    };
  }

  const nuevo = cede(ahora.pide, objetivo, ahora.rondas, cifra);
  ahora.pide = nuevo;

  const distancia = (nuevo - cifra) / nuevo;

  return {
    trato: ahora,
    avisoAlDueno: null,
    texto:
      distancia < 0.08
        ? rellena(elige(CERCA, semilla), { n: money(nuevo) })
        : rellena(elige(LEJOS, semilla), {
            n: money(nuevo),
            o: money(cifra),
            r: precio.razon,
          }),
  };
}

/**
 * El cierre.
 *
 * Deja claro que el número no es una venta: el dueño tiene la última palabra y
 * puede rechazarlo o pedir otra cosa. El bot negocia, no firma.
 */
function cierre(jugador: string, precio: number, dueno: string): string {
  return (
    `Trato: ${jugador} por **${money(precio)}**. Ojo, que esto no es una venta cerrada — ` +
    `se lo paso a ${dueno} y él tiene la última palabra: puede aceptarlo, pedir más o ` +
    `echarse atrás. En cuanto te confirme, **mandas tú la oferta** en el juego y él la acepta. ` +
    `Cualquier lío, se lo cuentas a él directamente.`
  );
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
