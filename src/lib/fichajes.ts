import type { Player } from "./normalize";
import type { FfPlayer } from "./odds";
import { DIFFICULTY_LEVEL, type Fixture } from "./equipos";

/**
 * Qué operaciones dan dinero.
 *
 * ── Las reglas del juego, que son las que mandan aquí ─────────────────────
 *
 * 1. Cada jugador fichado lleva una **cláusula** por encima de su valor.
 *    Pagándola te lo llevas, pero sólo cuando está abierta: al fichar entra
 *    **blindado 14 días** y en ese plazo nadie puede quitártelo.
 *
 * 2. El **valor** se recalcula a diario según la demanda, que sigue al
 *    rendimiento. Subir 500 k€ al día ya es un buen ritmo; 1 M€ al día es
 *    mucho.
 *
 * 3. A la liga **siempre le puedes vender**: cada día hace una oferta que
 *    ronda el valor con un margen de ±10%. Eso da un suelo: aunque nadie lo
 *    quiera, colocarlo por el 90% de su valor está garantizado.
 *
 * 4. Blindar cuesta: por cada euro invertido, la cláusula sube el doble.
 *
 * De ahí sale el planteamiento: **un clausulazo es una inversión**. Pagas la
 * cláusula, el jugador sigue subiendo mientras está blindado y lo vendes antes
 * de que nadie pueda quitártelo. Lo que se calcula es el dinero que queda al
 * final de esos catorce días, no un porcentaje abstracto.
 *
 * Por eso una prima de 5 M€ no es buena ni mala por sí sola: sobre un jugador
 * de 50 M€ que sube 400 k€ al día se recupera en menos de dos semanas, y sobre
 * uno de 1 M€ no se recupera nunca. El tamaño entra solo, a través del dinero.
 */

/** Días de blindaje tras fichar: la ventana para recuperar y revender. */
export const PROTECTION_DAYS = 14;

/**
 * Margen de la oferta diaria de la liga sobre el valor. Se usa el lado malo
 * (−10%) para el escenario conservador: es lo que se cobra seguro.
 */
export const MARKET_SPREAD = 0.1;

/** Cuánto sube la cláusula por cada euro invertido en blindar. */
export const SHIELD_MULTIPLIER = 2;

/** También entran los que se abren en las próximas horas, con su día y hora. */
export const UPCOMING_HOURS = 48;

/** Ritmo diario que ya merece la pena. El doble es un ritmo excelente. */
const GOOD_RISE = 500_000;

/** Rentabilidad a catorce días que se considera sobresaliente. */
const GREAT_ROI = 0.2;

/**
 * Prima a partir de la cual la cláusula deja de ser un chollo. Un 40% por
 * encima del valor es el techo: a partir de ahí la puntuación por precio se
 * agota, aunque el jugador siga subiendo.
 */
const CHEAP_PREMIUM = 0.4;

/** Beneficio absoluto que ya mueve la clasificación. */
const BIG_PROFIT = 8_000_000;

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));

export type Candidate = {
  player: Player;
  odds: FfPlayer | null;
  fixtures: Fixture[] | null;
  owner: { name: string; teamId: string };

  value: number;
  clause: number;
  /** Lo que pagas de más sobre su valor. */
  premium: number;
  premiumPct: number;
  ratio: number;

  /** Subida bruta estimada por día, tal cual la dicen los datos. */
  dailyRise: number;
  /** La misma subida tras descontar el riesgo de que no continúe. */
  adjustedRise: number;
  /** Confianza en que ese ritmo se mantenga, de 0 a 1. */
  momentum: number;

  /** Valor previsto al acabar el blindaje. */
  valueAtEnd: number;
  /** Dinero que queda vendiendo a valor al final del blindaje. */
  profit: number;
  /** Lo mismo, cobrando la oferta mala de la liga. */
  profitSafe: number;
  /** Lo que perderías revendiéndolo hoy mismo al suelo del mercado. */
  floorToday: number;
  /** Beneficio sobre lo invertido. */
  roi: number;
  /** Días en cubrir la prima al ritmo ajustado; null si no sube. */
  daysToBreakEven: number | null;

  /** Horas hasta que se abre la cláusula; 0 si ya está abierta. */
  opensInHours: number;
  opensAt: string | null;
  isOpen: boolean;
  /** Se abre dentro de la ventana que se enseña en clausulazos. */
  opensSoon: boolean;

  affordable: boolean;

  score: number;
  reasons: string[];
};

/* ------------------------------------------------------------ estimación */

/**
 * Ritmo de subida diario y cuánto fiarse de él.
 *
 * Un solo día dice poco: hay saltos grandes justo después de jugar y días
 * planos entre jornadas. Se compara el último día con la media de la semana
 * —que es el hueco entre jornadas— y se mira si cuentan lo mismo. Cuando hoy
 * dispara muy por encima de la semana, lo más probable es que sea un pico y no
 * un ritmo sostenido.
 */
export function riseOf(odds: FfPlayer | null): { rise: number; consistency: number } {
  if (!odds) return { rise: 0, consistency: 0 };

  const byDay = new Map(odds.history.map((h) => [h.daysAgo, h.value]));
  const week = byDay.get(7);
  const three = byDay.get(3);

  const day = odds.diff ?? null;
  const mid =
    week !== undefined
      ? (odds.value - week) / 7
      : three !== undefined
        ? (odds.value - three) / 3
        : null;

  if (day === null && mid === null) return { rise: 0, consistency: 0 };
  if (mid === null) return { rise: day!, consistency: 0.35 };
  if (day === null) return { rise: mid, consistency: 0.6 };

  // Pesa más la media que el día suelto, y se mide cuánto se parecen.
  const rise = 0.4 * day + 0.6 * mid;
  const spread = Math.abs(day - mid) / Math.max(Math.abs(mid), 50_000);
  return { rise, consistency: clamp(1 - spread / 2) };
}

/**
 * Probabilidad de que la subida siga.
 *
 * El valor sube porque la gente lo quiere, y la gente lo quiere cuando puntúa.
 * Así que lo que predice el ritmo de mañana es que vaya a jugar, que tenga
 * calendario asequible y que lo de ahora no sea un pico aislado.
 */
function momentumOf(
  player: Player,
  odds: FfPlayer | null,
  fixtures: Fixture[] | null,
  consistency: number,
): number {
  const plays = odds?.probability != null ? odds.probability / 100 : 0.45;

  const average =
    player.averagePoints > 0 ? player.averagePoints : (player.lastSeasonPoints ?? 0) / 38;
  const scoring = clamp(average / 6);

  // Días seguidos subiendo, tal como los cuenta futbolfantasy (tope de 3).
  const streak = clamp((odds?.streak ?? 0) / 3);

  const next = (fixtures ?? []).filter((f) => /liga/i.test(f.competition)).slice(0, 3);
  const levels = next
    .map((f) => f.difficulty)
    .filter((d): d is NonNullable<Fixture["difficulty"]> => d !== null)
    .map((d) => DIFFICULTY_LEVEL[d]);
  const calendar =
    levels.length > 0 ? clamp((5 - levels.reduce((a, b) => a + b, 0) / levels.length) / 4) : 0.5;

  return clamp(
    0.34 * plays + 0.24 * scoring + 0.18 * streak + 0.14 * calendar + 0.1 * consistency,
  );
}

/* ----------------------------------------------------------- construcción */

export type Budget = { money: number };

export function buildCandidate(
  player: Player,
  owner: { name: string; teamId: string },
  odds: FfPlayer | null,
  fixtures: Fixture[] | null,
  budget: Budget,
  now = Date.now(),
): Omit<Candidate, "score" | "reasons"> | null {
  const clause = player.buyoutClause ?? 0;
  const value = player.marketValue;
  if (!clause || !value) return null;

  const unlockAt = player.buyoutUnlockAt ? new Date(player.buyoutUnlockAt).getTime() : 0;
  const opensInHours = unlockAt > now ? (unlockAt - now) / 3_600_000 : 0;

  const { rise, consistency } = riseOf(odds);
  const momentum = momentumOf(player, odds, fixtures, consistency);

  // Se descuenta parte de la subida: dar por hecho que el ritmo se mantiene
  // entero es lo que hace que un pico de un día parezca una mina de oro.
  const adjustedRise = rise > 0 ? rise * (0.45 + 0.55 * momentum) : rise;

  const valueAtEnd = value + adjustedRise * PROTECTION_DAYS;
  const premium = clause - value;

  return {
    player,
    odds,
    fixtures,
    owner,
    value,
    clause,
    premium,
    premiumPct: premium / value,
    ratio: clause / value,

    dailyRise: rise,
    adjustedRise,
    momentum,

    valueAtEnd,
    profit: valueAtEnd - clause,
    profitSafe: valueAtEnd * (1 - MARKET_SPREAD) - clause,
    floorToday: value * (1 - MARKET_SPREAD) - clause,
    roi: (valueAtEnd - clause) / clause,
    daysToBreakEven: adjustedRise > 0 ? premium / adjustedRise : premium <= 0 ? 0 : null,

    opensInHours,
    opensAt: player.buyoutUnlockAt ?? null,
    isOpen: opensInHours === 0,
    opensSoon: opensInHours > 0 && opensInHours <= UPCOMING_HOURS,

    affordable: budget.money >= clause,
  };
}

/** Lo que costaría blindarlo: la cláusula sube al doble de lo invertido. */
export function shieldCost(extraClause: number): number {
  return extraClause / SHIELD_MULTIPLIER;
}

/* ------------------------------------------------------------ clausulazos */

/**
 * Todas las notas salen de la misma pregunta: **¿va a jugar?**
 *
 * Es el filtro que manda en las tres listas, porque un jugador que no sale no
 * sube de valor ni puntúa, y entonces da igual lo barata que tenga la cláusula.
 * Por eso la probabilidad no entra como un sumando más sino como un
 * multiplicador: un 0% deja la nota casi a cero por bueno que sea todo lo
 * demás, y por debajo del 50% la recorta a menos de la mitad.
 */
function playFactor(c: Omit<Candidate, "score" | "reasons">): number {
  const p = c.odds?.probability;

  if (c.player.status === "injured" || c.player.status === "suspended") return 0.12;
  // Sin dato no es lo mismo que un cero: se penaliza, pero sin hundirlo.
  if (p == null) return 0.55;
  if (p === 0) return 0.05;

  const plays = p / 100;
  if (plays < 0.5) return 0.2 + plays * 0.5;

  // De 50 a 100 va de 0,55 a 1, con la curva cargada hacia arriba: entre un
  // 90% y un 70% hay más distancia real de la que sugieren los números.
  return 0.55 + 0.45 * Math.pow((plays - 0.5) / 0.5, 0.85);
}

/**
 * Lo que viene haciendo últimamente.
 *
 * La API no publica los puntos jornada a jornada en el listado de plantillas
 * —eso sólo viene en la ficha de cada jugador—, así que lo más cercano que hay
 * de toda la liga a la vez es su media. Con la temporada empezada es una buena
 * señal de forma; en las primeras jornadas se apoya en lo del año pasado.
 */
function formOf(c: Omit<Candidate, "score" | "reasons">): number {
  const average =
    c.player.averagePoints > 0 ? c.player.averagePoints : (c.player.lastSeasonPoints ?? 0) / 38;
  return clamp(average / 7);
}

/** Dificultad media de los tres próximos partidos de liga, de 0 a 1. */
function calendarOf(c: Omit<Candidate, "score" | "reasons">): number {
  const next = (c.fixtures ?? []).filter((f) => /liga/i.test(f.competition)).slice(0, 3);
  const levels = next
    .map((f) => f.difficulty)
    .filter((d): d is NonNullable<Fixture["difficulty"]> => d !== null)
    .map((d) => DIFFICULTY_LEVEL[d]);
  if (levels.length === 0) return 0.5;
  return clamp((5 - levels.reduce((a, b) => a + b, 0) / levels.length) / 4);
}

/**
 * Lo cara que es la cláusula **en proporción a lo que vale el jugador**.
 *
 * Pagar 4 M€ por uno de 2 M€ es normal; pagar 40 M€ por uno de 20 M€ es lo
 * mismo en proporción, pero deja el saldo temblando. De ahí que se mida el
 * múltiplo y no la cifra: 1,0 es la cláusula clavada en su valor y a partir de
 * ×2,5 ya da igual, es cara.
 */
function priceFactor(c: Omit<Candidate, "score" | "reasons">): number {
  return clamp(1 - (c.ratio - 1) / 1.5);
}

/** Lo que queda para que se abra: 1 si ya está abierta, 0 si faltan cinco días. */
function urgencyOf(c: Omit<Candidate, "score" | "reasons">): number {
  if (c.isOpen) return 1;
  return clamp(1 - c.opensInHours / (5 * 24));
}

/** La nota tal como se enseña: de 0 a 10 con un decimal. */
export function outOfTen(score: number): number {
  return Math.round(clamp(score / 100) * 100) / 10;
}

/**
 * Puntúa la operación por el dinero que deja.
 *
 * Todo se mide contra la venta al final del blindaje: pagas la cláusula, el
 * jugador sube mientras nadie puede tocarlo y lo colocas. Lo que decide es el
 * ritmo al que sube y lo poco que pagas de más; el resto acompaña.
 */
export function scoreClause(c: Omit<Candidate, "score" | "reasons">): {
  score: number;
  reasons: string[];
} {
  const reasons: string[] = [];

  // El ritmo, ya descontado el riesgo de que no continúe: de ahí sale el
  // beneficio entero de la operación.
  const rise = clamp(c.adjustedRise / GOOD_RISE);

  // Lo poco que pagas de más. Un 40% por encima agota la escala.
  const cheap = clamp(1 - c.premiumPct / CHEAP_PREMIUM);

  // Rentabilidad y volumen del beneficio a catorce días.
  const roi = clamp(c.roi / GREAT_ROI);
  const profit = clamp(c.profit / BIG_PROFIT);

  // Que aguante incluso cobrando la oferta mala de la liga.
  const safety = c.profitSafe > 0 ? 1 : c.floorToday > 0 ? 0.5 : 0;

  const base = 100 * (0.32 * rise + 0.24 * cheap + 0.2 * roi + 0.14 * profit + 0.1 * safety);

  // Que juegue multiplica: si no sale, ni sube ni se revende.
  let score = base * playFactor(c);

  if (c.profit <= 0) score *= 0.45;
  if (!c.affordable) score *= 0.6;
  if (c.opensSoon) score *= 0.9;

  /* --------------------------------------------------------- explicación */

  if (c.premium <= 0) {
    reasons.push("Su cláusula está en su valor o por debajo: chollo");
  } else if (c.premiumPct <= CHEAP_PREMIUM) {
    reasons.push(`Sólo pagas un ${Math.round(c.premiumPct * 100)}% de más`);
  } else if (c.ratio >= 2) {
    reasons.push(`Cláusula de ×${c.ratio.toFixed(1)} su valor: cara`);
  }

  if (c.dailyRise >= GOOD_RISE * 2) reasons.push("Sube más de 1 M€ al día");
  else if (c.dailyRise >= GOOD_RISE) reasons.push(`Sube ${fmt(c.dailyRise)} al día`);
  else if (c.dailyRise <= 0) reasons.push("No está subiendo");

  reasons.push(
    c.profit > 0
      ? `Ganarías ${fmt(c.profit)} en ${PROTECTION_DAYS} días (${Math.round(c.roi * 100)}%)`
      : `Al ritmo de ahora perderías ${fmt(-c.profit)}`,
  );

  if (c.premium > 0 && c.daysToBreakEven !== null && c.daysToBreakEven <= PROTECTION_DAYS) {
    reasons.push(
      c.daysToBreakEven < 1
        ? "Recupera la prima en menos de un día"
        : `Recupera la prima en ${Math.ceil(c.daysToBreakEven)} días`,
    );
  }

  const p = c.odds?.probability;
  if (p === 0) reasons.push("No va a jugar");
  else if (p != null && p < 50) reasons.push(`Sólo ${p}% de jugar: la subida no se sostiene`);
  if (!c.affordable) reasons.push("No te llega el saldo");

  return { score, reasons };
}

/* ------------------------------------------------ clausulazos para el once */

/**
 * Puntúa la operación por lo que suma al equipo, no por lo que deja de dinero.
 *
 * Aquí el jugador es para quedárselo, así que manda **jugar**. Después viene la
 * forma —lo que está puntuando—, lo barato que resulta cada punto y el
 * calendario que le espera. El precio de la cláusula cuenta poco: si es un fijo
 * que puntúa, pagar el doble de su valor sigue siendo buen negocio deportivo.
 */
export function scoreSquad(c: Omit<Candidate, "score" | "reasons">): {
  score: number;
  reasons: string[];
} {
  const reasons: string[] = [];

  const form = formOf(c);
  const calendar = calendarOf(c);

  // Puntos por millón: lo que mide si es barato para lo que da.
  const average =
    c.player.averagePoints > 0 ? c.player.averagePoints : (c.player.lastSeasonPoints ?? 0) / 38;
  const perMillion = c.value > 0 ? average / (c.value / 1_000_000) : 0;
  const value4money = clamp(perMillion / 0.8);

  const base = 100 * (0.3 * form + 0.26 * value4money + 0.24 * calendar + 0.2 * priceFactor(c));

  // La titularidad, otra vez como multiplicador y no como sumando: aquí es
  // todavía más determinante que en la reventa.
  let score = base * playFactor(c);

  if (!c.affordable) score *= 0.55;
  if (c.player.status === "doubtful") score *= 0.8;
  if (c.opensSoon) score *= 0.92;

  /* --------------------------------------------------------- explicación */

  const p = c.odds?.probability;
  if (p != null) {
    if (p >= 85) reasons.push(`Titular fijo: ${p}% de jugar`);
    else if (p >= 65) reasons.push(`Juega casi siempre: ${p}%`);
    else if (p > 0) reasons.push(`Sólo ${p}% de salir de titular`);
    else reasons.push("No va a jugar");
  } else {
    reasons.push("Sin dato de alineación");
  }

  if (average >= 6) reasons.push(`Viene puntuando ${average.toFixed(1)} de media`);
  if (c.value <= 8_000_000 && (p ?? 0) >= 70) {
    reasons.push("Barato y titular: deja hueco en el presupuesto");
  }
  if (perMillion >= 0.8) reasons.push(`Da ${perMillion.toFixed(1)} pts por millón`);
  if (calendar >= 0.6) reasons.push("Calendario cómodo las próximas tres jornadas");
  else if (calendar <= 0.3) reasons.push("Calendario duro por delante");
  if (c.ratio > 2) reasons.push(`Su cláusula es ×${c.ratio.toFixed(1)} su valor`);
  if (c.player.status === "injured") reasons.push("Lesionado");
  if (c.player.status === "suspended") reasons.push("Sancionado");
  if (!c.affordable) reasons.push("No te llega el saldo");

  return { score, reasons };
}

/* -------------------------------------------------------------- fichajes */

/** Por encima de esto, pagar la cláusula sale caro: mejor negociar. */
export const TOO_EXPENSIVE = 1.6;

/**
 * ¿Hay que ir por las buenas? O está blindado más allá de la ventana que se
 * enseña en clausulazos, o su cláusula es tan cara que pagarla es tirar dinero.
 */
export function needsDeal(c: Omit<Candidate, "score" | "reasons">): boolean {
  return (!c.isOpen && !c.opensSoon) || c.ratio > TOO_EXPENSIVE;
}

/**
 * Puntúa a quién conviene pedirle a su dueño.
 *
 * Aquí no se paga cláusula, así que cuenta a quién merece la pena llamar: uno
 * que juega, que rinde y cuya cláusula está a punto de abrirse —porque su dueño
 * tiene que decidir o exponerlo— vale la conversación.
 */
export function scoreTarget(c: Omit<Candidate, "score" | "reasons">): {
  score: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  const days = c.opensInHours / 24;

  const form = formOf(c);
  const calendar = calendarOf(c);
  const rise = clamp(c.adjustedRise / GOOD_RISE);
  const urgency = urgencyOf(c);

  const average =
    c.player.averagePoints > 0 ? c.player.averagePoints : (c.player.lastSeasonPoints ?? 0) / 38;
  const perMillion = c.value > 0 ? average / (c.value / 1_000_000) : 0;
  const bargain = clamp(perMillion / 0.8);

  const base =
    100 * (0.26 * form + 0.22 * urgency + 0.2 * priceFactor(c) + 0.18 * rise + 0.14 * bargain);

  let score = base * playFactor(c);
  if (calendar <= 0.3) score *= 0.92;

  /* --------------------------------------------------------- explicación */

  if (c.isOpen) {
    reasons.push(`Abierta pero a ×${c.ratio.toFixed(1)} su valor: sale mejor negociar`);
  } else if (days <= 2) {
    reasons.push(
      days <= 1 ? "Se libera en menos de un día" : `Se libera en ${Math.ceil(days)} días`,
    );
  }

  const p = c.odds?.probability;
  if (p != null && p >= 80) reasons.push(`Titular fijo: ${p}%`);
  else if (p != null && p < 50) reasons.push(`Sólo ${p}% de jugar`);

  if (c.dailyRise >= GOOD_RISE) reasons.push(`Sube ${fmt(c.dailyRise)} al día`);
  if (c.ratio <= 1.4) reasons.push("Cláusula baja: a su dueño le renta venderlo");
  if (bargain > 0.6 && c.value < 15_000_000) reasons.push("Barato para lo que puntúa");
  if (calendar >= 0.6) reasons.push("Calendario cómodo por delante");

  return { score, reasons };
}

/** Formato corto de euros para los textos de los motivos. */
function fmt(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) {
    return `${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2).replace(".", ",")} M€`;
  }
  return `${Math.round(abs / 1000)} k€`;
}
