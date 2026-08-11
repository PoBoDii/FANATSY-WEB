import { getToken, FantasyAuthError } from "./auth";

/**
 * Cliente de la API oficial de LaLiga Fantasy.
 *
 * Todo esto corre en el servidor (Server Components / route handlers), así que
 * no hay problema de CORS ni el token toca nunca el navegador.
 *
 * Las rutas marcadas como VERIFICADO se comprobaron contra el host real: sin
 * token una ruta existente devuelve 401 y una inexistente 404, así que se puede
 * mapear el enrutado sin credenciales. Ojo: el prefijo `/v3/competition/{id}/`
 * que usan los proyectos antiguos ya NO existe; ahora las rutas son planas.
 */

const BASE = process.env.FANTASY_API_BASE ?? "https://fantasy-api.llt-services.com/api";

/**
 * `competitionId` es OBLIGATORIO en casi todos los endpoints. Sin él la API no
 * devuelve 400 sino un 500 genérico, que es justo lo que despista: parece que
 * algo está roto cuando en realidad falta el parámetro. 1 = LaLiga.
 */
const COMPETITION = process.env.FANTASY_COMPETITION_ID ?? "1";

/**
 * Frescura de lo que cambia a todas horas (mercado, plantillas, pujas).
 * Quince segundos: lo justo para que moverse por la web no vuelva a pedirlo
 * todo, y muy por debajo del refresco automático de 60 s de las vistas.
 */
const LIVE_SECONDS = 15;

export class FantasyApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: string,
  ) {
    super(`${status} en ${path}`);
    this.name = "FantasyApiError";
  }
}

type FetchOpts = {
  /** Segundos de caché en el Data Cache de Next. 0 = siempre fresco. */
  revalidate?: number;
};

async function call<T>(path: string, opts: FetchOpts = {}, retry = true): Promise<T> {
  const token = await getToken();
  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE}${path}${sep}competitionId=${COMPETITION}&x-lang=es`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-lang": "es",
      Accept: "application/json",
    },
    next: opts.revalidate === 0 ? undefined : { revalidate: opts.revalidate ?? 60 },
    cache: opts.revalidate === 0 ? "no-store" : undefined,
  });

  if (res.status === 401 && retry) {
    // Token caducado antes de tiempo: forzamos renovación y reintentamos una vez.
    await getToken(true);
    return call<T>(path, opts, false);
  }

  if (!res.ok) {
    throw new FantasyApiError(res.status, path, (await res.text()).slice(0, 500));
  }

  return (await res.json()) as T;
}

/** Envuelve una llamada para que un fallo no tumbe la página entera. */
export async function safe<T>(p: Promise<T>): Promise<{ data: T | null; error: string | null }> {
  try {
    return { data: await p, error: null };
  } catch (e) {
    if (e instanceof FantasyAuthError) {
      return { data: null, error: `Login: ${e.message}${e.detail ? ` — ${e.detail}` : ""}` };
    }
    if (e instanceof FantasyApiError) {
      return { data: null, error: `API ${e.status} en ${e.path}` };
    }
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ---------------------------------------------------------------- endpoints */

export const fantasy = {
  raw: <T = unknown>(path: string) => call<T>(path, { revalidate: 0 }),

  /** VERIFICADO */
  me: () => call<unknown>("/v3/user/me", { revalidate: 300 }),

  /** VERIFICADO */
  leagues: () => call<unknown>("/v3/leagues", { revalidate: 300 }),

  /** VERIFICADO — detalle de la liga; suele traer ya la lista de equipos. */
  league: (leagueId: string) => call<unknown>(`/v3/leagues/${leagueId}`, { revalidate: 60 }),

  /** VERIFICADO */
  currentWeek: () => call<unknown>("/v3/week/current", { revalidate: 300 }),

  /**
   * VERIFICADO — la joya de la corona: **v5**, no v3. Devuelve todos los
   * equipos de la liga con su manager, posición, puntos, valor Y su plantilla
   * completa. De aquí salen a la vez la clasificación y las plantillas rivales.
   */
  leagueTeams: (leagueId: string) =>
    call<unknown>(`/v5/leagues/${leagueId}/teams`, { revalidate: LIVE_SECONDS }),

  /** VERIFICADO — plantilla completa de un manager (la mía o la de un rival). */
  team: (leagueId: string, teamId: string) =>
    call<unknown>(`/v3/leagues/${leagueId}/teams/${teamId}`, { revalidate: LIVE_SECONDS }),

  /** VERIFICADO — alineación de la jornada en curso. */
  lineup: (teamId: string) => call<unknown>(`/v3/teams/${teamId}/lineup`, { revalidate: LIVE_SECONDS }),

  /** VERIFICADO */
  money: (teamId: string) => call<unknown>(`/v3/teams/${teamId}/money`, { revalidate: 60 }),

  /** VERIFICADO — ojo: `league` en singular, a diferencia del resto. */
  market: (leagueId: string) =>
    call<unknown>(`/v3/league/${leagueId}/market`, { revalidate: LIVE_SECONDS }),

  /** VERIFICADO — también v5, y sin paginar. */
  activity: (leagueId: string) =>
    call<unknown>(`/v5/leagues/${leagueId}/activity`, { revalidate: LIVE_SECONDS }),

  /** VERIFICADO — devuelve { playerMaster, manager, playerTeam }. */
  player: (playerId: string, leagueId: string) =>
    call<unknown>(`/v3/player/${playerId}/league/${leagueId}`, { revalidate: 300 }),

  /**
   * Histórico de valor. Existe, pero devuelve 500 mientras el jugador no tenga
   * histórico (al arrancar la temporada). Quien lo llame debe tolerar el fallo.
   */
  playerValues: (playerId: string) =>
    call<unknown>(`/v3/player/${playerId}/market-value`, { revalidate: 300 }),

  /**
   * VERIFICADO — los ~700 jugadores de LaLiga con id, apodo, equipo, valor y
   * foto. Es lo que permite enlazar a la ficha de CUALQUIER jugador, no sólo
   * de los que alguien tiene fichados en mi liga.
   */
  players: () => call<unknown>("/v5/players", { revalidate: 600 }),

  /** VERIFICADO */
  calendar: () => call<unknown>("/v3/calendar", { revalidate: 3600 }),

  /** VERIFICADO — público, sin token. */
  formations: () =>
    call<unknown>("/v4/teams/lineup/formations?option=free", { revalidate: 86400 }),
};
