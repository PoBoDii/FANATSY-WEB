/**
 * La API de Fantasy ha ido cambiando nombres de campo entre versiones
 * (`points` → `teamPoints`, jugador plano → `playerMaster` anidado, listas
 * sueltas → envueltas en `elements`). Aquí lo aplanamos todo a un modelo
 * estable para que las vistas no tengan que saber nada de eso.
 */

/** EN = entrenador: en Fantasy también se fichan y se alinean. */
export type Position = "PT" | "DF" | "MC" | "DL" | "EN" | "?";

export type PlayerStatus = "ok" | "injured" | "doubtful" | "suspended" | "out";

export type Player = {
  id: string;
  /** Apodo corto: "A. Herrero". Es lo que se enseña. */
  name: string;
  /** Nombre completo: "Alfonso Herrero". Se usa para cruzar con otras fuentes. */
  fullName: string;
  /** Slug de LaLiga: "a-herrero". */
  slug: string;
  position: Position;
  positionId: number;
  status: PlayerStatus;
  clubName: string;
  clubBadge: string | null;
  image: string | null;
  marketValue: number;
  points: number;
  averagePoints: number;
  /**
   * Puntos de la temporada anterior. Es el único indicio de rendimiento
   * mientras la liga no ha empezado y todos van a cero.
   */
  lastSeasonPoints?: number;
  /** Sólo presente dentro de una alineación. */
  inLineup?: boolean;
  /** Puja/precio de venta si viene del mercado. */
  salePrice?: number;
  /** Cláusula de rescisión. */
  buyoutClause?: number;
  /**
   * Hasta cuándo está blindado. Mientras no se pase esta fecha nadie puede
   * pagar la cláusula; a partir de ella, el jugador queda expuesto.
   */
  buyoutUnlockAt?: string | null;
  /** Delta de valor en las últimas 24h, si la API lo trae. */
  valueDelta?: number;
};

export type Manager = {
  teamId: string;
  userId: string | null;
  name: string;
  avatar: string | null;
  points: number;
  weekPoints: number | null;
  teamValue: number;
  position: number;
  isMe: boolean;
};

export type MarketItem = {
  id: string;
  player: Player;
  /** null = lo saca el sistema, si no es el manager que lo vende. */
  sellerName: string | null;
  sellerTeamId: string | null;
  price: number;
  expiresAt: string | null;
  bids: number;
  /** Lo que he pujado yo, si he pujado. */
  myBid: number | null;
};

export type ActivityEntry = {
  id: string;
  kind: "signing" | "sale" | "clause" | "join" | "other";
  /** Crudo, por si aparece un tipo aún sin mapear (se enseña en la vista). */
  typeId: number;
  playerName: string | null;
  playerId: string | null;
  fromUserId: string | null;
  toUserId: string | null;
  amount: number | null;
  date: string | null;
};

/* ------------------------------------------------------------------ helpers */

type Any = Record<string, any>;

const asObj = (v: unknown): Any => (v && typeof v === "object" ? (v as Any) : {});

/** Saca un array de una respuesta, venga suelto o envuelto. */
export function toList(raw: unknown): Any[] {
  if (Array.isArray(raw)) return raw as Any[];
  const o = asObj(raw);
  for (const key of ["elements", "data", "items", "results", "leagues", "players", "teams"]) {
    if (Array.isArray(o[key])) return o[key] as Any[];
  }
  return [];
}

/** Primer valor definido de una lista de rutas tipo "a.b.c". */
function pick<T = any>(src: Any, paths: string[], fallback: T): T {
  for (const path of paths) {
    let cur: any = src;
    for (const seg of path.split(".")) {
      if (cur == null) break;
      cur = cur[seg];
    }
    if (cur !== undefined && cur !== null && cur !== "") return cur as T;
  }
  return fallback;
}

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const POSITIONS: Record<number, Position> = { 1: "PT", 2: "DF", 3: "MC", 4: "DL", 5: "EN" };

export const POSITION_LABEL: Record<Position, string> = {
  PT: "Portero",
  DF: "Defensa",
  MC: "Centrocampista",
  DL: "Delantero",
  EN: "Entrenador",
  "?": "Sin posición",
};

function toStatus(raw: unknown): PlayerStatus {
  const s = String(raw ?? "ok").toLowerCase();
  if (s.includes("injur") || s.includes("lesion")) return "injured";
  if (s.includes("doubt") || s.includes("duda") || s.includes("warned")) return "doubtful";
  if (s.includes("suspend") || s.includes("sancion")) return "suspended";
  if (s.includes("out") || s.includes("unknown")) return "out";
  return "ok";
}

/* ---------------------------------------------------------------- entidades */

export function toPlayer(raw: unknown): Player {
  const root = asObj(raw);
  // En plantillas y mercado el jugador real cuelga de `playerMaster`; el nodo
  // exterior es la relación jugador↔equipo (con cláusula, precio de venta...).
  const p = asObj(root.playerMaster ?? root.player ?? root);
  const rel = root === p ? {} : root;

  const positionId = num(pick(p, ["positionId", "position"], 0));

  return {
    id: String(pick(p, ["id", "playerId"], pick(rel, ["playerMasterId", "id"], ""))),
    name: pick(p, ["nickname", "name", "playerName"], "Sin nombre"),
    fullName: pick(p, ["name", "nickname", "playerName"], ""),
    slug: pick(p, ["slug"], ""),
    position: POSITIONS[positionId] ?? "?",
    positionId,
    status: toStatus(pick(p, ["playerStatus", "status"], "ok")),
    clubName: pick(p, ["team.name", "team.shortName", "teamName"], "—"),
    clubBadge: pick<string | null>(p, ["team.badgeColor", "team.badgeWhite", "team.badge"], null),
    image: pick<string | null>(
      p,
      ["images.transparent.256x256", "images.player", "images.big", "image", "photo"],
      null,
    ),
    marketValue: num(pick(p, ["marketValue", "value", "price"], 0)),
    points: num(pick(p, ["points", "totalPoints"], 0)),
    averagePoints: num(pick(p, ["averagePoints", "avgPoints", "average"], 0)),
    lastSeasonPoints: num(pick(p, ["lastSeasonPoints"], 0)) || undefined,
    buyoutClause: num(pick(rel, ["buyoutClause", "clause"], 0)) || undefined,
    buyoutUnlockAt: pick<string | null>(
      rel,
      ["buyoutClauseLockedEndTime", "buyoutClauseLockedEnd"],
      null,
    ),
    salePrice: num(pick(rel, ["salePrice", "price"], 0)) || undefined,
    valueDelta: num(pick(p, ["lastMarketValueDiff", "marketValueDiff", "valueDiff"], 0)) || undefined,
  };
}

/**
 * Un elemento de `/v5/leagues/{id}/teams`: el equipo trae ya anidado su
 * `manager`, su `position` y sus `fixturePoints` (los de la jornada en curso).
 */
export function toManager(raw: unknown, index: number, myTeamId: string | null): Manager {
  const root = asObj(raw);
  const team = asObj(root.team ?? root);
  const managerRaw = root.manager ?? team.manager;
  const manager = typeof managerRaw === "string" ? { managerName: managerRaw } : asObj(managerRaw);

  const teamId = String(pick(root, ["id", "teamId"], pick(team, ["id"], "")));

  return {
    teamId,
    userId: pick<string | null>(manager, ["id"], pick(root, ["managerId", "userId"], null)),
    name: pick(
      manager,
      ["managerName", "name", "nickname"],
      pick(team, ["name", "teamName"], `Manager ${index + 1}`),
    ),
    avatar: pick<string | null>(manager, ["avatar", "image", "avatarUrl"], null),
    points: num(pick(root, ["teamPoints", "points"], 0)),
    weekPoints: (() => {
      const w = pick<unknown>(root, ["fixturePoints", "weekPoints", "currentWeekPoints"], null);
      return w === null ? null : num(w);
    })(),
    teamValue: num(pick(root, ["teamValue", "value"], 0)),
    position: num(pick(root, ["position", "rank"], index + 1), index + 1),
    isMe: Boolean(myTeamId) && teamId === myTeamId,
  };
}

export function toMarketItem(raw: unknown, myTeamId?: string | null): MarketItem {
  const root = asObj(raw);
  const seller = asObj(root.sellerTeam ?? root.seller);
  const sellerManager =
    typeof seller.manager === "string" ? { managerName: seller.manager } : asObj(seller.manager);

  return {
    id: String(pick(root, ["id", "marketId"], "")),
    player: toPlayer(root.playerMaster ?? root.player ?? root),
    sellerName: pick<string | null>(sellerManager, ["managerName", "name"], null),
    sellerTeamId: pick<string | null>(seller, ["id"], null),
    price: num(pick(root, ["salePrice", "price", "playerMaster.marketValue"], 0)),
    expiresAt: pick<string | null>(root, ["expirationDate", "expireDate", "endDate"], null),
    bids: num(pick(root, ["numberOfBids", "bids.length", "offers.length"], 0)),
    myBid: myBidOf(root, myTeamId ?? null),
  };
}

/**
 * Mi puja sobre un jugador del mercado. La API no la expone con un nombre
 * fijo, así que se buscan las formas conocidas: un campo directo o una entrada
 * mía dentro de la lista de pujas.
 */
function myBidOf(root: Any, myTeamId: string | null): number | null {
  // Lo habitual: cuando has pujado, el elemento trae un `bid` con tu oferta.
  const direct = pick<unknown>(
    root,
    ["bid.money", "bid.amount", "myBid", "userBid", "ownBid", "bidAmount"],
    null,
  );
  if (direct !== null) return num(direct) || null;

  if (!myTeamId) return null;
  const list = [root.bids, root.offers].find(Array.isArray) as Any[] | undefined;
  if (!list) return null;

  const mine = list.find((bid) => {
    const team = String(pick(bid, ["teamId", "team.id", "buyerTeamId"], ""));
    return team === myTeamId;
  });
  return mine ? num(pick(mine, ["amount", "money", "price"], 0)) || null : null;
}

/**
 * Entrada de `/v5/leagues/{id}/activity`. Es un feed escueto: identifica al
 * autor por `user1Id` (y al contrario por `user2Id`), no por nombre, así que
 * los nombres se resuelven fuera con el listado de equipos.
 *
 * Los `activityTypeId` no están documentados; sólo se mapean los que se han
 * podido observar y el resto cae en un rótulo genérico en vez de inventarse.
 */
const ACTIVITY_KINDS: Record<number, ActivityEntry["kind"]> = {
  9: "join",
};

export function toActivity(raw: unknown, index: number): ActivityEntry {
  const root = asObj(raw);
  const typeId = num(pick(root, ["activityTypeId"], -1), -1);

  // Formatos antiguos traían el tipo como texto; si aparece, se respeta.
  const typeText = String(pick(root, ["operation", "type", "kind"], "")).toLowerCase();
  const fromText: ActivityEntry["kind"] | null = typeText.includes("clause")
    ? "clause"
    : typeText.includes("sell") || typeText.includes("sale")
      ? "sale"
      : typeText.includes("buy") || typeText.includes("sign") || typeText.includes("transfer")
        ? "signing"
        : null;

  const player = asObj(root.player ?? root.playerMaster);

  return {
    id: String(pick(root, ["id"], `act-${index}`)),
    kind: fromText ?? ACTIVITY_KINDS[typeId] ?? "other",
    typeId,
    playerName: pick<string | null>(player, ["nickname", "name"], null),
    playerId: pick<string | null>(player, ["id"], null),
    fromUserId: (() => {
      const v = pick<unknown>(root, ["user1Id", "fromUserId"], null);
      return v === null ? null : String(v);
    })(),
    toUserId: (() => {
      const v = pick<unknown>(root, ["user2Id", "toUserId"], null);
      return v === null ? null : String(v);
    })(),
    amount: (() => {
      const a = pick<unknown>(root, ["amount", "price", "salePrice"], null);
      return a === null ? null : num(a);
    })(),
    date: pick<string | null>(root, ["createdAt", "date", "operationDate"], null),
  };
}

/** Extrae la lista de jugadores de la respuesta de un equipo. */
export function playersOfTeam(raw: unknown): Player[] {
  const root = asObj(raw);
  const list =
    (Array.isArray(root.players) && root.players) ||
    (Array.isArray(root.playersTeam) && root.playersTeam) ||
    (Array.isArray(root.squad) && root.squad) ||
    toList(raw);
  return list.map(toPlayer).filter((p) => p.id);
}

/**
 * La alineación NO llega como lista plana: viene en
 * `formation.{goalkeeper,defender,midfield,striker,coach}` más `bench`, y la
 * disposición numérica en `formation.tacticalFormation` (p. ej. [4,4,2]).
 */
export function lineupPlayers(raw: unknown): { starters: Player[]; bench: Player[] } {
  const formation = asObj(asObj(raw).formation ?? raw);
  const lines = ["goalkeeper", "defender", "midfield", "striker"];

  const starters = lines
    .flatMap((line) => (Array.isArray(formation[line]) ? (formation[line] as Any[]) : []))
    .map(toPlayer)
    .filter((p) => p.id);

  const benchRaw = formation.bench;
  const bench = (
    Array.isArray(benchRaw)
      ? benchRaw
      : benchRaw && typeof benchRaw === "object"
        ? Object.values(benchRaw as Any).flatMap((v) => (Array.isArray(v) ? v : [v]))
        : []
  )
    .map(toPlayer)
    .filter((p) => p.id);

  return { starters, bench };
}

/** "4-4-2" a partir de `tacticalFormation`. */
export function tacticalFormation(raw: unknown): string | null {
  const formation = asObj(asObj(raw).formation ?? raw);
  const tactical = formation.tacticalFormation;
  return Array.isArray(tactical) && tactical.length > 0 ? tactical.join("-") : null;
}

/** Datos de cabecera de un equipo (nombre del manager, valor, saldo). */
export function teamHeader(raw: unknown) {
  const root = asObj(raw);
  const managerRaw = root.manager;
  const manager =
    typeof managerRaw === "string" ? { managerName: managerRaw } : asObj(managerRaw);

  return {
    id: String(pick(root, ["id", "teamId"], "")),
    // En /v3/leagues/{l}/teams/{t} no viene el nombre del manager (sólo
    // `managerId`); llega por /v5/.../teams y se pasa aparte.
    managerName: pick<string | null>(manager, ["managerName", "name"], null),
    avatar: pick<string | null>(manager, ["avatar", "image"], null),
    managerId: pick<string | null>(root, ["managerId"], null),
    points: num(pick(root, ["teamPoints", "points"], 0)),
    teamValue: num(pick(root, ["teamValue", "value"], 0)),
    teamMoney: num(pick(root, ["teamMoney", "money", "balance"], 0)),
    playersNumber: num(pick(root, ["playersNumber"], 0)),
  };
}

/** Historial de valor de mercado → serie [{date, value}]. */
export function valueHistory(raw: unknown): { date: string; value: number }[] {
  const root = asObj(raw);
  const list = toList(
    root.marketValues ?? root.marketValue ?? root.values ?? root.history ?? raw,
  );
  return list
    .map((e) => ({
      date: String(pick(e, ["date", "day", "timestamp"], "")),
      value: num(pick(e, ["marketValue", "value", "amount"], 0)),
    }))
    .filter((e) => e.date && e.value > 0);
}

/** Puntos por jornada → serie [{week, points}]. */
export function pointsHistory(raw: unknown): { week: number; points: number }[] {
  const root = asObj(raw);
  const list = toList(root.playerStats ?? root.stats ?? root.weeks ?? []);
  return list
    .map((e) => ({
      week: num(pick(e, ["weekNumber", "week"], 0)),
      points: num(pick(e, ["totalPoints", "points"], 0)),
    }))
    .filter((e) => e.week > 0)
    .sort((a, b) => a.week - b.week);
}
