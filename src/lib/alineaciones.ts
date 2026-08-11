import { normalizeName } from "./futbolfantasy";
import { ffBadge } from "./odds";

/**
 * Alineaciones probables de futbolfantasy.
 *
 * Dos piezas:
 *  1. `/laliga/posibles-alineaciones[/{jornada}]` — la parrilla de partidos de
 *     una jornada. Cada partido es un `<a class="partido">` con los escudos
 *     (que llevan el id de equipo en la URL), la fecha y el id del encuentro.
 *  2. `/api/alineaciones/{partido}/{equipo}` — el once probable de un equipo en
 *     ese partido, separado en titulares y "alternativas al once".
 */

const HOST = "https://www.futbolfantasy.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Diez minutos: los onces se mueven, pero no minuto a minuto. */
const TTL_MS = 10 * 60 * 1000;

export type MatchSide = { teamId: string; name: string; badge: string | null };

export type Match = {
  id: string;
  slug: string;
  home: MatchSide;
  away: MatchSide;
  /** "Sab 15/08 · 19:30h", tal cual lo publica la fuente. */
  kickoff: string;
};

export type ProbablePlayer = {
  slug: string;
  name: string;
  /** Id de futbolfantasy; con él se compone la foto. */
  ffId: string;
};

/**
 * Un hueco del once, no un jugador.
 *
 * Es la diferencia clave: futbolfantasy da la probabilidad **por posición**, y
 * dentro de cada una pone al favorito y debajo a quienes se lo pueden quitar.
 * Por eso las alternativas aparecían antes sin porcentaje: no tienen uno
 * propio, comparten el del hueco.
 */
export type LineupSlot = {
  ffId: string;
  position: "PT" | "DF" | "MC" | "DL" | "?";
  probability: number | null;
  /** El favorito va primero; el resto son quienes le disputan el puesto. */
  players: ProbablePlayer[];
  starter: boolean;
};

async function grab(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(20_000),
      // Estas páginas rondan el megabyte; el caché de datos de Next las
      // rechazaría, así que se guardan en memoria aquí abajo.
      cache: "no-store",
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- partidos */

const CARD = /<a[^>]+href="https:\/\/www\.futbolfantasy\.com\/partidos\/(\d+)-([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/g;

function parseMatches(html: string): Match[] {
  const out: Match[] = [];

  for (const card of html.matchAll(CARD)) {
    const body = card[3];
    const badges = [...body.matchAll(/class="escudo (local|visitante)[^"]*"[^>]*alt="([^"]*)"/g)];
    // El alt puede ir antes o después de la clase según el escudo.
    const sides = badges.length
      ? badges
      : [...body.matchAll(/alt="([^"]*)"[^>]*class="escudo (local|visitante)/g)].map(
          (m) => [m[0], m[2], m[1]] as unknown as RegExpMatchArray,
        );
    if (sides.length < 2) continue;

    const ids = [...body.matchAll(/escudom\/(\d+)\.png/g)].map((m) => m[1]);
    const fecha = /<div class="fecha">([\s\S]*?)<\/div>/.exec(body);

    const side = (which: "local" | "visitante", index: number): MatchSide => {
      const found = sides.find((s) => s[1] === which);
      return {
        teamId: ids[index] ?? "",
        name: (found?.[2] ?? "").trim(),
        badge: ffBadge(ids[index] ?? null),
      };
    };

    out.push({
      id: card[1],
      slug: card[2],
      home: side("local", 0),
      away: side("visitante", 1),
      kickoff: fecha
        ? fecha[1].replace(/<br\s*\/?>/g, " · ").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
        : "",
    });
  }

  // La página lista primero la jornada pedida y luego otras competiciones;
  // nos quedamos con el primer bloque de 10, que es la jornada de LaLiga.
  const seen = new Set<string>();
  return out.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))).slice(0, 10);
}

const matchCache = new Map<number, { at: number; matches: Match[] }>();

export async function getMatches(round: number): Promise<Match[]> {
  const hit = matchCache.get(round);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.matches;

  const html = await grab(`${HOST}/laliga/posibles-alineaciones/${round}`);
  const matches = html ? parseMatches(html) : [];

  // Sólo se guarda lo que ha salido bien. Guardar un fallo con marca de tiempo
  // nueva lo convierte en "dato fresco" y deja la jornada vacía durante todo
  // el TTL; mejor conservar lo anterior y reintentar a la siguiente.
  if (matches.length > 0) matchCache.set(round, { at: Date.now(), matches });
  return matches.length > 0 ? matches : (hit?.matches ?? []);
}

/* -------------------------------------------------------------- onces */

/**
 * Cada hueco del campo es un `<div class="jugador_{id} tipo_campo ...">`.
 * `portero` marca la portería y `supl-NNN` las filas del banquillo; el resto
 * son los diez de campo.
 */
const SLOT = /<div class="jugador_(\d+) tipo_campo ([^"]*)"([^>]*)>/g;

const POSITIONS: Record<string, LineupSlot["position"]> = {
  Portero: "PT",
  Defensa: "DF",
  Mediocampista: "MC",
  Delantero: "DL",
};

function parseLineup(html: string): LineupSlot[] {
  const heads = [...html.matchAll(SLOT)];
  const slots: LineupSlot[] = [];

  for (const [i, head] of heads.entries()) {
    const classes = head[2];
    const attrs = head[3];
    const end = heads[i + 1]?.index ?? html.length;
    const block = html.slice(head.index, end);

    const prob = /prob-\d+[^>]*>\s*(\d{1,3})\s*%/.exec(block) ?? /data-probabilidad="(\d{1,3})%"/.exec(block);
    const posName = /data-posicion="([^"]*)"/.exec(attrs)?.[1] ?? "";

    // Nombres y slugs van en paralelo: el primero es el favorito del hueco.
    const names = [...block.matchAll(/class="[^"]*truncate-name[^"]*"[^>]*>\s*([^<]{2,40}?)\s*</g)].map(
      (m) => m[1],
    );
    const slugs = [
      ...new Set([...block.matchAll(/\/jugadores\/([a-z0-9-]+)"/g)].map((m) => m[1])),
    ];
    if (slugs.length === 0) continue;

    slots.push({
      ffId: head[1],
      position: POSITIONS[posName] ?? (classes.includes("portero") ? "PT" : "?"),
      probability: prob ? Number(prob[1]) : null,
      players: slugs.map((slug, k) => ({
        slug,
        name: names[k] ?? slug.replace(/-\d+$/, "").replace(/-/g, " "),
        // El id del wrapper es el del titular; los alternativos no lo traen.
        ffId: k === 0 ? head[1] : "",
      })),
      starter: !classes.includes("supl-"),
    });
  }

  return slots;
}

const lineupCache = new Map<string, { at: number; slots: LineupSlot[] }>();

export async function getLineup(matchId: string, teamId: string): Promise<LineupSlot[]> {
  const key = `${matchId}/${teamId}`;
  const hit = lineupCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.slots;

  const html = await grab(`${HOST}/api/alineaciones/${matchId}/${teamId}?ignoreOver=true`);
  const slots = html ? parseLineup(html) : [];

  if (slots.length > 0) lineupCache.set(key, { at: Date.now(), slots });
  return slots.length > 0 ? slots : (hit?.slots ?? []);
}

/**
 * Once que futbolfantasy proyecta para el PRÓXIMO partido de un club.
 *
 * Hace falta porque no publican alineación para los partidos lejanos: los tres
 * de la jornada 1 aplazados a finales de agosto devuelven vacío, y su propia
 * web también los muestra en blanco. En esos casos se enseña este, avisando de
 * que es el del siguiente partido del equipo y no el de este.
 */
export async function getClubLineup(clubSlug: string, ffTeamId: string): Promise<LineupSlot[]> {
  const key = `club/${clubSlug}`;
  const hit = lineupCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.slots;

  const page = await grab(`${HOST}/laliga/equipos/${clubSlug}`);
  // La página del club dice cuál es su próximo encuentro en `data-prox`.
  const next = page ? /data-prox="(\d+)"/.exec(page)?.[1] : null;
  if (!next) return hit?.slots ?? [];

  const slots = await getLineup(next, ffTeamId);
  if (slots.length > 0) lineupCache.set(key, { at: Date.now(), slots });
  return slots.length > 0 ? slots : (hit?.slots ?? []);
}

/** Clave con la que se cruza un jugador de futbolfantasy con uno de LaLiga. */
export function lineupKey(player: ProbablePlayer): string {
  return normalizeName(player.slug.replace(/-\d+$/, "").replace(/-/g, " "));
}
