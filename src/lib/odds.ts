/**
 * Modelo y escalas de color de los datos de futbolfantasy.
 *
 * Va aparte del scraper para que los componentes puedan importar sólo esto:
 * así el scraper nunca acaba en un bundle de cliente por arrastre de imports.
 */

export type PricePoint = {
  /** Hace cuántos días es este valor. */
  daysAgo: number;
  value: number;
};

export type FfPlayer = {
  /** Nombre completo ya normalizado, tal cual lo publica futbolfantasy. */
  name: string;
  /**
   * Nombre corto que enseña la web, normalizado. Hace falta como clave aparte
   * porque a veces el slug pierde letras: "Alemão" tiene slug `alemo`.
   */
  displayName: string | null;
  /** Id interno de futbolfantasy; sirve para componer la foto. */
  ffId: string | null;
  /**
   * Slug de su ficha. No siempre es el nombre completo ("ratiu" y no
   * "andrei-ratiu"), por eso se lee de la página del club en vez de deducirlo.
   */
  slug: string | null;
  /** 0-100, probabilidad de salir de titular. null si no la publican. */
  probability: number | null;
  /**
   * Si futbolfantasy lo pone en el once probable de su club. Es más fiable que
   * el porcentaje a secas: dos jugadores al 50% no son lo mismo si a uno lo
   * dibujan en el campo y al otro no.
   */
  projectedStarter: boolean;
  value: number;
  previousValue: number | null;
  /** Diferencia con el día anterior, en euros. */
  diff: number | null;
  /** La misma diferencia en porcentaje. */
  diffPct: number | null;
  history: PricePoint[];
  /** Días seguidos subiendo (+) o bajando (−). Tope 3: la fuente no da más. */
  streak: number;
  position: string | null;
  teamId: string | null;
  teamName: string | null;
  stats: PlayerStats;
  alerts: PlayerAlert[];
};

export const EMPTY_STATS: PlayerStats = {
  goals: null,
  assists: null,
  yellow: null,
  red: null,
  matches: null,
  minutes: null,
  hierarchy: null,
};

/** Aviso publicado por futbolfantasy sobre un jugador. */
export type PlayerAlert = {
  kind: "injury" | "news";
  /** "Parte médico", "Noticia"… */
  label: string;
  url: string | null;
  /** "Interés", "Negociación", "Cedible"… */
  tags: string[];
};

/** Estadísticas de temporada que publica futbolfantasy en la ficha. */
export type PlayerStats = {
  goals: number | null;
  assists: number | null;
  yellow: number | null;
  red: number | null;
  matches: number | null;
  minutes: number | null;
  /**
   * Cuánto cuenta para su entrenador según futbolfantasy, de 0 a 100.
   * Es su "jerarquía": 100 = intocable.
   */
  hierarchy: number | null;
};

export type OddsTone = {
  /** Fondo del distintivo y color de la barra lateral. */
  color: string;
  /** Tinta que se lee encima de ese fondo. */
  ink: string;
  label: string;
};

/**
 * De más a menos seguro. Los tramos altos van a morado y azul (como en
 * futbolfantasy) para que "es fijo" no se confunda con el verde de "va bien",
 * y los bajos caen por amarillo y naranja hasta rojo.
 */
/** Escudo del club en el CDN de futbolfantasy, por su id numérico. */
export function ffBadge(teamId: string | null): string | null {
  return teamId
    ? `https://static.futbolfantasy.com/uploads/images/equipos/escudom/${teamId}.png`
    : null;
}

/** Foto del jugador en el CDN de futbolfantasy. */
export function ffPhoto(ffId: string | null): string | null {
  return ffId ? `https://media.futbolfantasy.com/thumb/80x80/v2026/uploads/images/jugadores/ficha/${ffId}.png` : null;
}

/* ------------------------------------------------- enlaces a la fuente */

/**
 * Casi todo lo que se enseña aquí sale de futbolfantasy, así que cada pantalla
 * lleva un botón a la página equivalente de allí: para contrastar un dato raro,
 * leer el parte médico entero o ver lo que aquí no se copia.
 *
 * Los constructores viven en este módulo y no en los scrapers porque los
 * componentes importan de aquí; llevarlos a `futbolfantasy.ts` arrastraría el
 * scraper entero a cualquier bundle que los use.
 */
export const FF_HOST = "https://www.futbolfantasy.com";

/** Ficha del jugador. El slug lo publica la página de su club. */
export function ffPlayerUrl(slug: string | null | undefined): string | null {
  return slug ? `${FF_HOST}/jugadores/${slug}` : null;
}

/** Página del club, con su plantilla y su once probable. */
export function ffTeamUrl(slug: string | null | undefined): string | null {
  return slug ? `${FF_HOST}/laliga/equipos/${slug}` : null;
}

/** Página de un partido, con sus alineaciones. */
export function ffMatchUrl(id: string, slug?: string | null): string {
  return `${FF_HOST}/partidos/${slug ? `${id}-${slug}` : id}`;
}

/**
 * El enlace de un partido tal cual viene del calendario, ya absoluto: la fuente
 * lo publica unas veces entero y otras como ruta.
 */
export function ffFixtureUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  return `${FF_HOST}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** El mercado: subidas, bajadas y valores del día. */
export const FF_MARKET_URL = `${FF_HOST}/analytics/laliga-fantasy/mercado`;

/** Las alineaciones probables de una jornada. */
export function ffLineupsUrl(round?: number | null): string {
  return `${FF_HOST}/laliga/posibles-alineaciones${round ? `/${round}` : ""}`;
}

/** El parte de lesionados de toda la liga. */
export const FF_INJURED_URL = `${FF_HOST}/laliga/lesionados`;

/**
 * La clasificación de LaLiga. Es el destino de la pantalla de equipos: en
 * futbolfantasy no hay índice de clubes, sólo la ficha de cada uno.
 */
export const FF_STANDINGS_URL = `${FF_HOST}/laliga/clasificacion`;

/**
 * Tono de la variación de precio según su tamaño. Cinco escalones por lado:
 * de un verde pálido para calderilla a uno saturado para el millón. Así se ve
 * de un vistazo quién se ha movido de verdad sin leer la cifra.
 */
export function priceTone(diff: number): { bg: string; ink: string; label: string } {
  const abs = Math.abs(diff);
  const step = abs >= 1_000_000 ? 4 : abs >= 750_000 ? 3 : abs >= 500_000 ? 2 : abs >= 300_000 ? 1 : 0;

  const up = [
    { bg: "#eafaf0", ink: "#166534", label: "sube poco" },
    { bg: "#d3f5e0", ink: "#166534", label: "sube" },
    { bg: "#a9ebc6", ink: "#14532d", label: "sube bastante" },
    { bg: "#6fdca4", ink: "#0d3b22", label: "sube mucho" },
    { bg: "#16a34a", ink: "#ffffff", label: "subidón" },
  ];
  const down = [
    { bg: "#fdeceb", ink: "#b3261e", label: "baja poco" },
    { bg: "#fbd9d6", ink: "#b3261e", label: "baja" },
    { bg: "#f7b4ae", ink: "#7f1d1d", label: "baja bastante" },
    { bg: "#f08a80", ink: "#5c1512", label: "baja mucho" },
    { bg: "#dc2626", ink: "#ffffff", label: "desplome" },
  ];

  return diff > 0 ? up[step] : down[step];
}

export function oddsTone(probability: number): OddsTone {
  if (probability >= 95) return { color: "#b06cff", ink: "#12001f", label: "Fijo" };
  if (probability >= 90) return { color: "#3d9bff", ink: "#001528", label: "Casi seguro" };
  if (probability >= 65) return { color: "#35d07f", ink: "#00200f", label: "Probable" };
  if (probability > 50) return { color: "#a8d94a", ink: "#131c00", label: "Puede jugar" };
  if (probability > 40) return { color: "#ffc531", ink: "#1f1400", label: "Duda" };
  if (probability > 25) return { color: "#ff8a3d", ink: "#210c00", label: "Poco probable" };
  return { color: "#ff4d42", ink: "#210300", label: "Muy difícil" };
}
