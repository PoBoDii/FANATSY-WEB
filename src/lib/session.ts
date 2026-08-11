import { cache } from "react";
import { cookies } from "next/headers";
import { fantasy, FantasyApiError } from "./api";
import { FantasyAuthError } from "./auth";
import { toList } from "./normalize";

export type LeagueRef = {
  id: string;
  name: string;
  /** Mi equipo dentro de esa liga. */
  myTeamId: string | null;
  managers: number;
};

export type Session = {
  leagues: LeagueRef[];
  active: LeagueRef | null;
  /** Sólo fallos de login. Un fallo de datos no es esto. */
  error: string | null;
  /** El token vale pero /leagues falla: casi siempre = aún no tienes liga. */
  noLeagues: boolean;
  /** Nombre de manager, para confirmar que la conexión va bien. */
  managerName: string | null;
};

function readLeague(raw: any): LeagueRef {
  const team = raw?.team ?? raw?.myTeam ?? {};
  return {
    id: String(raw?.id ?? raw?.leagueId ?? ""),
    name: String(raw?.name ?? raw?.leagueName ?? "Liga sin nombre"),
    myTeamId: team?.id != null ? String(team.id) : null,
    managers: Number(raw?.managersNumber ?? raw?.numTeams ?? raw?.teamsCount ?? 0) || 0,
  };
}

/**
 * Resuelve la liga activa. Prioridad: cookie → env → primera de la lista.
 * Cachear esto por petición evita repetir /leagues en cada componente.
 */
export const getSession = cache(async (): Promise<Session> => {
  // Primero comprobamos el login. Es lo único que puede estar "roto" de verdad:
  // /user/me no depende de tener equipo, así que si responde, la conexión va.
  let managerName: string | null = null;
  try {
    const me = (await fantasy.me()) as { managerName?: string };
    managerName = me?.managerName ?? null;
  } catch (e) {
    if (e instanceof FantasyAuthError) {
      return {
        leagues: [],
        active: null,
        error: `${e.message}${e.detail ? ` — ${e.detail}` : ""}`,
        noLeagues: false,
        managerName: null,
      };
    }
    if (e instanceof FantasyApiError && e.status === 401) {
      return {
        leagues: [],
        active: null,
        error: "El token no vale (401). Revisa las credenciales.",
        noLeagues: false,
        managerName: null,
      };
    }
    // Otro fallo de la API: no es problema de login, seguimos.
  }

  let leagues: LeagueRef[] = [];
  let noLeagues = false;
  try {
    leagues = toList(await fantasy.leagues()).map(readLeague).filter((l) => l.id);
    noLeagues = leagues.length === 0;
  } catch {
    // Con el token válido, /leagues devuelve 500 mientras la cuenta no tenga
    // equipo en la temporada en curso. Lo tratamos como "aún sin liga".
    noLeagues = true;
  }

  const preferred =
    (await cookies()).get("league")?.value ?? process.env.FANTASY_LEAGUE_ID ?? null;

  const active = leagues.find((l) => l.id === preferred) ?? leagues[0] ?? null;

  return { leagues, active, error: null, noLeagues, managerName };
});

/** Igual que getSession pero explota si no hay liga: para páginas que la exigen. */
export async function requireLeague() {
  const session = await getSession();
  return session;
}
