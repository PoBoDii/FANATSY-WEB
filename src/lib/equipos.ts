import { normalizeName } from "./futbolfantasy";

/**
 * Calendario y dificultad de cada club, de
 * `/laliga/equipos/{slug}/partidos`.
 *
 * La dificultad es cosecha de futbolfantasy: la publican como una clase
 * (`id-dificil`) más una imagen `vertical_N.jpg` con el nivel. Es el dato que
 * dice si a un jugador le viene una semana cómoda o un calvario.
 */

const HOST = "https://www.futbolfantasy.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const TTL_MS = 30 * 60 * 1000;

/**
 * Los 20 clubes con su slug de página y su id numérico en futbolfantasy.
 *
 * Los ids NO siguen ningún orden ni coinciden con el alfabético: están sacados
 * uno a uno del desplegable de equipos de su tabla de mercado. Deducirlos a ojo
 * sale mal — Racing es el 42 y Villarreal el 22.
 */
export const TEAMS = [
  { slug: "alaves", name: "Alavés", ffId: "28", color: "#0761af" },
  { slug: "athletic", name: "Athletic", ffId: "1", color: "#ee2523" },
  { slug: "atletico", name: "Atlético", ffId: "2", color: "#cb3524" },
  { slug: "barcelona", name: "Barcelona", ffId: "3", color: "#a50044" },
  { slug: "betis", name: "Betis", ffId: "4", color: "#00954c" },
  { slug: "celta", name: "Celta", ffId: "5", color: "#8ac3ee" },
  { slug: "deportivo", name: "Deportivo", ffId: "6", color: "#0075c9" },
  { slug: "elche", name: "Elche", ffId: "21", color: "#00754a" },
  { slug: "espanyol", name: "Espanyol", ffId: "7", color: "#0071ce" },
  { slug: "getafe", name: "Getafe", ffId: "8", color: "#005999" },
  { slug: "levante", name: "Levante", ffId: "10", color: "#005999" },
  { slug: "malaga", name: "Málaga", ffId: "11", color: "#0d6cb9" },
  { slug: "osasuna", name: "Osasuna", ffId: "13", color: "#d81920" },
  { slug: "racing", name: "Racing", ffId: "42", color: "#00954c" },
  { slug: "rayo-vallecano", name: "Rayo", ffId: "14", color: "#e53027" },
  { slug: "real-madrid", name: "Real Madrid", ffId: "15", color: "#00529f" },
  { slug: "real-sociedad", name: "Real Sociedad", ffId: "16", color: "#0067b1" },
  { slug: "sevilla", name: "Sevilla", ffId: "17", color: "#d81920" },
  { slug: "valencia", name: "Valencia", ffId: "18", color: "#f18e00" },
  { slug: "villarreal", name: "Villarreal", ffId: "22", color: "#ffe667" },
] as const;

export type TeamRef = (typeof TEAMS)[number];

export function findTeam(slug: string): TeamRef | undefined {
  return TEAMS.find((t) => t.slug === slug);
}

/* --------------------------------------------------------- dificultad */

export type Difficulty = "m-asequible" | "asequible" | "igualado" | "dificil" | "m-dificil";

/** De 1 (rival flojo) a 5 (rival temible). Para poder promediar calendarios. */
export const DIFFICULTY_LEVEL: Record<Difficulty, number> = {
  "m-asequible": 1,
  asequible: 2,
  igualado: 3,
  dificil: 4,
  "m-dificil": 5,
};

const DIFFICULTY: Record<Difficulty, { label: string; short: string; bg: string; ink: string }> = {
  "m-asequible": { label: "Muy asequible", short: "MUY FÁCIL", bg: "#38bdf8", ink: "#052e46" },
  asequible: { label: "Asequible", short: "FÁCIL", bg: "#4ade80", ink: "#0b3d20" },
  igualado: { label: "Igualado", short: "IGUALADO", bg: "#f59e0b", ink: "#3b1d00" },
  dificil: { label: "Difícil", short: "DIFÍCIL", bg: "#ef4444", ink: "#ffffff" },
  "m-dificil": { label: "Muy difícil", short: "MUY DIFÍCIL", bg: "#991b1b", ink: "#ffffff" },
};

export function difficultyTone(level: Difficulty | null) {
  return level ? DIFFICULTY[level] : { label: "Sin dato", short: "?", bg: "#eef1f5", ink: "#838e9a" };
}

/* ---------------------------------------------------------- partidos */

export type Fixture = {
  id: string;
  url: string;
  /** "LaLiga", "Amistoso", "Champions"… */
  competition: string;
  /** "Jornada 1", "Amistoso"… */
  phase: string;
  /** "Sab 15/08 19:30h" en próximos; vacío en los jugados. */
  date: string;
  /** "3-1" en los jugados. */
  result: string | null;
  outcome: "won" | "lost" | "draw" | null;
  home: { name: string; badge: string | null };
  away: { name: string; badge: string | null };
  /** true si el equipo consultado juega en casa. */
  atHome: boolean;
  difficulty: Difficulty | null;
};

const MATCH =
  /<a href="([^"]+)" class="partido([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;

function parseSection(html: string, teamName: string): Fixture[] {
  const out: Fixture[] = [];
  const wanted = normalizeName(teamName);

  for (const m of html.matchAll(MATCH)) {
    const [, url, classes, body] = m;

    const teams = [...body.matchAll(/class="equipo (local|visitante)"[^>]*>\s*<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"/g)];
    if (teams.length < 2) continue;

    const side = (which: "local" | "visitante") => {
      const found = teams.find((t) => t[1] === which);
      return {
        name: (found?.[3] ?? "").trim(),
        badge: found?.[2] ? found[2].replace(/^\/\//, "https://") : null,
      };
    };

    const home = side("local");
    const away = side("visitante");

    const level = /class="dificultad (id-[a-z-]+)"/.exec(body)?.[1].replace("id-", "") ?? null;
    const outcome = classes.includes("won")
      ? "won"
      : classes.includes("lost")
        ? "lost"
        : classes.includes("draw")
          ? "draw"
          : null;

    out.push({
      id: /partidos\/(\d+)/.exec(url)?.[1] ?? url,
      url,
      competition: /class="logo[^"]*"[^>]*>\s*<img[^>]*alt="([^"]*)"/.exec(body)?.[1] ?? "",
      phase: text(/<div class="fase">([\s\S]*?)<\/div>/.exec(body)?.[1]),
      date: text(/<div class="date">([\s\S]*?)<\/div>/.exec(body)?.[1]),
      result: text(/<div class="resultado">([\s\S]*?)<\/div>/.exec(body)?.[1]) || null,
      outcome,
      home,
      away,
      atHome: normalizeName(home.name) === wanted,
      difficulty: (level as Difficulty | null) ?? null,
    });
  }

  return out;
}

const text = (raw?: string) => (raw ? raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "");

export type Fixtures = { last: Fixture[]; next: Fixture[] };

const cache = new Map<string, { at: number; fixtures: Fixtures }>();

export async function getFixtures(slug: string): Promise<Fixtures> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.fixtures;

  const team = findTeam(slug);
  let fixtures: Fixtures | null = null;

  try {
    const res = await fetch(`${HOST}/laliga/equipos/${slug}/partidos`, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (res.ok) {
      const html = await res.text();
      // La página trae dos secciones seguidas: jugados y próximos.
      const cut = html.indexOf("partidos proximos");
      const name = team?.name ?? slug;
      fixtures = {
        // Enteros: la pestaña de calendario los quiere todos y las vistas
        // resumidas ya cortan lo que necesitan.
        last: parseSection(cut > 0 ? html.slice(0, cut) : html, name).reverse(),
        next: cut > 0 ? parseSection(html.slice(cut), name) : [],
      };
    }
  } catch {
    // Nos quedamos con lo que hubiera cacheado.
  }

  // Igual que con las alineaciones: un fallo no debe guardarse como dato
  // fresco, o el calendario se queda vacío hasta que expire el TTL.
  if (fixtures && (fixtures.last.length > 0 || fixtures.next.length > 0)) {
    cache.set(slug, { at: Date.now(), fixtures });
    return fixtures;
  }
  return hit?.fixtures ?? { last: [], next: [] };
}

/* --------------------------------------------- calendario por plantilla */

/**
 * Próximo partido de LaLiga de cada jugador, resuelto por su club.
 *
 * Se agrupa por club antes de pedir nada: una plantilla de 24 jugadores toca
 * como mucho 20 clubes, y normalmente muchos menos.
 */
export async function fixturesByClub<T extends { clubName?: string }>(
  players: T[],
  oddsOf: (player: T) => { teamId: string | null } | null,
): Promise<(player: T) => Fixture[] | null> {
  /**
   * El club se busca primero por el id de futbolfantasy y, si ese jugador no
   * tiene ficha allí, por el nombre que da LaLiga. Sin este respaldo, a quien
   * futbolfantasy no lista se le quedaba el calendario en blanco.
   */
  const clubOf = (player: T) =>
    TEAMS.find((t) => t.ffId === oddsOf(player)?.teamId) ?? findTeamByName(player.clubName ?? "");

  const slugs = new Set<string>();
  for (const player of players) {
    const team = clubOf(player);
    if (team) slugs.add(team.slug);
  }

  const entries = await Promise.all(
    [...slugs].map(async (slug) => [slug, (await getFixtures(slug)).next] as const),
  );

  const bySlug = new Map(entries);
  return (player) => {
    const team = clubOf(player);
    return team ? (bySlug.get(team.slug) ?? null) : null;
  };
}

/* ------------------------------------------------ fuerza de plantilla */

/**
 * Valor total de mercado de cada club, como indicador de fuerza.
 *
 * En Fantasy el precio persigue al rendimiento, así que sumar la plantilla da
 * una medida continua y bastante honesta de lo bueno que es un equipo.
 */
export function squadValues(rows: { teamId: string | null; value: number }[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.teamId) continue;
    totals.set(row.teamId, (totals.get(row.teamId) ?? 0) + row.value);
  }
  return totals;
}

/** Cómo ve el rival ESTE mismo partido: hace falta para el pronóstico. */
export async function opponentDifficulty(
  opponentSlug: string,
  matchId: string,
): Promise<Difficulty | null> {
  const fixtures = await getFixtures(opponentSlug);
  const found = [...fixtures.next, ...fixtures.last].find((f) => f.id === matchId);
  return found?.difficulty ?? null;
}

/** Busca un club por su nombre tal y como lo escribe futbolfantasy. */
export function findTeamByName(name: string): TeamRef | undefined {
  const wanted = normalizeName(name);
  if (!wanted) return undefined;
  const exact = TEAMS.find((t) => normalizeName(t.name) === wanted);
  if (exact) return exact;
  // Cada fuente escribe el club a su manera: "Sevilla FC", "Rayo Vallecano",
  // "RCD Espanyol". Basta con que uno contenga al otro por palabras enteras.
  return TEAMS.find((t) => {
    const mine = normalizeName(t.name);
    return (
      wanted === mine ||
      wanted.startsWith(`${mine} `) ||
      wanted.endsWith(` ${mine}`) ||
      wanted.includes(` ${mine} `) ||
      mine.startsWith(`${wanted} `) ||
      mine.endsWith(` ${wanted}`)
    );
  });
}

/** Ruta de la ficha del club, o null si no se reconoce el nombre. */
export function clubHref(name: string | null | undefined): string | null {
  if (!name) return null;
  const team = findTeamByName(name);
  return team ? `/equipos/${team.slug}` : null;
}
