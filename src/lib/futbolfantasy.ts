import { unstable_cache } from "next/cache";
import type { Player } from "./normalize";
import { EMPTY_STATS, type FfPlayer, type PlayerAlert, type PlayerStats, type PricePoint } from "./odds";

/**
 * Datos de futbolfantasy.com: probabilidad de alineación y evolución de precio.
 *
 * Dos fuentes distintas, por necesidad:
 *
 *  1. `/analytics/laliga-fantasy/mercado` — UNA página con los 608 jugadores y,
 *     en los `data-*` de cada `<tr>`, el valor de hoy y el de hace 1/2/3/7/14/30
 *     días con sus diferencias y porcentajes. Es la espina dorsal: trae
 *     `data-nombre` ya normalizado, que casa con el nombre completo de LaLiga.
 *  2. `/laliga/equipos/{slug}` — 20 páginas, una por club, de donde sale la
 *     probabilidad (`<span class="prob-N">70%</span>`). No la publica para
 *     todos: sólo para los del once proyectado.
 *
 * Para quien se queda sin probabilidad en (2) hay un tercer recurso puntual:
 * su ficha individual, que sí la trae. Se pide sólo para jugadores concretos
 * que estén en pantalla, nunca en bloque.
 */

const HOST = "https://www.futbolfantasy.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const TEAMS = [
  "alaves", "athletic", "atletico", "barcelona", "betis",
  "celta", "deportivo", "elche", "espanyol", "getafe",
  "levante", "malaga", "osasuna", "racing", "rayo-vallecano",
  "real-madrid", "real-sociedad", "sevilla", "valencia", "villarreal",
] as const;

/**
 * Media hora.
 *
 * Estaba en cinco minutos, y cada caducidad son veintiuna descargas de un mega
 * más el trabajo de cruzarlas. Los precios se recalculan una vez al día y las
 * probabilidades se mueven poco a poco: ir corto no daba datos más frescos, sólo
 * repetía el mismo trabajo doce veces por hora.
 */
const TTL_MS = 30 * 60 * 1000;

/* ------------------------------------------------------------------ utilidades */

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas de acento
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Slug → palabras, quitando el sufijo numérico que futbolfantasy añade para
 * desambiguar homónimos ("manu-fernandez-1" → "manu fernandez").
 */
function slugWords(slug: string): string {
  return normalizeName(slug.replace(/-\d+$/, "").replace(/-/g, " "));
}

function lastToken(normalized: string): string {
  const parts = normalized.split(" ").filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

/**
 * ¿Son el mismo nombre de pila? Cubre los diminutivos por acortamiento, que en
 * español son constantes: "Manu" por "Manuel", "Fran" por "Francisco". Se pide
 * un mínimo de 3 letras para no emparejar iniciales sueltas.
 */
function sameFirstName(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(short);
}

async function grab(
  url: string,
  ttlSeconds: number,
  { store = true, timeoutMs = 15_000 }: { store?: boolean; timeoutMs?: number } = {},
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(timeoutMs),
      // Las fichas individuales llegan a 3 MB y el caché de datos de Next
      // rechaza cualquier cosa por encima de 2 MB: intentarlo sólo genera
      // trabajo y errores. Para esas nos vale la caché en memoria de abajo.
      ...(store ? { next: { revalidate: ttlSeconds } } : { cache: "no-store" as const }),
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** Lanza `work` sobre `items` con como mucho `limit` en vuelo a la vez. */
async function pool<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>) {
  const results: R[] = [];
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await work(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

/* ------------------------------------------------------------------ precios */

const ROW = /<tr class="elemento_jugador[^"]*"([^>]*)>/g;
const ATTR = /data-([a-z0-9-]+)="([^"]*)"/g;

type Raw = Record<string, string>;

const int = (raw: Raw, key: string): number | null => {
  const v = raw[key];
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function parsePrices(html: string): { rows: FfPlayer[]; teams: Map<string, string> } {
  // El desplegable de equipos da el nombre de cada id numérico.
  const teams = new Map<string, string>();
  const select = /<select[^>]*equipoSelect[^>]*>([\s\S]*?)<\/select>/.exec(html);
  if (select) {
    for (const opt of select[1].matchAll(/<option[^>]*value="(\d+)"[^>]*>([^<]*)</g)) {
      if (opt[1] !== "0") teams.set(opt[1], opt[2].trim());
    }
  }

  const rows: FfPlayer[] = [];
  for (const match of html.matchAll(ROW)) {
    const raw: Raw = {};
    for (const a of match[1].matchAll(ATTR)) raw[a[1]] = a[2];

    // `data-nombre` viene en minúsculas pero NO sin acentos: conserva la ñ
    // ("iñigo vicente"). Hay que normalizarlo o no casa con nada.
    const name = normalizeName(raw.nombre ?? "");
    const value = int(raw, "valor");
    if (!name || value === null) continue;

    // Serie de valores pasados, para dibujar la racha.
    const history: PricePoint[] = [];
    for (const days of [1, 2, 3, 7, 14, 30]) {
      const v = int(raw, `valor${days}`);
      if (v !== null) history.push({ daysAgo: days, value: v });
    }

    rows.push({
      name,
      displayName: null,
      ffId: raw.id ?? null,
      slug: null,
      probability: null,
      projectedStarter: false,
      value,
      previousValue: int(raw, "valor1"),
      diff: int(raw, "diferencia1"),
      diffPct: raw["diferencia-pct1"] ? Number(raw["diferencia-pct1"]) : null,
      history,
      streak: streakOf(value, history),
      position: raw.posicion ?? null,
      teamId: raw.equipo ?? null,
      teamName: null,
      stats: { ...EMPTY_STATS },
      alerts: [],
    });
  }

  for (const row of rows) if (row.teamId) row.teamName = teams.get(row.teamId) ?? null;

  return { rows, teams };
}

/**
 * Días seguidos subiendo (positivo) o bajando (negativo). Sólo se puede llegar
 * a 3 porque la fuente da valores de hace 1, 2 y 3 días y luego salta a 7.
 */
function streakOf(value: number, history: PricePoint[]): number {
  const byDay = new Map(history.map((h) => [h.daysAgo, h.value]));
  const series = [value, byDay.get(1), byDay.get(2), byDay.get(3)];

  let streak = 0;
  let direction = 0;
  for (let i = 0; i + 1 < series.length; i++) {
    const now = series[i];
    const before = series[i + 1];
    if (now === undefined || before === undefined || now === before) break;
    const step = now > before ? 1 : -1;
    if (direction === 0) direction = step;
    else if (step !== direction) break;
    streak += step;
  }
  return streak;
}

/* ----------------------------------------------------- probabilidades */

const ANCHOR = /<a\s[^>]*?href="https:\/\/www\.futbolfantasy\.com\/jugadores\/([a-z0-9-]+)"[^>]*>/g;

type TeamEntry = {
  slug: string;
  displayName: string;
  probability: number | null;
  /** Dibujado en el once probable del club. */
  projectedStarter: boolean;
  stats: PlayerStats;
};

/** `data-totalGoles="3"` → 3; vacío o ausente → null. */
function attr(tag: string, name: string): number | null {
  const m = new RegExp(`${name}="([^"]*)"`, "i").exec(tag);
  if (!m || m[1] === "") return null;
  const n = Number(m[1].replace("%", ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Los lesionados y sancionados de un club, con lo que dura la baja.
 *
 * La página de cada equipo tiene una sección aparte —`mod lesionados` y `mod
 * sancionados`— mucho mejor que los avisos sueltos: además de decir quién está
 * fuera, dice de qué, desde cuándo y hasta cuándo. Eso último es justo lo que
 * no había forma de saber desde la API del juego, que sólo marca "lesionado" y
 * te deja adivinando si vuelve el domingo o en marzo.
 *
 * Ojo con `mercado-box`: hay una sección de sancionados que en realidad son
 * rumores, y colarla mezclaba bajas de verdad con fichajes que no existen.
 */
const BAJAS_SECTION =
  /<section class="mod (lesionados|sancionados)(?![^"]*mercado-box)[^"]*"[\s\S]*?(?=<section|$)/g;

const BAJA_ENTRY =
  /\/jugadores\/([a-z0-9-]+)"\s+class="jugador">([^<]+)<\/a>\s*<div class="comentario">([\s\S]*?)<\/div>/g;

export type Baja = {
  slug: string;
  name: string;
  tipo: "lesion" | "sancion";
  /** "Rotura de lig. cruzado anterior". */
  motivo: string | null;
  /** "10/08", el día que empezó. */
  desde: string | null;
  /** Días que lleva fuera. */
  dias: number | null;
  /** "Baja hasta marzo" — cuándo se le espera de vuelta. */
  hasta: string | null;
};

function parseBajas(html: string): Baja[] {
  const out: Baja[] = [];

  for (const section of html.matchAll(BAJAS_SECTION)) {
    const tipo = section[1] === "lesionados" ? "lesion" : "sancion";

    for (const entry of section[0].matchAll(BAJA_ENTRY)) {
      const comentario = entry[3];
      const desde = /Desde\s+(\d{1,2}\/\d{1,2})/.exec(comentario);
      const dias = /\((\d+)\s+d[ií]as?\)/.exec(comentario);

      out.push({
        slug: entry[1],
        name: entry[2].trim(),
        tipo,
        motivo: /<span class="lesion">([^<]+)</.exec(comentario)?.[1].trim() ?? null,
        desde: desde?.[1] ?? null,
        dias: dias ? Number(dias[1]) : null,
        hasta: /<span class="gravedad-\d+">([^<]+)</.exec(comentario)?.[1].trim() ?? null,
      });
    }
  }

  return out;
}

/**
 * Avisos de futbolfantasy: partes médicos, noticias de fichajes y etiquetas de
 * mercado. Van en bloques `.elemento` aparte del once, con el enlace a la
 * noticia original.
 */
const ALERT_BLOCK =
  /<div class="elemento([^"]*)">([\s\S]*?)(?=<div class="elemento[ "]|<\/section|$)/g;

function parseAlerts(html: string): Map<string, PlayerAlert[]> {
  const out = new Map<string, PlayerAlert[]>();

  for (const block of html.matchAll(ALERT_BLOCK)) {
    const classes = block[1];
    const body = block[2];

    const player =
      /href="https:\/\/www\.futbolfantasy\.com\/jugadores\/([a-z0-9-]+)"[^>]*class="jugador"/.exec(
        body,
      );
    if (!player) continue;

    const link = /<a href="([^"]+)" class="([^"]*)link"[^>]*>[\s\S]*?<span class="label">([^<]*)</.exec(
      body,
    );
    const tags = [...body.matchAll(/<span class="mercado-tag-label">([^<]*)</g)].map((t) =>
      t[1].trim(),
    );
    if (!link && tags.length === 0) continue;

    const kind: PlayerAlert["kind"] =
      classes.includes("lesionado") || link?.[2].includes("lesion") ? "injury" : "news";

    const alerts = out.get(player[1]) ?? [];
    // Un mismo jugador puede tener varias noticias; nos quedamos con la
    // primera de cada tipo, que es la más reciente.
    if (!alerts.some((a) => a.kind === kind)) {
      alerts.push({
        kind,
        label: link?.[3].trim() || tags[0] || "Aviso",
        url: link?.[1] ?? null,
        tags: [...new Set(tags)],
      });
      out.set(player[1], alerts);
    }
  }

  return out;
}

/**
 * Jugadores de la página de un club, con su slug y (si la publican) su
 * probabilidad. El slug importa tanto como la probabilidad: es la única forma
 * de llegar después a la ficha individual, porque no siempre es el nombre
 * completo ("ratiu" y no "andrei-ratiu").
 */
/**
 * La página de un club enlaza a jugadores desde varios sitios, y sólo uno es
 * la plantilla: las secciones `alineacion_wrapper` (el campo y la lista). Las
 * `mercado-box` son rumores de fichaje y las `lesionados`, partes médicos.
 *
 * Sin acotarlo, el Atlético salía con Cristian Romero —que no es suyo— porque
 * aparecía en un rumor.
 */
/** El enlace a la ficha de un jugador dentro de un bloque del club. */
const PLAYER_HREF = /\/jugadores\/([a-z0-9-]+)"/;

const SQUAD_SECTION = /<section[^>]*class="mod alineacion_wrapper[^"]*"[\s\S]*?(?=<section|$)/g;

function squadHtml(html: string): string {
  const parts = [...html.matchAll(SQUAD_SECTION)].map((m) => m[0]);
  // Si el marcado cambia y no se reconoce ninguna sección, mejor lo de antes
  // (con rumores incluidos) que quedarse sin plantilla.
  return parts.length > 0 ? parts.join("") : html;
}

function parseTeamPage(html: string): TeamEntry[] {
  const bySlug = new Map<string, TeamEntry>();

  // Muy importante: recortar PRIMERO y trabajar siempre sobre el recorte. Las
  // posiciones que devuelve `matchAll` son del texto que se le pasa, y mezclar
  // esos índices con el HTML completo asignaba a cada jugador la probabilidad
  // de otro: Sivera salía con el 50% de un compañero y su 95% se lo llevaba
  // otro.
  const squad = squadHtml(html);

  // Quién sale dibujado en el once probable. El marcador `data-onceFF` va en
  // el envoltorio de la ficha, antes del enlace al jugador.
  const projected = new Set<string>();
  for (const mark of squad.matchAll(/data-onceFF="titular"/g)) {
    const slug = PLAYER_HREF.exec(squad.slice(mark.index, mark.index + 2500));
    if (slug) projected.add(slug[1]);
  }

  for (const match of squad.matchAll(ANCHOR)) {
    const slug = match[1];
    const from = match.index + match[0].length;
    const close = squad.indexOf("</a>", from);
    const inner = squad.slice(from, close === -1 ? from : close);

    const entry = bySlug.get(slug) ?? {
      slug,
      displayName: "",
      probability: null,
      projectedStarter: false,
      stats: { ...EMPTY_STATS },
    };

    if (entry.probability === null) {
      // El widget y el atributo dicen lo mismo; el atributo está en más sitios.
      const prob = /prob-\d+[^>]*>\s*(\d{1,3})\s*%/.exec(inner);
      entry.probability = prob ? Number(prob[1]) : attr(match[0], "data-probabilidad");
    }
    if (!entry.displayName) {
      const name = /class="[^"]*truncate-name[^"]*"[^>]*>\s*([^<]{2,60}?)\s*</.exec(inner);
      if (name) entry.displayName = name[1];
    }

    // Las estadísticas viven en los `data-*` del propio enlace.
    const tag = match[0];
    const s = entry.stats;
    s.goals ??= attr(tag, "data-totalGoles");
    s.assists ??= attr(tag, "data-totalAsistencias");
    s.yellow ??= attr(tag, "data-totalAmarillas");
    s.red ??= attr(tag, "data-totalRojas");
    s.matches ??= attr(tag, "data-totalPartidosJugados");
    s.minutes ??= attr(tag, "data-totalMinutosJugados");
    s.hierarchy ??= attr(tag, "data-jerarquia");

    entry.projectedStarter = projected.has(slug);
    bySlug.set(slug, entry);
  }

  return [...bySlug.values()];
}

/**
 * Empareja los jugadores de una página de club con las filas de mercado de ese
 * mismo club. Al estar acotado a un equipo (~30 jugadores) los apellidos
 * repetidos casi nunca chocan, así que basta con el apellido si el nombre
 * completo no cuadra.
 */
function joinClub(
  entries: TeamEntry[],
  rows: FfPlayer[],
  clubTeamId: string,
  alerts: Map<string, PlayerAlert[]>,
): FfPlayer[] {
  const byName = new Map(rows.map((r) => [r.name, r]));
  const bySurname = new Map<string, FfPlayer[]>();
  for (const row of rows) {
    const key = lastToken(row.name);
    if (!key) continue;
    const list = bySurname.get(key);
    if (list) list.push(row);
    else bySurname.set(key, [row]);
  }

  const extra: FfPlayer[] = [];
  const claimed = new Set<FfPlayer>();

  /**
   * Los slugs de futbolfantasy se comen la letra acentuada inicial: Álex Baena
   * es `lex-baena` y Julián Álvarez, `julian-lvarez`. Comparando token a token
   * no casan con "alex baena" ni con "julian alvarez", y el jugador acababa
   * duplicado: una vez desde el mercado y otra como añadido.
   */
  const sameToken = (a: string, b: string) => {
    if (!a || !b) return false;
    if (a === b) return true;
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    return long.length - short.length === 1 && long.endsWith(short);
  };

  const looseSurname = (surname: string) => {
    if (!surname) return [];
    const exact = bySurname.get(surname);
    if (exact) return exact;
    const out: FfPlayer[] = [];
    for (const [key, list] of bySurname) if (sameToken(key, surname)) out.push(...list);
    return out;
  };

  for (const entry of entries) {
    const words = slugWords(entry.slug);
    const display = normalizeName(entry.displayName);

    let row = byName.get(words) ?? byName.get(display);
    if (!row) {
      const candidates = [
        ...new Set([
          ...looseSurname(lastToken(words) || words),
          ...looseSurname(lastToken(display) || display),
        ]),
      ];
      // Con varios homónimos en la misma plantilla decide el nombre de pila.
      const first = words.split(" ")[0] ?? "";
      const narrowed =
        candidates.length > 1
          ? candidates.filter((c) => c.name.split(" ").some((t) => sameToken(t, first)))
          : candidates;
      const pool = narrowed.length === 1 ? narrowed : candidates;
      if (pool.length === 1) row = pool[0];
    }

    if (row) {
      claimed.add(row);
      row.slug = entry.slug;
      row.projectedStarter = entry.projectedStarter;
      // El nombre del campo suele ser el corto ("Baena"); se guarda como alias
      // para poder cruzarlo, pero sin perder el completo del mercado.
      row.displayName = display || null;
      if (row.probability === null) row.probability = entry.probability;
      row.stats = entry.stats;
      row.alerts = alerts.get(entry.slug) ?? [];
      continue;
    }

    // No está en la tabla de precios (pasa con recién llegados y con quien no
    // cotiza todavía). Entra igual al índice, aunque sea sólo con su club:
    // así al menos se enlaza el equipo aunque no haya probabilidad.
    //
    // Antes de darlo por nuevo se comprueba que no sea uno ya emparejado con
    // otro nombre: duplicarlo es peor que perderlo.
    const surname = lastToken(words) || words;
    if ([...claimed].some((r) => sameToken(lastToken(r.name), surname))) continue;

    extra.push({
      name: words || display,
      displayName: display || null,
      ffId: null,
      slug: entry.slug,
      probability: entry.probability,
      projectedStarter: entry.projectedStarter,
      value: 0,
      previousValue: null,
      diff: null,
      diffPct: null,
      history: [],
      streak: 0,
      position: null,
      teamId: clubTeamId,
      teamName: null,
      stats: entry.stats,
      alerts: alerts.get(entry.slug) ?? [],
    });
  }

  return extra;
}

/* ------------------------------------------------------------------ índice */

export type FfIndex = {
  size: number;
  withProbability: number;
  builtAt: number;
  /** Todos los jugadores, para la sección de Precios. */
  all: FfPlayer[];
  /** id de equipo de futbolfantasy → nombre. */
  teams: Map<string, string>;
  /** Lesionados y sancionados de toda la liga, por slug de jugador. */
  bajas: Map<string, Baja>;
  get(player: Player): FfPlayer | null;
  /** Busca por nombre suelto (para cruzar sin un Player de LaLiga). */
  byName(name: string): FfPlayer | null;
};

const EMPTY: FfIndex = {
  size: 0,
  withProbability: 0,
  builtAt: 0,
  all: [],
  teams: new Map(),
  bajas: new Map(),
  get: () => null,
  byName: () => null,
};

let snapshot: FfIndex | null = null;
let refreshing: Promise<FfIndex> | null = null;

/**
 * Lo que se puede guardar entre peticiones: filas y equipos, sin mapas ni
 * funciones. El índice con sus cruces se reconstruye encima, que es coser y
 * cantar comparado con volver a bajarse veintiuna páginas.
 */
type FfData = { rows: FfPlayer[]; teams: [string, string][]; bajas: Baja[] };

async function scrape(): Promise<FfData> {
  // Ninguna de estas páginas cabe en el caché de datos de Next (la de mercado
  // pasa de 4 MB y el tope son 2), así que ni se intenta: el índice ya vive
  // memoizado aquí y eso es lo que evita rehacer el trabajo.
  const [marketHtml, teamHtmls] = await Promise.all([
    grab(`${HOST}/analytics/laliga-fantasy/mercado`, TTL_MS / 1000, {
      store: false,
      timeoutMs: 45_000,
    }),
    pool(TEAMS, 5, (slug) =>
      grab(`${HOST}/laliga/equipos/${slug}`, TTL_MS / 1000, { store: false }),
    ),
  ]);

  if (!marketHtml) return { rows: [], teams: [], bajas: [] };

  const { rows, teams } = parsePrices(marketHtml);

  // El desplegable da el nombre de cada id numérico de equipo; las páginas van
  // por slug. No siempre coinciden literalmente: el desplegable dice "Rayo" y
  // la página es "rayo-vallecano", así que se acepta que uno sea prefijo del
  // otro. Sin esto, un club entero se queda sin probabilidades.
  const slugOfTeamId = new Map<string, string>();
  for (const [id, name] of teams) {
    const target = normalizeName(name);
    const slug = TEAMS.find((s) => {
      const words = normalizeName(s.replace(/-/g, " "));
      return words === target || words.startsWith(`${target} `) || target.startsWith(`${words} `);
    });
    if (slug) slugOfTeamId.set(id, slug);
  }

  // El cruce se hace club por club: acotarlo a ~30 jugadores hace que el
  // apellido baste y evita confundir homónimos de equipos distintos.
  const rowsByClub = new Map<string, FfPlayer[]>();
  for (const row of rows) {
    const slug = row.teamId ? slugOfTeamId.get(row.teamId) : undefined;
    if (!slug) continue;
    const list = rowsByClub.get(slug);
    if (list) list.push(row);
    else rowsByClub.set(slug, [row]);
  }

  const teamIdOfSlug = new Map([...slugOfTeamId].map(([id, slug]) => [slug, id]));

  const bajas: Baja[] = [];

  TEAMS.forEach((slug, i) => {
    const html = teamHtmls[i];
    if (!html) return;
    bajas.push(...parseBajas(html));
    const teamId = teamIdOfSlug.get(slug) ?? "";
    const extra = joinClub(
      parseTeamPage(html),
      rowsByClub.get(slug) ?? [],
      teamId,
      parseAlerts(html),
    );
    for (const row of extra) {
      row.teamName = teamId ? (teams.get(teamId) ?? null) : null;
      rows.push(row);
    }
  });

  /**
   * El histórico se recorta a los últimos ocho días. Es lo único que se
   * consulta (la subida de ayer, la de tres días y la de una semana) y guardar
   * la serie entera de setecientos jugadores no cabía en el caché.
   */
  for (const row of rows) row.history = row.history.slice(0, 8);

  return { rows, teams: [...teams], bajas };
}

/** Reconstruye el índice de búsqueda a partir de los datos guardados. */
function indexFrom(data: FfData): FfIndex {
  const rows = data.rows;
  const teams = new Map(data.teams);

  const index = new Map<string, FfPlayer[]>();
  const add = (key: string, row: FfPlayer) => {
    if (!key) return;
    const list = index.get(key);
    if (list) {
      if (!list.includes(row)) list.push(row);
    } else index.set(key, [row]);
  };

  for (const row of rows) {
    add(row.name, row);
    add(lastToken(row.name), row);
    // El nombre corto es a veces la única clave buena: el slug de "Alemão" es
    // `alemo`, que no casa con nada, pero su nombre corto sí.
    if (row.displayName) {
      add(row.displayName, row);
      add(lastToken(row.displayName), row);
    }
  }

  const withProbability = rows.filter((r) => r.probability !== null).length;

  const clubMatches = (row: FfPlayer, clubName: string) => {
    if (!clubName) return false;
    const club = normalizeName(clubName);
    const team = normalizeName(row.teamName ?? "");
    // Sin club por comparar no hay coincidencia. Antes el "—" que envía LaLiga
    // cuando no sabe el equipo se normalizaba a cadena vacía y entonces
    // `team.includes(club)` daba cierto para CUALQUIER fila: el desempate por
    // club aceptaba al primer candidato que pillara.
    if (club === "" || team === "") return false;
    return club.includes(team) || team.includes(club);
  };

  const pick = (found: FfPlayer[], clubName: string, firstName: string, single: boolean) => {
    // Candidato único: no hay nada que desambiguar. Importa para los apodos de
    // una sola palabra ("Alemâo"), donde el nombre de pila que trae LaLiga
    // ("Alexandre Zurawski") no se parece en nada al de futbolfantasy.
    if (found.length === 1) return found[0];

    // Con varios candidatos y una clave de una sola palabra estamos ante un
    // apellido suelto, y ahí el club NO basta para desempatar ("Diego Gómez"
    // contra Moi, Sergio y Valentín Gómez): se exige el nombre de pila.
    const pool = single
      ? found.filter((r) => r.name.split(" ").some((t) => sameFirstName(t, firstName)))
      : found;
    if (pool.length === 1) return pool[0];
    return pool.find((r) => clubMatches(r, clubName)) ?? null;
  };

  const lookup = (fullName: string, alias: string, slug: string, clubName: string) => {
    const full = normalizeName(fullName);
    const firstName = full.split(" ")[0] ?? "";
    const surname = lastToken(full);
    const slugKey = slugWords(slug);
    const keys = [full, slugKey, normalizeName(alias)];

    // Apellidos por los que se le conoce, según LaLiga.
    const surnames = new Set([surname, lastToken(normalizeName(alias))].filter(Boolean));

    /**
     * El slug de LaLiga es el nombre registral, y a veces ese nombre es el de
     * OTRO futbolista real: Álvaro Carreras viene como `alvaro-fernandez-1`, y
     * en futbolfantasy existe un "Álvaro Fernández" distinto (portero del
     * Deportivo). Un acierto por slug es sospechoso si no comparte apellido ni
     * club: no se descarta —sería peor quedarse sin nadie—, pero se aparta y
     * sólo se usa si ningún otro camino da algo.
     */
    const plausible = (row: FfPlayer) => {
      if (surnames.size === 0) return true;
      const tokens = new Set([
        ...row.name.split(" "),
        ...normalizeName(row.displayName ?? "").split(" "),
      ]);
      return [...surnames].some((s) => tokens.has(s)) || clubMatches(row, clubName);
    };

    let doubtful: FfPlayer | null = null;

    for (const key of keys) {
      const found = key ? index.get(key) : undefined;
      if (!found?.length) continue;
      const hit = pick(found, clubName, firstName, !key.includes(" "));
      if (!hit) continue;
      if (key === slugKey && key !== full && !plausible(hit)) {
        doubtful ??= hit;
        continue;
      }
      return hit;
    }

    // Segundos nombres: "Diego Llorente" contra "diego javier llorente".
    const wanted = full.split(" ").filter(Boolean);
    if (wanted.length >= 2) {
      const subset = rows.filter((r) => {
        const tokens = r.name.split(" ");
        return wanted.every((w) => tokens.includes(w));
      });
      if (subset.length === 1) return subset[0];
      const hit = subset.length ? pick(subset, clubName, firstName, false) : null;
      if (hit) return hit;
    }

    // Diminutivos: "Manuel Fernández" contra "Manu Fernández". Mismo apellido y
    // nombre de pila compatible; el club decide si hay más de uno.
    if (surname && firstName) {
      const candidates = (index.get(surname) ?? []).filter((r) => {
        const tokens = r.name.split(" ");
        return (
          tokens[tokens.length - 1] === surname &&
          tokens.some((t) => sameFirstName(t, firstName))
        );
      });
      if (candidates.length === 1) return candidates[0];
      const hit = candidates.find((r) => clubMatches(r, clubName));
      if (hit) return hit;
    }

    // Ningún camino limpio: antes que dejarlo sin datos, el del slug.
    return doubtful;
  };

  return {
    size: rows.length,
    withProbability,
    builtAt: Date.now(),
    all: rows,
    teams,
    bajas: new Map(data.bajas.map((b) => [b.slug, b])),
    get: (player) => lookup(player.fullName, player.name, player.slug, player.clubName),
    byName: (name) => lookup(name, name, "", ""),
  };
}

/**
 * Los datos, guardados donde sobreviven a la petición.
 *
 * En el servidor de casa bastaba con memorizarlos en una variable, pero en
 * producción cada visita puede caer en un proceso recién arrancado: sin nada en
 * memoria, había que volver a bajarse las veintiuna páginas antes de pintar
 * nada. De ahí que a veces la página no llegara a cargar.
 *
 * `unstable_cache` los deja en el caché de datos de Next, que sí se comparte
 * entre peticiones y entre procesos. Se guarda lo escueto —filas y equipos— y
 * el índice de búsqueda se levanta encima en cada arranque, que cuesta
 * milisegundos.
 */
const loadData = unstable_cache(scrape, ["futbolfantasy-index"], {
  revalidate: TTL_MS / 1000,
  tags: ["ff"],
});

function refresh(): Promise<FfIndex> {
  refreshing ??= loadData()
    .then((data) => {
      const index = indexFrom(data);
      if (index.size > 0) snapshot = index;
      return snapshot ?? index;
    })
    .catch(() => snapshot ?? EMPTY)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * Índice listo para usar. El coste es fijo (21 peticiones) y no depende de
 * cuántos jugadores se consulten: cada búsqueda es un acceso a un `Map`.
 * Si está caducado se sirve el anterior al momento y se refresca por detrás,
 * así ninguna carga de página espera.
 */
export function getFf(): Promise<FfIndex> {
  // Sin instantánea previa se reintenta siempre: un fallo no se convierte en
  // "no hay precios" durante los diez minutos siguientes.
  if (snapshot && Date.now() - snapshot.builtAt < TTL_MS) return Promise.resolve(snapshot);
  if (snapshot) {
    void refresh();
    return Promise.resolve(snapshot);
  }
  return refresh();
}

/* -------------------------------------- respaldo: ficha individual */

const soloCache = new Map<string, { probability: number | null; at: number }>();

/**
 * Probabilidad de un jugador suelto, leída de su propia ficha.
 *
 * Hace falta porque la página de equipo sólo publica el once proyectado: un
 * fichaje reciente como Dumfries no sale ahí, pero su ficha sí lo tiene. Se
 * usa únicamente para jugadores que ya están en pantalla y en tandas cortas.
 */
export async function probabilityFromProfile(slug: string): Promise<number | null> {
  if (!slug) return null;

  const cached = soloCache.get(slug);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.probability;

  const html = await grab(`${HOST}/jugadores/${slug}`, TTL_MS / 1000, { store: false });
  const match = html ? /prob-\d+[^>]*>\s*(\d{1,3})\s*%/.exec(html) : null;
  const probability = match ? Number(match[1]) : null;

  soloCache.set(slug, { probability, at: Date.now() });
  return probability;
}

/**
 * Devuelve un buscador igual que `index.get` pero que además ha ido a por la
 * probabilidad de los jugadores de `players` a los que les faltaba.
 *
 * La página del club sólo publica el once proyectado, así que a los suplentes
 * y recién llegados hay que buscarlos en su ficha. Cada ficha son ~62 KB
 * comprimidos y se cachean, así que para una plantilla o un mercado sale
 * barato; por eso el tope, para que nadie lo llame con 600 jugadores.
 */
export async function enrichOdds(
  index: FfIndex,
  players: Player[],
  limit = 30,
): Promise<(player: Player) => FfPlayer | null> {
  const pending = new Map<string, FfPlayer>();
  for (const player of players) {
    const ff = index.get(player);
    if (ff && ff.probability === null && ff.slug && !pending.has(ff.slug)) {
      pending.set(ff.slug, ff);
    }
  }

  const found = await fetchProfiles([...pending.keys()], limit);
  if (found.size === 0) return index.get;

  return (player) => {
    const ff = index.get(player);
    if (!ff || ff.probability !== null || !ff.slug) return ff;
    const probability = found.get(ff.slug);
    return probability === undefined ? ff : { ...ff, probability };
  };
}

/**
 * Igual que `enrichOdds` pero sobre fichas de futbolfantasy directamente, sin
 * jugadores de LaLiga de por medio. Lo usa la vista de Precios, que trabaja
 * con la tabla de precios y no con una plantilla.
 */
export async function enrichRows(rows: FfPlayer[], limit = 40): Promise<FfPlayer[]> {
  const slugs = rows
    .filter((r) => r.probability === null && r.slug)
    .map((r) => r.slug!)
    .slice(0, limit);

  const found = await fetchProfiles(slugs, limit);
  if (found.size === 0) return rows;

  return rows.map((row) => {
    if (row.probability !== null || !row.slug) return row;
    const probability = found.get(row.slug);
    return probability === undefined ? row : { ...row, probability };
  });
}

async function fetchProfiles(slugs: string[], limit: number): Promise<Map<string, number>> {
  const found = new Map<string, number>();
  await pool([...new Set(slugs)].slice(0, limit), 4, async (slug) => {
    const probability = await probabilityFromProfile(slug);
    if (probability !== null) found.set(slug, probability);
  });
  return found;
}
