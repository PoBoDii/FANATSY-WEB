import { normalizeName } from "./futbolfantasy";
import { TEAMS } from "./equipos";

/**
 * Clasificación de LaLiga con desglose de casa y fuera, de
 * `/laliga/clasificacion[/{año}]`.
 *
 * Es la materia prima del pronóstico: goles marcados y encajados como local y
 * como visitante son justo lo que necesita un modelo de Poisson. La página lo
 * publica en tres tablas paralelas (total, en casa, fuera) que comparten el
 * orden de filas con la de nombres.
 */

const HOST = "https://www.futbolfantasy.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const TTL_MS = 6 * 60 * 60 * 1000;

export type Split = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
};

export type TeamRecord = {
  slug: string | null;
  name: string;
  points: number;
  total: Split;
  home: Split;
  away: Split;
  /** Últimos resultados, del más reciente al más antiguo. */
  form: ("W" | "D" | "L")[];
};

export type Standings = {
  season: string;
  teams: TeamRecord[];
  /** Medias de la liga: la base sobre la que se normaliza todo. */
  averageHomeGoals: number;
  averageAwayGoals: number;
};

const cells = (row: string) =>
  [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
    c[1].replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(),
  );

const rowsOf = (table: string) =>
  [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) => r[1]).filter((r) => /<td/.test(r));

const int = (value: string | undefined) => {
  const n = Number((value ?? "").replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Las columnas van PJ G E P GF GC, con los puntos delante en la de total. */
function toSplit(row: string[], offset: number): Split {
  return {
    played: int(row[offset]),
    won: int(row[offset + 1]),
    drawn: int(row[offset + 2]),
    lost: int(row[offset + 3]),
    goalsFor: int(row[offset + 4]),
    goalsAgainst: int(row[offset + 5]),
  };
}

function parse(html: string, season: string): Standings | null {
  const tables = [...html.matchAll(/<table[\s\S]{0,400000}?<\/table>/g)].map((t) => t[0]);
  if (tables.length < 5) return null;

  const nameRows = rowsOf(tables[1]);
  const totalRows = rowsOf(tables[2]).map(cells);
  const homeRows = rowsOf(tables[3]).map(cells);
  const awayRows = rowsOf(tables[4]).map(cells);
  if (nameRows.length === 0 || totalRows.length !== nameRows.length) return null;

  const teams: TeamRecord[] = nameRows.map((row, i) => {
    const columns = cells(row);
    // La primera tabla trae, tras el nombre, los últimos resultados.
    const form = [...row.matchAll(/class="[^"]*\b(ganado|empatado|perdido)\b[^"]*"/g)]
      .map((m) => (m[1] === "ganado" ? "W" : m[1] === "empatado" ? "D" : "L") as "W" | "D" | "L")
      .slice(0, 5);

    return {
      slug: /\/laliga\/equipos\/([a-z0-9-]+)/.exec(row)?.[1] ?? null,
      name: columns[2] || columns[1] || "?",
      points: int(totalRows[i]?.[0]),
      // En la de total, la columna 0 son los puntos: los datos empiezan en 1.
      total: toSplit(totalRows[i] ?? [], 1),
      home: toSplit(homeRows[i] ?? [], 1),
      away: toSplit(awayRows[i] ?? [], 1),
      form,
    };
  });

  const homePlayed = teams.reduce((s, t) => s + t.home.played, 0);
  if (homePlayed === 0) return { season, teams, averageHomeGoals: 0, averageAwayGoals: 0 };

  return {
    season,
    teams,
    averageHomeGoals: teams.reduce((s, t) => s + t.home.goalsFor, 0) / homePlayed,
    averageAwayGoals: teams.reduce((s, t) => s + t.home.goalsAgainst, 0) / homePlayed,
  };
}

const cache = new Map<string, { at: number; standings: Standings }>();

async function fetchStandings(path: string, season: string): Promise<Standings | null> {
  const hit = cache.get(season);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.standings;

  try {
    const res = await fetch(`${HOST}${path}`, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!res.ok) return hit?.standings ?? null;

    const standings = parse(await res.text(), season);
    // Sólo se cachea lo que sirve; un fallo no debe congelarse.
    if (standings && standings.teams.length > 0) {
      cache.set(season, { at: Date.now(), standings });
      return standings;
    }
  } catch {
    // Nos quedamos con lo anterior.
  }
  return hit?.standings ?? null;
}

/**
 * La mejor foto disponible de la fuerza de cada equipo.
 *
 * Con la liga empezada manda la temporada en curso, pero hasta que hay una
 * muestra decente (5 jornadas) los números son ruido puro, así que se usa la
 * temporada pasada, que está completa.
 */
export async function getStrengthTable(): Promise<Standings | null> {
  const [current, previous] = await Promise.all([
    fetchStandings("/laliga/clasificacion", "actual"),
    fetchStandings("/laliga/clasificacion/2025", "2024/25"),
  ]);

  const playedEnough = (current?.teams ?? []).some((t) => t.total.played >= 5);
  return playedEnough ? current : (previous ?? current);
}

/** Registro de un club por su slug, tolerando nombres distintos. */
export function findRecord(standings: Standings, slug: string): TeamRecord | undefined {
  const direct = standings.teams.find((t) => t.slug === slug);
  if (direct) return direct;

  const team = TEAMS.find((t) => t.slug === slug);
  if (!team) return undefined;
  const wanted = normalizeName(team.name);
  return standings.teams.find((t) => normalizeName(t.name) === wanted);
}
