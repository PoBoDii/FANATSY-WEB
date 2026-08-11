import type { Difficulty } from "./equipos";
import type { Split, Standings, TeamRecord } from "./clasificacion";

/**
 * Pronóstico 1X2 mediante un modelo de Poisson bivariante con la corrección de
 * Dixon-Coles.
 *
 * Es el método estándar para predecir resultados de fútbol desde Maher (1982) y
 * Dixon-Coles (1997), y funciona así:
 *
 *  1. A cada equipo se le estiman cuatro fuerzas, **separando casa y fuera**,
 *     porque un equipo no rinde igual en los dos sitios:
 *       · ataque local     = goles que mete en casa / media de goles locales
 *       · defensa local    = goles que encaja en casa / media de goles visitantes
 *       · ataque visitante y defensa visitante, análogos
 *  2. Los goles esperados de cada lado salen de cruzar el ataque de uno con la
 *     defensa del otro:
 *       λ_local     = media_local     × ataque_local(A)     × defensa_visitante(B)
 *       λ_visitante = media_visitante × ataque_visitante(B) × defensa_local(A)
 *  3. Se calcula la probabilidad de cada marcador con dos Poisson y se suman
 *     por franjas para obtener 1, X y 2.
 *  4. **Corrección de Dixon-Coles**: la Poisson pura se queda corta en los
 *     marcadores bajos (0-0, 1-0, 0-1, 1-1), que son justo los más comunes.
 *     El factor `tau` los reajusta.
 *
 * Encima se aplican dos ajustes que el modelo base no captura:
 *  · **Estado de forma**: los últimos cinco resultados, con peso pequeño, para
 *    que una racha se note sin dominar.
 *  · **Equipos recién ascendidos**: no tienen histórico en Primera, así que su
 *    fuerza se estima con el valor de su plantilla y la dificultad que
 *    futbolfantasy asigna al partido.
 *
 * La ventaja de campo NO se añade a mano: ya está dentro de las medias de la
 * liga (1,45 goles del local contra 1,17 del visitante la temporada pasada).
 */

const MAX_GOALS = 8;
/** Cuánto pesa la racha reciente frente al histórico. */
const FORM_WEIGHT = 0.12;
/** Dependencia de marcadores bajos; Dixon-Coles lo estima en torno a -0.03. */
const RHO = -0.03;

export type Forecast = {
  home: number;
  draw: number;
  away: number;
  /** Goles esperados de cada lado. */
  expected: { home: number; away: number };
  /** Marcador más probable. */
  scoreline: { home: number; away: number; probability: number };
  /** Qué ha entrado en el cálculo, para poder explicarlo. */
  basis: string[];
};

type Strength = { attack: number; defence: number };

/**
 * Fuerza de ataque o defensa, normalizada a 1 = media de la liga.
 *
 * Con **regresión a la media**: media temporada son 19 partidos, y a esa escala
 * el ruido pesa. Sin esto, cruzar un ataque flojo con una defensa buena
 * multiplica dos estimaciones exageradas y salen marcadores irreales — un
 * Alavés-Getafe daba 0,53 goles esperados. El encogimiento crece con la
 * muestra: a 19 partidos se conserva el 76 % de la desviación.
 */
const SHRINK_GAMES = 6;

const rate = (split: Split, average: number, conceded = false) => {
  if (split.played === 0 || average === 0) return 1;
  const perGame = (conceded ? split.goalsAgainst : split.goalsFor) / split.played;
  const raw = perGame / average;
  const weight = split.played / (split.played + SHRINK_GAMES);
  const shrunk = 1 + weight * (raw - 1);
  return Math.max(0.45, Math.min(2.2, shrunk));
};

/** Puntos por partido de los últimos cinco, normalizado a 1 = media. */
function formFactor(record: TeamRecord | undefined): number {
  if (!record || record.form.length === 0) return 1;
  const points = record.form.reduce((s, r) => s + (r === "W" ? 3 : r === "D" ? 1 : 0), 0);
  const perGame = points / record.form.length;
  // 1,4 puntos por partido es la media de la liga; ±0,12 como mucho.
  return 1 + FORM_WEIGHT * ((perGame - 1.4) / 1.6);
}

/**
 * Un ascendido no tiene histórico en Primera. Se le estima la fuerza con el
 * valor de su plantilla frente a la media, que es el mejor indicador
 * disponible, y se ancla en el 0,8 típico de un recién llegado.
 */
function promotedStrength(squadValue: number | null, averageValue: number | null): Strength {
  if (!squadValue || !averageValue) return { attack: 0.82, defence: 1.18 };
  const ratio = Math.max(0.45, Math.min(1.6, squadValue / averageValue));
  return { attack: 0.6 + 0.4 * ratio, defence: 1.4 - 0.4 * ratio };
}

function poisson(lambda: number, k: number): number {
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

/** Corrección de Dixon-Coles para los cuatro marcadores bajos. */
function tau(home: number, away: number, lh: number, la: number): number {
  if (home === 0 && away === 0) return 1 - lh * la * RHO;
  if (home === 0 && away === 1) return 1 + lh * RHO;
  if (home === 1 && away === 0) return 1 + la * RHO;
  if (home === 1 && away === 1) return 1 - RHO;
  return 1;
}

export function forecast({
  standings,
  homeRecord,
  awayRecord,
  homeSquadValue,
  awaySquadValue,
  averageSquadValue,
  homeDifficulty,
  awayDifficulty,
}: {
  standings: Standings | null;
  homeRecord: TeamRecord | undefined;
  awayRecord: TeamRecord | undefined;
  homeSquadValue?: number | null;
  awaySquadValue?: number | null;
  averageSquadValue?: number | null;
  homeDifficulty?: Difficulty | null;
  awayDifficulty?: Difficulty | null;
}): Forecast {
  const basis: string[] = [];

  // Medias de la liga; si no hay tabla, las históricas de LaLiga.
  const avgHome = standings?.averageHomeGoals || 1.45;
  const avgAway = standings?.averageAwayGoals || 1.17;

  let homeStrength: Strength;
  let awayStrength: Strength;

  if (homeRecord && homeRecord.home.played > 0) {
    homeStrength = {
      attack: rate(homeRecord.home, avgHome),
      defence: rate(homeRecord.home, avgAway, true),
    };
  } else {
    homeStrength = promotedStrength(homeSquadValue ?? null, averageSquadValue ?? null);
    basis.push("el local no tiene histórico en Primera: se estima por plantilla");
  }

  if (awayRecord && awayRecord.away.played > 0) {
    awayStrength = {
      attack: rate(awayRecord.away, avgAway),
      defence: rate(awayRecord.away, avgHome, true),
    };
  } else {
    awayStrength = promotedStrength(awaySquadValue ?? null, averageSquadValue ?? null);
    basis.push("el visitante no tiene histórico en Primera: se estima por plantilla");
  }

  if (homeRecord || awayRecord) {
    basis.push(`goles a favor y en contra, casa y fuera (${standings?.season ?? "histórico"})`);
  }
  if (homeRecord?.form.length || awayRecord?.form.length) basis.push("estado de forma");

  // Cuando la dificultad de futbolfantasy es tajante y va en un solo sentido,
  // se deja que empuje un poco: son analistas siguiendo la actualidad.
  let nudge = 1;
  if (homeDifficulty && awayDifficulty) {
    const scale: Record<Difficulty, number> = {
      "m-asequible": 2,
      asequible: 1,
      igualado: 0,
      dificil: -1,
      "m-dificil": -2,
    };
    nudge = 1 + 0.05 * (scale[homeDifficulty] - scale[awayDifficulty]) * 0.5;
    basis.push("dificultad de futbolfantasy");
  }

  const lambdaHome =
    avgHome * homeStrength.attack * awayStrength.defence * formFactor(homeRecord) * nudge;
  const lambdaAway =
    avgAway * awayStrength.attack * homeStrength.defence * formFactor(awayRecord) * (2 - nudge);

  // Matriz de marcadores.
  let home = 0;
  let draw = 0;
  let away = 0;
  let best = { home: 0, away: 0, probability: 0 };

  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = poisson(lambdaHome, h) * poisson(lambdaAway, a) * tau(h, a, lambdaHome, lambdaAway);
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
      if (p > best.probability) best = { home: h, away: a, probability: p };
    }
  }

  const total = home + draw + away;

  return {
    home: home / total,
    draw: draw / total,
    away: away / total,
    expected: { home: lambdaHome, away: lambdaAway },
    scoreline: { ...best, probability: best.probability / total },
    basis,
  };
}

export function forecastLabel(f: Forecast, homeName: string, awayName: string): string {
  const best = Math.max(f.home, f.draw, f.away);
  if (best === f.draw) return "Partido igualado";
  const [name, p] = f.home > f.away ? [homeName, f.home] : [awayName, f.away];
  if (p >= 0.6) return `${name} muy favorito`;
  if (p >= 0.45) return `${name} favorito`;
  return `${name}, ligero favorito`;
}
