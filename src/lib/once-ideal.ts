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

export const LINE_POSITIONS: Position[] = ["DF", "MC", "DL"];

/** Cómo se llama cada puesto cuando hay que decir qué falta fichar. */
const NOUN: Record<Position, { one: string; many: string }> = {
  PT: { one: "un portero", many: "porteros" },
  DF: { one: "un defensa", many: "defensas" },
  MC: { one: "un centrocampista", many: "centrocampistas" },
  DL: { one: "un delantero", many: "delanteros" },
  EN: { one: "un entrenador", many: "entrenadores" },
  "?": { one: "un jugador", many: "jugadores" },
};

/**
 * Por debajo de esta probabilidad el jugador no sostiene un puesto del once:
 * puede salir, pero contar con él es jugar a los dados.
 */
const WEAK_PLAYS = 0.5;

/**
 * Un puesto del once que no está bien cubierto: o no hay nadie que pueda
 * jugarlo, o quien lo ocupa no es de fiar. Es lo que hay que ir a buscar al
 * mercado.
 */
export type Gap = {
  position: Position;
  /**
   * `hueco`: no queda nadie disponible y la casilla la tapa alguien que no va
   * a jugar. `flojo`: hay quien la ocupe, pero con poca probabilidad de salir.
   */
  kind: "hueco" | "flojo";
  count: number;
  /** "Necesitas fichar un defensa". */
  title: string;
  detail: string;
};

export type FormationOption = {
  formation: string;
  xp: number;
  /** Se puede montar entera con jugadores que sí pueden jugar. */
  complete: boolean;
  /**
   * Casillas que no cubre nadie que vaya a jugar: las tapa un lesionado o se
   * quedan directamente vacías porque no tienes a nadie más de ese puesto.
   */
  missing: number;
};

export type IdealXI = {
  formation: string;
  players: Rated[];
  /** Puntos esperados del once entero. */
  xp: number;
  /** Los que están en el once sólo porque no hay nadie más para ese puesto. */
  forced: Rated[];
  /** Casillas que no cubre nadie que vaya a jugar, incluidas las vacías. */
  missing: number;
  /** Los que sí pueden jugar pero son poco fiables (menos del 50%). */
  weak: Rated[];
  /** Qué hay que reforzar, línea por línea. */
  gaps: Gap[];
  /** Cada formación con su total, para poder enseñar las alternativas. */
  options: FormationOption[];
};

/** "un defensa" / "3 defensas", para el aviso de fichar. */
function count(position: Position, n: number): string {
  return n === 1 ? NOUN[position].one : `${n} ${NOUN[position].many}`;
}

/**
 * El mejor once posible.
 *
 * Dentro de una formación la elección es sencilla: como cada puesto se cubre
 * por separado, basta ordenar por puntos esperados y coger los mejores de cada
 * línea. Lo que hay que probar son las siete formaciones, porque tener cuatro
 * defensas buenísimos o tres delanteros en racha cambia cuál conviene.
 *
 * Los lesionados, sancionados y vendidos no compiten por un puesto, pero sí
 * tapan el agujero si no queda nadie más: un hueco vacío puntúa cero seguro, y
 * el juego tampoco deja alinear a diez. Cuando pasa, se marca como `forced` y
 * sale el aviso de que hace falta fichar.
 *
 * Con `want` se fuerza una formación concreta, para poder mirar qué daría otra
 * sin perder cuál es la mejor.
 */
export function bestEleven(squad: Rated[], want?: string | null): IdealXI | null {
  if (squad.length === 0) return null;

  /**
   * Primero los que pueden jugar, de más a menos puntos; detrás, los que no.
   * Entre los que no pueden jugar manda lo que rinden de normal: si hay que
   * quemar una casilla, mejor quemarla con el que al menos tiene opción de que
   * le levanten la sanción o llegue justo.
   */
  const pool = (pos: Position) => {
    const line = squad.filter((r) => r.player.position === pos);
    const ready = line.filter((r) => !r.unavailable).sort((a, b) => b.xp - a.xp);
    const out = line
      .filter((r) => r.unavailable)
      .sort(
        (a, b) =>
          b.player.averagePoints - a.player.averagePoints ||
          b.player.marketValue - a.player.marketValue,
      );
    return { ready, all: [...ready, ...out] };
  };

  const at: Record<string, ReturnType<typeof pool>> = {
    PT: pool("PT"),
    DF: pool("DF"),
    MC: pool("MC"),
    DL: pool("DL"),
  };

  const build = (shape: [number, number, number]) => {
    const need: [Position, number][] = [
      ["PT", 1],
      ["DF", shape[0]],
      ["MC", shape[1]],
      ["DL", shape[2]],
    ];

    const players: Rated[] = [];
    /** Casillas por línea que no cubre nadie que vaya a jugar. */
    const holes = new Map<Position, number>();

    for (const [pos, n] of need) {
      players.push(...at[pos].all.slice(0, n));
      holes.set(pos, Math.max(0, n - at[pos].ready.length));
    }

    const missing = [...holes.values()].reduce((s, n) => s + n, 0);

    return {
      formation: shape.join("-"),
      players,
      xp: players.reduce((sum, r) => sum + r.xp, 0),
      forced: players.filter((r) => r.unavailable),
      holes,
      missing,
      complete: missing === 0,
    };
  };

  const built = FORMATIONS.map(build);

  const options: FormationOption[] = built.map((b) => ({
    formation: b.formation,
    xp: b.xp,
    complete: b.complete,
    missing: b.missing,
  }));

  // La mejor es la que más puntos da; a igualdad, la que menos casillas deja
  // sin cubrir con alguien que vaya a jugar.
  const best = [...built].sort((a, b) => b.xp - a.xp || a.missing - b.missing)[0];

  const chosen = (want && built.find((b) => b.formation === want)) || best;

  const weak = chosen.players.filter((r) => !r.unavailable && r.plays < WEAK_PLAYS);

  /**
   * Los avisos van por línea y no por jugador: lo que hay que hacer no es
   * "sustituir a Rosier", es ir al mercado a por un lateral.
   */
  const gaps: Gap[] = [];
  for (const pos of ["PT", ...LINE_POSITIONS] as Position[]) {
    const ready = at[pos].ready.length;
    const holes = chosen.holes.get(pos) ?? 0;
    // Los puestos que pide la formación, no los que se han podido llenar.
    const slots = ready + holes;

    if (holes > 0) {
      gaps.push({
        position: pos,
        kind: "hueco",
        count: holes,
        title: `Necesitas fichar ${count(pos, holes)}`,
        detail:
          ready === 0
            ? `No te queda ninguno que pueda jugar, así que ${slots === 1 ? "la casilla se tapa" : "las casillas se tapan"} con quien no va a saltar al campo.`
            : `Sólo tienes ${ready} que pueda${ready === 1 ? "" : "n"} jugar para ${slots} puesto${slots === 1 ? "" : "s"}.`,
      });
      continue;
    }

    const flojos = weak.filter((r) => r.player.position === pos).length;
    if (flojos > 0) {
      gaps.push({
        position: pos,
        kind: "flojo",
        count: flojos,
        title: `Te ${flojos === 1 ? "vendría" : "vendrían"} bien ${count(pos, flojos)}`,
        detail:
          flojos === 1
            ? "Uno de los que entra tiene menos de un 50% de salir de titular: el once sale adelante, pero a medias."
            : `${flojos} de los que entran tienen menos de un 50% de salir de titular: el once sale adelante, pero a medias.`,
      });
    }
  }

  return {
    formation: chosen.formation,
    players: chosen.players,
    xp: chosen.xp,
    forced: chosen.forced,
    missing: chosen.missing,
    weak,
    gaps,
    options: options.sort((a, b) => b.xp - a.xp),
  };
}
