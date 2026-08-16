import { normalizeName } from "./futbolfantasy";

/**
 * Parte de lesionados de futbolfantasy: `/laliga/lesionados`.
 *
 * Una sola página con toda la liga. Las fichas de club sólo dicen "Parte
 * médico" con el enlace a la noticia; aquí está lo que de verdad se quiere
 * saber: qué tiene, desde cuándo y si llega a la jornada.
 *
 * Cada entrada es un `.elemento.lesionado` dentro de la sección de su club:
 *
 *   <span class="lesion">Rotura muscular</span>
 *   <span><i class="far fa-calendar"></i> Desde 07/08 (4 días)</span>
 *   <span class="gravedad-2">Baja para la jornada 1</span>
 */

const HOST = "https://www.futbolfantasy.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Cinco minutos: los partes médicos salen a lo largo del día. */
const TTL_MS = 20 * 60 * 1000;

export type Injury = {
  /** Nombre normalizado; es la clave del cruce. */
  name: string;
  displayName: string;
  slug: string;
  /** Id de futbolfantasy, para componer la foto. */
  ffId: string | null;
  /** Id de equipo de futbolfantasy, sacado del escudo de la cabecera. */
  teamId: string | null;
  /** "Rotura muscular", "Molestias sin determinar"… */
  kind: string | null;
  /** "Desde 07/08 (4 días)". */
  since: string | null;
  /** "Baja para la jornada 1", "Duda para la jornada 1"… */
  outlook: string | null;
  /**
   * Cómo lo pinta futbolfantasy: **0 es lo más grave** (baja larga), 1 duda o
   * baja corta, 2 disponible o sanción. Va al revés de lo que parece, así que
   * para colorear se usa `injuryTone` y no el número a pelo.
   */
  severity: number;
  probability: number | null;
  url: string | null;
};

/**
 * La página agrupa por club en secciones, y cada cabecera lleva el escudo con
 * el id de equipo en la URL. Es la única forma de saber de quién es cada
 * lesionado sin volver a cruzar por nombre.
 */
const SECTION = /<header class="title col-12">[\s\S]*?cabecera\/hd\/(\d+)\.png[\s\S]*?<\/header>([\s\S]*?)(?=<header class="title col-12">|$)/g;

const ENTRY = /<div class="elemento lesionado col-12">([\s\S]*?)(?=<div class="elemento lesionado col-12">|<\/section>)/g;

const text = (value: string | undefined) =>
  value ? value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() || null : null;

function parse(html: string): Injury[] {
  const out: Injury[] = [];

  for (const section of html.matchAll(SECTION)) {
    const teamId = section[1];

  for (const match of section[2].matchAll(ENTRY)) {
    const body = match[1];

    const link = /href="https:\/\/www\.futbolfantasy\.com\/jugadores\/([a-z0-9-]+)"[^>]*class="jugador"[^>]*>([^<]*)</.exec(
      body,
    );
    if (!link) continue;

    // La foto real va en `data-src`; el `src` es la camiseta de relleno.
    const ffId = /\/jugadores\/ficha\/(\d+)\.png/.exec(body)?.[1] ?? null;
    const kind = text(/<span class="lesion">([\s\S]*?)<\/span>/.exec(body)?.[1]);
    const since = text(/<i class="far fa-calendar"><\/i>([\s\S]*?)<\/span>/.exec(body)?.[1]);
    const gravity = /<span class="gravedad-(\d)">([\s\S]*?)<\/span>/.exec(body);
    const prob = /<span class="prob-\d+[^"]*">\s*(\d{1,3})\s*%/.exec(body);
    const news = /<a href="([^"]+)" class="[^"]*link"/.exec(body);

    const displayName = link[2].trim();

    out.push({
      name: normalizeName(displayName),
      displayName,
      slug: link[1],
      ffId,
      teamId,
      kind,
      since,
      outlook: text(gravity?.[2]),
      severity: gravity ? Number(gravity[1]) : 0,
      probability: prob ? Number(prob[1]) : null,
      url: news?.[1] ?? null,
    });
  }
  }

  return out;
}

export type InjuryIndex = {
  byName: Map<string, Injury>;
  /** Por id de equipo de futbolfantasy, ya ordenados de más grave a menos. */
  byTeam: Map<string, Injury[]>;
  total: number;
};

let cache: { at: number; index: InjuryIndex } | null = null;

const EMPTY_INDEX: InjuryIndex = { byName: new Map(), byTeam: new Map(), total: 0 };

/** Parte de lesionados de toda la liga. */
export async function getInjuries(): Promise<InjuryIndex> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.index;

  let list: Injury[] = [];
  try {
    const res = await fetch(`${HOST}/laliga/lesionados`, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (res.ok) list = parse(await res.text());
  } catch {
    // Se conserva lo anterior.
  }

  // Un fallo no se guarda como dato fresco: dejaría la liga sin lesionados
  // durante todo el TTL aunque los haya.
  if (list.length === 0) return cache?.index ?? EMPTY_INDEX;

  const byName = new Map<string, Injury>();
  const byTeam = new Map<string, Injury[]>();

  for (const injury of list) {
    byName.set(injury.name, injury);
    // También por apellido suelto: los nombres cortos de LaLiga ("Boyé") no
    // coinciden con los completos de futbolfantasy ("Lucas Boyé").
    const parts = injury.name.split(" ");
    if (parts.length > 1) {
      const surname = parts[parts.length - 1];
      if (!byName.has(surname)) byName.set(surname, injury);
    }

    if (injury.teamId) {
      const team = byTeam.get(injury.teamId);
      if (team) team.push(injury);
      else byTeam.set(injury.teamId, [injury]);
    }
  }

  // Lo más grave arriba: primero las bajas, luego las dudas, y al final quien
  // ya está disponible. El orden de `severity` va al revés, así que se ordena
  // por el pronóstico.
  const rank = (i: Injury) => {
    const outlook = (i.outlook ?? "").toLowerCase();
    if (outlook.startsWith("disponible")) return 2;
    if (outlook.startsWith("duda")) return 1;
    return 0;
  };
  for (const team of byTeam.values()) team.sort((a, b) => rank(a) - rank(b));

  cache = { at: Date.now(), index: { byName, byTeam, total: list.length } };
  return cache.index;
}

/** Color con el que enseñar el pronóstico: rojo baja, ámbar duda, verde vuelve. */
export function injuryTone(injury: Injury): { bg: string; border: string; text: string } {
  const outlook = (injury.outlook ?? "").toLowerCase();
  if (outlook.startsWith("disponible")) {
    return { bg: "bg-up-soft", border: "border-emerald-300", text: "text-up" };
  }
  if (outlook.startsWith("duda")) {
    return { bg: "bg-warn-soft", border: "border-warn/40", text: "text-warn" };
  }
  return { bg: "bg-down-soft", border: "border-down/40", text: "text-down" };
}

/** Busca por nombre completo o corto, en ese orden. */
export function findInjury(
  injuries: InjuryIndex,
  ...names: (string | null | undefined)[]
): Injury | null {
  for (const name of names) {
    if (!name) continue;
    const key = normalizeName(name);
    const hit = injuries.byName.get(key);
    if (hit) return hit;
    const parts = key.split(" ");
    if (parts.length > 1) {
      const bySurname = injuries.byName.get(parts[parts.length - 1]);
      if (bySurname) return bySurname;
    }
  }
  return null;
}
