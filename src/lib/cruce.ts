import { fantasy, safe } from "./api";
import { getFf, normalizeName } from "./futbolfantasy";
import type { FfPlayer } from "./odds";

/**
 * Cruce entre los jugadores de futbolfantasy y los ids de LaLiga.
 *
 * Hace falta para poder enlazar a la ficha de cualquier futbolista desde los
 * campos de Alineaciones y Equipos: ahí los jugadores vienen de futbolfantasy,
 * que usa sus propios ids, y `/jugador/{id}` espera el de LaLiga. Hasta ahora
 * sólo eran clicables los que alguien tenía fichados en mi liga.
 *
 * La clave buena no es el nombre sino el **valor de mercado**: las dos fuentes
 * publican el mismo número oficial, y con siete cifras casi nunca se repite.
 * Donde sí se repite —los jugadores al precio mínimo, unos 600 k€— desempata el
 * equipo, que se deduce por mayoría de los cruces ya seguros.
 */

type LaLigaPlayer = {
  id: string;
  nickname: string;
  teamId: string;
  value: number;
};

export type IdResolver = {
  /** A partir de una fila del mercado de futbolfantasy (lo más fiable). */
  fromRow(row: FfPlayer | null | undefined): string | null;
  /**
   * A partir de un nombre suelto. Hace falta para los que futbolfantasy no
   * lista en su mercado pero sí pone en un once. El id de equipo (el suyo, no
   * el de LaLiga) acota la búsqueda y evita confundir homónimos.
   */
  fromName(name: string, ffTeamId?: string | null): string | null;
};

const TTL_MS = 10 * 60 * 1000;

function lastToken(normalized: string): string {
  const parts = normalized.split(" ").filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : (parts[0] ?? "");
}

function toPlayers(raw: unknown): LaLigaPlayer[] {
  if (!Array.isArray(raw)) return [];
  const out: LaLigaPlayer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const id = String(p.id ?? "");
    const nickname = String(p.nickname ?? "");
    if (!id || !nickname) continue;
    out.push({
      id,
      nickname,
      teamId: String(p.teamId ?? ""),
      value: Number(p.marketValue ?? 0),
    });
  }
  return out;
}

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function build(players: LaLigaPlayer[], rows: FfPlayer[]): IdResolver {
  const byValue = new Map<number, LaLigaPlayer[]>();
  const byName = new Map<string, LaLigaPlayer[]>();
  const bySurname = new Map<string, LaLigaPlayer[]>();
  const byInitial = new Map<string, LaLigaPlayer[]>();

  for (const p of players) {
    const name = normalizeName(p.nickname);
    const list = byValue.get(p.value);
    if (list) list.push(p);
    else byValue.set(p.value, [p]);
    push(byName, name, p);
    push(bySurname, lastToken(name), p);
    // LaLiga abrevia: "T. Martínez", "A. García". La inicial del nombre más el
    // apellido reconstruyen la clave que sí casa con "toni martinez".
    push(byInitial, `${name[0] ?? ""}|${lastToken(name)}`, p);
  }

  // Primera pasada: sólo los valores que no se repiten. Con esos, cada id de
  // equipo de futbolfantasy vota a qué id de equipo de LaLiga corresponde.
  const votes = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!row.teamId) continue;
    const found = byValue.get(row.value);
    if (!found || found.length !== 1) continue;
    const tally = votes.get(row.teamId) ?? new Map<string, number>();
    tally.set(found[0].teamId, (tally.get(found[0].teamId) ?? 0) + 1);
    votes.set(row.teamId, tally);
  }

  const teamOf = new Map<string, string>();
  for (const [ffTeam, tally] of votes) {
    const [best] = [...tally].sort((a, b) => b[1] - a[1]);
    // Tres votos bastan: una equivalencia errónea no llega ni a eso.
    if (best && best[1] >= 3) teamOf.set(ffTeam, best[0]);
  }

  const cache = new Map<string, string | null>();

  const resolve = (
    name: string,
    value: number | null,
    ffTeamId: string | null | undefined,
    displayName: string | null,
  ): string | null => {
    const key = `${name}|${value ?? ""}|${ffTeamId ?? ""}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;

    const wantTeam = ffTeamId ? teamOf.get(ffTeamId) : undefined;
    const surname = lastToken(name);

    // Cada candidato acumula puntos por valor, por nombre y por equipo. El
    // valor pesa más que el nombre porque es un número oficial idéntico en las
    // dos fuentes, mientras que el nombre lo escribe cada web a su manera.
    const scores = new Map<string, { player: LaLigaPlayer; score: number }>();
    const bump = (p: LaLigaPlayer, points: number) => {
      const entry = scores.get(p.id) ?? { player: p, score: 0 };
      entry.score += points;
      scores.set(p.id, entry);
    };

    if (value !== null) for (const p of byValue.get(value) ?? []) bump(p, 4);
    for (const p of byName.get(name) ?? []) bump(p, 3);
    for (const p of byInitial.get(`${name[0] ?? ""}|${surname}`) ?? []) bump(p, 2);
    for (const p of bySurname.get(surname) ?? []) bump(p, 1);
    if (displayName) {
      const alias = normalizeName(displayName);
      for (const p of byName.get(alias) ?? []) bump(p, 3);
      for (const p of byInitial.get(`${alias[0] ?? ""}|${lastToken(alias)}`) ?? []) bump(p, 2);
    }
    if (wantTeam) for (const entry of scores.values()) {
      if (entry.player.teamId === wantTeam) entry.score += 2;
    }

    const ranked = [...scores.values()].sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const second = ranked[1];

    // Se exige margen sobre el segundo: un empate significa que no sabemos cuál
    // de los dos es, y enlazar al jugador equivocado es peor que no enlazar.
    const id =
      best && best.score >= 4 && (!second || best.score > second.score) ? best.player.id : null;

    cache.set(key, id);
    return id;
  };

  return {
    fromRow: (row) => (row ? resolve(row.name, row.value, row.teamId, row.displayName) : null),
    fromName: (name, ffTeamId) => resolve(normalizeName(name), null, ffTeamId ?? null, null),
  };
}

let snapshot: { at: number; resolve: IdResolver } | null = null;
let building: Promise<IdResolver> | null = null;

async function refresh(): Promise<IdResolver> {
  building ??= (async () => {
    const [{ data }, ff] = await Promise.all([safe(fantasy.players()), getFf()]);
    const players = toPlayers(data);
    // Sin listado no hay cruce posible: se devuelve un resolutor que no enlaza
    // nada, pero no se guarda como instantánea buena para poder reintentar.
    if (players.length === 0) return { fromRow: () => null, fromName: () => null };
    const resolve = build(players, ff.all);
    snapshot = { at: Date.now(), resolve };
    return resolve;
  })().finally(() => {
    building = null;
  });
  return building;
}

/** Resolutor listo para usar; se refresca por detrás cuando caduca. */
export function getIdResolver(): Promise<IdResolver> {
  if (snapshot && Date.now() - snapshot.at < TTL_MS) return Promise.resolve(snapshot.resolve);
  if (snapshot) {
    void refresh();
    return Promise.resolve(snapshot.resolve);
  }
  return refresh();
}
