import type { Player, Position } from "./normalize";
import type { FfPlayer } from "./odds";
import { DIFFICULTY_LEVEL, type Fixture } from "./equipos";

/**
 * El once que más puntos debería hacer con la plantilla que tengo.
 *
 * ── Cómo puntúa cada puesto ───────────────────────────────────────────────
 *
 * Lo primero de todo es **jugar**: quien no sale no puntúa, y en defensa eso
 * pesa el doble, porque sus puntos vienen de despejes y de la portería a cero,
 * y la portería a cero exige estar sesenta minutos en el campo.
 *
 * A partir de ahí cada línea gana los puntos por sitios distintos:
 *
 *  · **Portero**: portería a cero y paradas. Casi todo depende del rival.
 *  · **Defensa**: portería a cero y despejes; algún gol suelto que vale mucho.
 *  · **Centrocampista**: la mezcla. Portería a cero (menos), regates, tiros,
 *    asistencias y goles.
 *  · **Delantero**: tiros a puerta, goles y asistencias. La portería a cero no
 *    le da nada.
 *
 * De ahí sale la estimación: probabilidad de jugar × (lo que da su puesto por
 * defecto + lo que aporta él por encima de la media + lo que le regala el
 * rival de la jornada).
 *
 * Los pesos son ajustables a propósito: con la liga sin empezar hay que tirar
 * de la temporada pasada y de la jerarquía, y se irán afinando según cuadre o
 * no con lo que pase de verdad.
 */

/* --------------------------------------------------------------- pesos */

/**
 * Puntos que se lleva de salida un titular de cada puesto sin hacer nada
 * especial: salir de inicio y completar el partido.
 */
const BASE: Record<Position, number> = { PT: 2.2, DF: 2.0, MC: 2.0, DL: 1.8, EN: 0, "?": 0 };

/** Lo que vale una portería a cero en cada puesto. */
const CLEAN_SHEET: Record<Position, number> = { PT: 4, DF: 4, MC: 1, DL: 0, EN: 0, "?": 0 };

/**
 * Cuánto multiplica el rendimiento propio (goles, asistencias, regates,
 * paradas…) según el puesto. El delantero vive de eso; el portero, no.
 */
const UPSIDE: Record<Position, number> = { PT: 0.6, DF: 0.9, MC: 1.25, DL: 1.5, EN: 0, "?": 0 };

/**
 * Probabilidad de portería a cero según lo duro que sea el rival, de 1 (muy
 * asequible) a 5 (muy difícil).
 */
const CLEAN_SHEET_ODDS: Record<number, number> = { 1: 0.45, 2: 0.36, 3: 0.27, 4: 0.19, 5: 0.12 };

/** Goles que se espera encajar según el rival, en la misma escala. */
const CONCEDED: Record<number, number> = { 1: 0.9, 2: 1.1, 3: 1.35, 4: 1.6, 5: 1.9 };

/**
 * Lo que resta cada gol encajado. Portero y defensa cobran casi todos sus
 * puntos de no encajar, así que también son los que pagan cuando encajan.
 */
const CONCEDED_COST: Record<Position, number> = {
  PT: -0.9,
  DF: -0.55,
  MC: 0,
  DL: 0,
  EN: 0,
  "?": 0,
};

/**
 * Cuánto castiga la incertidumbre en cada puesto.
 *
 * Un delantero que sale puede marcar en cualquier momento; un defensa depende
 * de una portería a cero que ni controla ni se reparte. Por eso, a igualdad de
 * probabilidad, el defensa vale menos: se eleva su probabilidad a un exponente
 * mayor que uno, que hunde a los que no son titulares claros. Es lo que evita
 * meter un cuarto defensa flojo pudiendo poner otro medio.
 */
const RISK_EXPONENT: Record<Position, number> = {
  PT: 1.35,
  DF: 1.5,
  MC: 1.1,
  DL: 1.0,
  EN: 1,
  "?": 1,
};

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));

export type Rated = {
  player: Player;
  odds: FfPlayer | null;
  fixtures: Fixture[] | null;
  /** Puntos esperados en la próxima jornada. */
  xp: number;
  /** Imposible que juegue: se ha ido del club, está lesionado o sancionado. */
  unavailable: boolean;
  /** Probabilidad de ser titular, de 0 a 1. */
  plays: number;
  /** Probabilidad de portería a cero de su equipo. */
  cleanSheet: number;
  /** Por qué puntúa lo que puntúa. */
  note: string;
};

/* ---------------------------------------------------------- estimación */

/**
 * Lo que aporta el jugador por encima de un titular cualquiera.
 *
 * Con la liga empezada manda su media. Mientras no lo esté, se reparte lo del
 * año pasado entre las 38 jornadas y se completa con la jerarquía que publica
 * futbolfantasy, que mide cuánto pesa dentro de su equipo.
 */
function upside(player: Player, odds: FfPlayer | null): number {
  const average =
    player.averagePoints > 0 ? player.averagePoints : (player.lastSeasonPoints ?? 0) / 38;

  // Por encima de los dos puntos de salir y ya está.
  const overBaseline = Math.max(0, average - 2);

  // La jerarquía va de 0 a 100 y dice si es de los que tiran las faltas y los
  // penaltis o si es el duodécimo. Sirve de apoyo cuando no hay media todavía.
  const rank = (odds?.stats.hierarchy ?? 0) / 100;

  return average > 0 ? overBaseline * 0.75 + rank * 1.2 : rank * 2.2;
}

/** Goles que se espera encajar, según el rival de la próxima jornada. */
function concededGoals(fixtures: Fixture[] | null): number {
  const next = (fixtures ?? []).find((f) => /liga/i.test(f.competition));
  if (!next?.difficulty) return 1.35;
  const base = CONCEDED[DIFFICULTY_LEVEL[next.difficulty]] ?? 1.35;
  return base * (next.atHome ? 0.92 : 1.08);
}

/** Probabilidad de portería a cero, según el rival de la próxima jornada. */
function cleanSheetOdds(fixtures: Fixture[] | null): number {
  const next = (fixtures ?? []).find((f) => /liga/i.test(f.competition));
  if (!next?.difficulty) return 0.27;

  const odds = CLEAN_SHEET_ODDS[DIFFICULTY_LEVEL[next.difficulty]] ?? 0.27;
  // Jugar en casa ayuda algo a no encajar.
  return clamp(odds * (next.atHome ? 1.12 : 0.92), 0.05, 0.6);
}

/**
 * Puntos esperados de un jugador en la próxima jornada.
 *
 * Todo va multiplicado por la probabilidad de salir de inicio: un central
 * buenísimo que se sienta en el banquillo vale cero, y ese es justo el error
 * que se quiere evitar al montar el once.
 */
export function rate(
  player: Player,
  odds: FfPlayer | null,
  fixtures: Fixture[] | null,
): Rated {
  const pos = player.position;

  /**
   * Quien no aparece en futbolfantasy es que ya no está en la liga.
   *
   * Su ficha de mercado cubre a los 614 jugadores de LaLiga, así que no salir
   * ahí no es un fallo del cruce: es que su club lo ha vendido. El juego lo
   * sigue teniendo en tu plantilla, pero no va a jugar un solo minuto.
   */
  const gone = odds === null;

  // Sin ficha pero con dato de club: no cuenta para su entrenador.
  const raw = odds?.probability != null ? odds.probability / 100 : 0.18;

  // El porcentaje solo no distingue a un 50% al que futbolfantasy dibuja en el
  // once de otro al que deja fuera. Estar en el once probable lo desempata.
  const plays = clamp(raw * (odds?.projectedStarter ? 1.15 : 0.85), 0, 0.97);

  const cs = cleanSheetOdds(fixtures);
  const conceded = concededGoals(fixtures);

  /**
   * Cero absoluto: vendido, lesionado, sancionado o con un 0% publicado. No es
   * que puntúe poco, es que no puede jugar, y por eso nunca entra en el once.
   */
  const unavailable =
    gone ||
    player.status === "injured" ||
    player.status === "suspended" ||
    odds?.probability === 0;

  const available = unavailable ? 0 : 1;
  const doubt = player.status === "doubtful" ? 0.6 : 1;

  const perMatch =
    BASE[pos] +
    CLEAN_SHEET[pos] * cs +
    CONCEDED_COST[pos] * conceded +
    UPSIDE[pos] * upside(player, odds);

  // La probabilidad entra elevada al exponente de riesgo del puesto: castiga
  // más a quien, además de tener que salir, depende de que no le marquen.
  const xp = Math.max(0, perMatch) * Math.pow(plays, RISK_EXPONENT[pos]) * available * doubt;

  // Si no puede jugar, un único motivo y punto: encadenar frases como "en el
  // once probable · lesionado" sólo confunde, y decir "sancionado" de alguien
  // a quien han vendido es directamente falso.
  if (unavailable) {
    const why = gone
      ? "ya no está en la liga: su club lo ha vendido"
      : player.status === "injured"
        ? "lesionado"
        : player.status === "suspended"
          ? "sancionado"
          : "0% de probabilidad de jugar";
    return { player, odds, fixtures, xp: 0, unavailable, plays: 0, cleanSheet: cs, note: why };
  }

  const parts: string[] = [];
  if (odds?.probability == null) parts.push("sin datos de alineación");
  if (odds?.projectedStarter) parts.push("en el once probable");
  if (plays >= 0.8) parts.push("titular claro");
  else if (plays <= 0.4) parts.push("difícil que salga");
  if (pos === "DF" && plays < 0.7) parts.push("defensa sin puesto fijo: mucho riesgo");
  if (CLEAN_SHEET[pos] >= 4 && cs >= 0.35) parts.push("buen cartel para portería a cero");
  if (CLEAN_SHEET[pos] >= 4 && cs <= 0.2) parts.push("rival duro para dejar la portería a cero");
  if (player.status === "doubtful") parts.push("duda");

  return { player, odds, fixtures, xp, unavailable, plays, cleanSheet: cs, note: parts.join(" · ") };
}

/* ---------------------------------------------------------- formaciones */

/** Las que permite el juego, en defensas-medios-delanteros. */
export const FORMATIONS: [number, number, number][] = [
  [5, 4, 1],
  [5, 3, 2],
  [4, 5, 1],
  [4, 4, 2],
  [4, 3, 3],
  [3, 5, 2],
  [3, 4, 3],
];

export type IdealXI = {
  formation: string;
  players: Rated[];
  /** Puntos esperados del once entero. */
  xp: number;
  /** Cada formación con su total, para poder enseñar las alternativas. */
  options: { formation: string; xp: number; possible: boolean }[];
};

/**
 * El mejor once posible.
 *
 * Dentro de una formación la elección es sencilla: como cada puesto se cubre
 * por separado, basta ordenar por puntos esperados y coger los mejores de cada
 * línea. Lo que hay que probar son las siete formaciones, porque tener cuatro
 * defensas buenísimos o tres delanteros en racha cambia cuál conviene.
 */
export function bestEleven(squad: Rated[]): IdealXI | null {
  // Los que no pueden jugar quedan fuera del reparto: da igual lo bueno que
  // sea uno si está vendido, lesionado o sancionado.
  const byPos = (pos: Position) =>
    squad
      .filter((r) => r.player.position === pos && !r.unavailable)
      .sort((a, b) => b.xp - a.xp);

  const keepers = byPos("PT");
  const defenders = byPos("DF");
  const midfielders = byPos("MC");
  const forwards = byPos("DL");

  if (keepers.length === 0) return null;

  const options: IdealXI["options"] = [];
  let best: IdealXI | null = null;

  for (const [d, m, f] of FORMATIONS) {
    const name = `${d}-${m}-${f}`;
    const possible = defenders.length >= d && midfielders.length >= m && forwards.length >= f;
    if (!possible) {
      options.push({ formation: name, xp: 0, possible: false });
      continue;
    }

    const players = [
      keepers[0],
      ...defenders.slice(0, d),
      ...midfielders.slice(0, m),
      ...forwards.slice(0, f),
    ];
    const xp = players.reduce((sum, r) => sum + r.xp, 0);
    options.push({ formation: name, xp, possible: true });

    if (!best || xp > best.xp) best = { formation: name, players, xp, options: [] };
  }

  if (!best) return null;
  return { ...best, options: options.sort((a, b) => b.xp - a.xp) };
}
