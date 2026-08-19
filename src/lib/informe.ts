import { fantasy, safe } from "./api";
import { getFf, normalizeName } from "./futbolfantasy";
import { TEAMS, fixturesByClub, getFixtures, isLeagueFixture, type Fixture } from "./equipos";
import {
  playersOfTeam,
  teamHeader,
  toList,
  toManager,
  toMarketItem,
  type Player,
} from "./normalize";
import { ffPhoto, type FfPlayer } from "./odds";
import { buildCandidate, outOfTen, scoreClause, scoreSquad } from "./fichajes";
import { bestEleven, rate, type Gap } from "./once-ideal";

/** Nombre largo de futbolfantasy → sigla de puesto del resto de la web. */
const POS_FROM_FF: Record<string, string> = {
  Portero: "PT",
  Defensa: "DF",
  Mediocampista: "MC",
  Delantero: "DL",
  Entrenador: "EN",
};

/**
 * El informe del día.
 *
 * ── Qué es ────────────────────────────────────────────────────────────────
 *
 * Un repaso de lo único que hay que decidir hoy: qué se me abre, qué se me
 * rompe, a quién puedo fichar y a quién debería soltar. Es la misma información
 * que ya está repartida por la web, pero ordenada por urgencia y recortada a lo
 * que de verdad exige una acción — un informe que lo dice todo no dice nada.
 *
 * ── Por qué vive aparte de la página ──────────────────────────────────────
 *
 * Porque tiene dos salidas: la página `/informe` y, más adelante, el mensaje
 * diario de Telegram. Las dos parten de este mismo objeto, que es plano y
 * serializable a propósito para poder mandarlo tal cual.
 */

/* ------------------------------------------------------------------ tipos */

export type ReportPlayer = {
  id: string | null;
  name: string;
  position: string;
  photo: string | null;
  club: string | null;
  probability: number | null;
  value: number;
  /** Variación de valor de hoy. */
  diff: number | null;
  /** Días seguidos subiendo (+) o bajando (−). */
  streak: number;
  points: number;
  average: number;
  clause: number | null;
  /** Cuándo se abre; null si ya está abierta o no tiene. */
  opensAt: string | null;
  owner: string | null;
  ownerTeamId: string | null;
  /** Nota de 0 a 10 cuando la sección la calcula. */
  score: number | null;
  /** Una línea que explica por qué está en la lista. */
  why: string;
};

export type ReportSection = {
  key: string;
  title: string;
  /** Qué hay que hacer con esto, en una frase. */
  lead: string;
  players: ReportPlayer[];
  /** Para secciones sin jugadores (avisos, calendario…). */
  notes?: string[];
  /** Rojo = urgente, ámbar = conviene mirarlo, verde = oportunidad. */
  tone: "urgente" | "aviso" | "oportunidad" | "neutral";
  /**
   * La línea del jugador ya lo dice todo y el `por qué` sólo repetiría lo
   * mismo. En el mensaje de Telegram, donde cada renglón cuenta, se omite.
   */
  compact?: boolean;
};

export type ReportMatch = {
  id: string;
  home: { name: string; badge: string | null };
  away: { name: string; badge: string | null };
  /** "17:00h", ya sin el día. */
  time: string;
  /** Cuántos jugadores míos se juegan los puntos en ese partido. */
  mine: number;
};

export type Report = {
  /** ISO del momento en que se generó. */
  builtAt: string;
  league: string;
  manager: string;
  money: number;
  /** Titulares del día, lo primero que se lee. */
  headlines: string[];
  /** Partidos de liga de hoy, con escudos y hora. */
  today: ReportMatch[];
  /**
   * El aviso de arriba del todo, cuando lo hay: que hoy empieza la jornada o
   * que hoy se cierran las cláusulas.
   */
  alert: { kind: "jornada" | "cierre"; text: string } | null;
  sections: ReportSection[];
};

/* ------------------------------------------------------------ utilidades */

const DAY = 24 * 3600 * 1000;

/** Cuántos días naturales faltan hasta una fecha (0 = hoy, 1 = mañana). */
function daysUntil(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = new Date(at);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / DAY);
}

/**
 * La fecha de un partido, que la fuente publica como texto.
 *
 * Llega en formatos como "Sab 15/08 · 19:30h" o "Dom 16/08 17:00h": día y mes
 * sin año. Se le pone el año en curso y, si con eso el partido cayera más de
 * seis meses atrás, el siguiente — es lo que pasa en enero con el calendario
 * que arranca en agosto.
 */
function kickoffTime(text: string, now: number): number | null {
  const day = /(\d{1,2})\/(\d{1,2})/.exec(text);
  if (!day) return null;
  const time = /(\d{1,2}):(\d{2})/.exec(text);

  const year = new Date(now).getFullYear();
  const at = new Date(
    year,
    Number(day[2]) - 1,
    Number(day[1]),
    time ? Number(time[1]) : 12,
    time ? Number(time[2]) : 0,
  ).getTime();

  if (at < now - 180 * DAY) {
    return new Date(
      year + 1,
      Number(day[2]) - 1,
      Number(day[1]),
      time ? Number(time[1]) : 12,
      time ? Number(time[2]) : 0,
    ).getTime();
  }
  return at;
}

/** Un importe a secas, sin signo: para precios y cláusulas. */
const cash = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(2).replace(".", ",")} M€`;
  return `${Math.round(abs / 1000)} k€`;
};

/** Una variación, con su signo delante. */
const fmt = (v: number): string => {
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : v > 0 ? "+" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2).replace(".", ",")} M€`;
  return `${sign}${Math.round(abs / 1000)} k€`;
};

/**
 * Lo que hace interesante a un jugador cualquiera, de 0 a 10.
 *
 * Es la versión corta de lo que usa la sección de fichajes: manda que juegue,
 * después lo que viene puntuando y lo que cuesta cada punto. Sirve para decidir
 * qué entra en el informe y qué se queda fuera, que es el trabajo de verdad:
 * un informe con los 700 jugadores de la liga no lo lee nadie.
 */
function interest(player: Player, odds: FfPlayer | null): number {
  const p = odds?.probability;
  if (player.status === "injured" || player.status === "suspended") return 0;
  if (p === 0) return 0;

  const plays = p == null ? 0.5 : p / 100;
  const average =
    player.averagePoints > 0 ? player.averagePoints : (player.lastSeasonPoints ?? 0) / 38;
  const form = Math.min(1, average / 7);
  const perMillion = player.marketValue > 0 ? average / (player.marketValue / 1_000_000) : 0;
  const cheap = Math.min(1, perMillion / 0.8);

  return Math.round((plays * (0.5 + 0.3 * form + 0.2 * cheap)) * 100) / 10;
}

function toReportPlayer(
  player: Player,
  odds: FfPlayer | null,
  extra: { score?: number | null; why: string; owner?: string | null; ownerTeamId?: string | null },
): ReportPlayer {
  const unlockAt = player.buyoutUnlockAt ?? null;
  const open = !unlockAt || new Date(unlockAt).getTime() <= Date.now();

  return {
    id: player.id || null,
    name: player.name,
    position: player.position,
    photo: player.image,
    club: player.clubName !== "—" ? player.clubName : (odds?.teamName ?? null),
    probability: odds?.probability ?? null,
    value: player.marketValue,
    diff: odds?.diff ?? null,
    streak: odds?.streak ?? 0,
    points: player.points,
    average: player.averagePoints,
    clause: player.buyoutClause ?? null,
    opensAt: open ? null : unlockAt,
    owner: extra.owner ?? null,
    ownerTeamId: extra.ownerTeamId ?? null,
    score: extra.score ?? null,
    why: extra.why,
  };
}

/* ------------------------------------------------------------ el informe */

export async function buildReport(
  leagueId: string,
  myTeamId: string | null,
  leagueName: string,
  now = Date.now(),
): Promise<Report> {
  const [{ data: teamsRaw }, { data: myTeamRaw }, { data: marketRaw }, ff] = await Promise.all([
    safe(fantasy.leagueTeams(leagueId)),
    myTeamId ? safe(fantasy.team(leagueId, myTeamId)) : Promise.resolve({ data: null, error: null }),
    safe(fantasy.market(leagueId)),
    getFf(),
  ]);

  const header = teamHeader(myTeamRaw ?? {});
  const mine = playersOfTeam(myTeamRaw ?? {});

  /** Todos los de la liga que no son míos, con su dueño. */
  const rivals: { player: Player; owner: { name: string; teamId: string } }[] = [];
  toList(teamsRaw).forEach((raw, i) => {
    const manager = toManager(raw, i, myTeamId);
    if (manager.isMe) return;
    for (const player of playersOfTeam(raw)) {
      rivals.push({ player, owner: { name: manager.name, teamId: manager.teamId } });
    }
  });

  const market = toList(marketRaw)
    .map((raw) => toMarketItem(raw, myTeamId))
    // Sólo la lista diaria del juego: lo que vende un manager va por cláusula.
    .filter((item) => item.player.id && !item.sellerTeamId)
    .filter((item) => item.player.position !== "EN");

  const everyone = [...mine, ...rivals.map((r) => r.player), ...market.map((m) => m.player)];
  const oddsOf = (player: Player) => ff.get(player);
  const fixturesOf = await fixturesByClub(everyone, oddsOf);

  const budget = { money: header.teamMoney ?? 0 };
  const sections: ReportSection[] = [];
  const headlines: string[] = [];

  /* ---------------------------------------------------- lo que juega hoy */

  /**
   * Todos los partidos de liga, no sólo los de mis jugadores.
   *
   * El calendario de cada club trae los mismos encuentros repetidos —uno por
   * cada equipo—, así que se juntan por id. De ahí salen tres cosas: los de
   * hoy, cuándo arranca la próxima jornada y, con eso, cuándo se cierran las
   * cláusulas.
   */
  const calendars = await Promise.all(TEAMS.map((team) => getFixtures(team.slug)));
  const allFixtures = new Map<string, Fixture>();
  for (const { next } of calendars) {
    for (const fixture of next) {
      if (isLeagueFixture(fixture)) allFixtures.set(fixture.id, fixture);
    }
  }

  /** Cuántos jugadores míos hay en cada club, para marcar los partidos. */
  const mineByClub = new Map<string, number>();
  for (const player of mine) {
    const name = normalizeName(player.clubName ?? "") || normalizeName(oddsOf(player)?.teamName ?? "");
    if (name) mineByClub.set(name, (mineByClub.get(name) ?? 0) + 1);
  }
  const mineIn = (club: string) => {
    const key = normalizeName(club);
    for (const [name, count] of mineByClub) {
      if (name === key || name.includes(key) || key.includes(name)) return count;
    }
    return 0;
  };

  const today: ReportMatch[] = [];

  /**
   * Las jornadas que quedan por jugar, con la hora de su primer partido.
   *
   * `getFixtures` sólo devuelve como próximos los que no se han jugado, así que
   * una jornada con menos de diez pendientes es una jornada **ya empezada** —y
   * en ella las cláusulas están cerradas hace rato—. Sin esta comprobación el
   * informe anunciaba "hoy empieza la jornada" el domingo de una jornada que
   * había arrancado el viernes.
   */
  const rounds = new Map<string, { first: number; pending: number }>();

  for (const fixture of allFixtures.values()) {
    const at = kickoffTime(fixture.date, now);
    if (at === null) continue;

    const round = rounds.get(fixture.phase);
    if (round) {
      round.pending++;
      round.first = Math.min(round.first, at);
    } else {
      rounds.set(fixture.phase, { first: at, pending: 1 });
    }

    if (daysUntil(new Date(at).toISOString(), now) === 0) {
      today.push({
        id: fixture.id,
        home: fixture.home,
        away: fixture.away,
        time: fixture.date.split(/\s+/).pop() ?? fixture.date,
        mine: mineIn(fixture.home.name) + mineIn(fixture.away.name),
      });
    }
  }

  today.sort((a, b) => a.time.localeCompare(b.time));

  /** La próxima jornada entera: diez partidos y ninguno jugado todavía. */
  const nextRound = [...rounds.values()]
    .filter((r) => r.pending >= 10 && r.first > now)
    .sort((a, b) => a.first - b.first)[0];

  /**
   * El aviso de cabecera.
   *
   * Las cláusulas se cierran **24 horas antes del primer partido** de la
   * jornada: es el momento en que hay que tenerlo todo decidido, y por eso va
   * arriba del todo y no enterrado en una sección.
   */
  let alert: Report["alert"] = null;
  if (nextRound) {
    const deadline = nextRound.first - DAY;
    const hoursLeft = (deadline - now) / 3_600_000;

    if (hoursLeft > 0 && hoursLeft <= 24) {
      const hora = new Date(deadline).toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      });
      alert = { kind: "cierre", text: `Hoy a las ${hora} se cierran los clausulazos` };
    } else if (daysUntil(new Date(nextRound.first).toISOString(), now) === 0) {
      alert = { kind: "jornada", text: "Hoy empieza la jornada: deja tu once puesto" };
    }
  }

  if (alert) headlines.push(alert.text);
  if (today.length > 0) {
    const withMine = today.filter((m) => m.mine > 0).length;
    headlines.push(
      withMine > 0
        ? `${today.length} partidos hoy, ${withMine} con jugadores tuyos`
        : `${today.length} partidos hoy, ninguno tuyo`,
    );
  }

  /* ------------------------------------------------------- las cláusulas */

  /**
   * El orden del informe lo marca el reloj, no la importancia.
   *
   * Lo que vence hoy va antes que lo que vence mañana, y lo de los rivales
   * antes que lo mío: para lo suyo hay que actuar hoy o se lo lleva otro; para
   * lo mío basta con blindar antes de que se abra. Esa es toda la lógica del
   * orden de esta página.
   */
  const candidates = rivals
    .map((r) => buildCandidate(r.player, r.owner, oddsOf(r.player), fixturesOf(r.player), budget, now))
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const rivalClause = (days: number) =>
    candidates
      .filter((c) => !c.isOpen && daysUntil(c.opensAt, now) === days)
      .map((c) => ({ c, score: outOfTen(Math.max(scoreSquad(c).score, scoreClause(c).score)) }))
      .sort((a, b) => b.score - a.score);

  const opensToday = rivalClause(0);
  const opensTomorrow = rivalClause(1);

  /**
   * Estas dos secciones salen siempre, tengan o no jugadores.
   *
   * "Hoy no se abre ninguna" es información: quiere decir que no hay que estar
   * pendiente del reloj. Si la sección desapareciera, habría que fiarse de que
   * no está por que no hay nada y no por que algo falló al calcularla.
   */
  if (opensToday.length === 0) {
    sections.push({
      key: "abren-hoy",
      title: "Hoy no se abre ninguna cláusula",
      lead: "Ningún jugador de la liga queda expuesto hoy. Nada que vigilar por ese lado.",
      tone: "neutral",
      players: [],
    });
  } else {
    const worth = opensToday.filter((x) => x.score >= 4).length;
    headlines.push(
      worth > 0
        ? `Hoy se abren ${opensToday.length} cláusulas rivales, ${worth} interesantes`
        : `Hoy se abren ${opensToday.length} cláusulas rivales`,
    );

    sections.push({
      key: "abren-hoy",
      title: "Hoy se les abre la cláusula",
      lead: "En cuanto venza el blindaje se las puede pagar cualquiera. Están todas; las de nota alta son las que valen la pena.",
      tone: "oportunidad",
      players: opensToday.map(({ c, score }) =>
        toReportPlayer(c.player, c.odds, {
          score,
          owner: c.owner.name,
          ownerTeamId: c.owner.teamId,
          why: `${cash(c.clause)} · +${Math.round(c.premiumPct * 100)}% sobre su valor${
            c.affordable ? "" : " · no te llega el saldo"
          }`,
        }),
      ),
    });
  }

  const myClauses = (days: number[]) =>
    mine
      .map((player) => ({ player, days: daysUntil(player.buyoutUnlockAt ?? null, now) }))
      .filter((x) => x.days !== null && days.includes(x.days))
      .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));

  const mineToday = myClauses([0]);
  if (mineToday.length > 0) {
    headlines.push(`Se te abren ${mineToday.length} cláusulas HOY`);
    sections.push({
      key: "mis-clausulas-hoy",
      title: "Hoy se abren tus cláusulas",
      lead: "A partir de esa hora cualquiera puede pagarlas. Si quieres conservarlos, blinda antes.",
      tone: "urgente",
      players: mineToday.map(({ player }) =>
        toReportPlayer(player, oddsOf(player), {
          why: `cláusula ${cash(player.buyoutClause ?? 0)}`,
        }),
      ),
    });
  }

  if (opensTomorrow.length === 0) {
    sections.push({
      key: "abren-manana",
      title: "Mañana tampoco se abre ninguna",
      lead: "Nadie queda libre mañana, así que hoy no hay ninguna negociación urgente.",
      tone: "neutral",
      players: [],
    });
  } else {
    sections.push({
      key: "abren-manana",
      title: "Mañana se les abre la cláusula",
      lead: "Hoy es el día de hablar con su dueño: mañana ya se los lleva cualquiera.",
      tone: "aviso",
      players: opensTomorrow.slice(0, 8).map(({ c, score }) =>
        toReportPlayer(c.player, c.odds, {
          score,
          owner: c.owner.name,
          ownerTeamId: c.owner.teamId,
          why: `lo tiene ${c.owner.name} · ${cash(c.clause)}`,
        }),
      ),
    });
  }

  const mineSoon = myClauses([1, 2]);
  if (mineSoon.length > 0) {
    sections.push({
      key: "mis-clausulas-pronto",
      title: "Tus cláusulas de mañana y pasado",
      tone: "aviso",
      lead: "Todavía hay margen para blindarlas, pero el precio de blindar sube con el valor del jugador.",
      players: mineSoon.map(({ player, days }) =>
        toReportPlayer(player, oddsOf(player), {
          why: `${days === 1 ? "mañana" : "pasado mañana"} · ${cash(player.buyoutClause ?? 0)}`,
        }),
      ),
    });
  }

  /* ---------------------------------------------- clausulazos posibles */

  /**
   * A quién se puede clausular **ahora mismo**.
   *
   * Es la sección que responde a "¿y hoy qué puedo hacer?": de todos los
   * jugadores con la cláusula ya abierta, los que merecen el desembolso, sea
   * porque mejoran el once o porque van a seguir subiendo. Se puntúan por las
   * dos vías y manda la mejor de las dos, con una etiqueta que dice cuál es.
   */
  const doable = candidates
    .filter((c) => c.isOpen)
    .map((c) => {
      const squad = outOfTen(scoreSquad(c).score);
      const money = outOfTen(scoreClause(c).score);
      return { c, squad, money, score: Math.max(squad, money) };
    })
    .filter((x) => x.score >= 3.5)
    .sort((a, b) => b.score - a.score);

  if (doable.length === 0) {
    sections.push({
      key: "clausulazos",
      title: "Ningún clausulazo posible hoy",
      lead: "Toda la liga está blindada ahora mismo, o lo que hay abierto no compensa lo que cuesta.",
      tone: "neutral",
      players: [],
    });
  } else {
    const payable = doable.filter((x) => x.c.affordable).length;
    headlines.push(
      payable > 0
        ? `${payable} clausulazos a tu alcance ahora mismo`
        : `${doable.length} cláusulas abiertas, ninguna a tu alcance`,
    );

    sections.push({
      key: "clausulazos",
      title: "Clausulazos posibles ahora",
      lead: "Cláusula ya abierta: se paga y es tuyo. Marcados por lo que aportan al once o por lo que darían de reventa.",
      tone: "oportunidad",
      players: doable.slice(0, 8).map(({ c, squad, money, score }) => {
        const forSquad = squad >= money;
        return toReportPlayer(c.player, c.odds, {
          score,
          owner: c.owner.name,
          ownerTeamId: c.owner.teamId,
          why: `${cash(c.clause)}${c.affordable ? "" : " · no te llega"} · ${
            forSquad
              ? "para el once"
              : c.profit > 0
                ? `dejaría ${cash(c.profit)}`
                : "para revender"
          }`,
        });
      }),
    });
  }

  /* ------------------------------------------------- el mercado de hoy */

  const marketPicks = market
    .map((item) => ({ item, score: interest(item.player, oddsOf(item.player)) }))
    .filter((x) => x.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (marketPicks.length > 0) {
    sections.push({
      key: "mercado",
      compact: true,
      title: "Del mercado, esto vale la pena",
      lead: "De los libres de hoy, los que juegan y salen a cuenta. Del resto, ni una puja.",
      tone: "oportunidad",
      players: marketPicks.map(({ item, score }) =>
        toReportPlayer(item.player, oddsOf(item.player), {
          score,
          why: `sale por ${cash(item.price)}${item.bids ? ` · ${item.bids} pujas` : " · sin pujas"}`,
        }),
      ),
    });
  }

  /* ------------------------------------------ subidas y bajadas del día */

  /** Los nombres de futbolfantasy vienen normalizados en minúscula. */
  const titleCase = (name: string) =>
    name.replace(/(^|[\s'-])([a-záéíóúñ])/g, (_, sep, letter) => sep + letter.toUpperCase());

  const fromRow = (row: FfPlayer, why: string): ReportPlayer => ({
    // No son jugadores de mi liga, así que no tienen id de LaLiga con el que
    // abrir su ficha; la foto sí, que futbolfantasy la publica por su id.
    id: null,
    name: titleCase(row.displayName ?? row.name),
    position: POS_FROM_FF[row.position ?? ""] ?? "?",
    photo: ffPhoto(row.ffId),
    club: row.teamName,
    probability: row.probability,
    value: row.value,
    diff: row.diff,
    streak: row.streak,
    points: 0,
    average: 0,
    clause: null,
    opensAt: null,
    owner: null,
    ownerTeamId: null,
    score: null,
    why,
  });

  const movers = ff.all.filter((row) => row.diff !== null && Math.abs(row.diff) >= 100_000);

  const risers = [...movers].sort((a, b) => (b.diff ?? 0) - (a.diff ?? 0)).slice(0, 5);
  if (risers.length > 0) {
    sections.push({
      key: "suben-liga",
      compact: true,
      title: "Los que más suben hoy",
      lead: "De toda la liga, no sólo de tu grupo.",
      tone: "neutral",
      players: risers.map((row) =>
        fromRow(
          row,
          row.streak > 1 ? `${fmt(row.diff ?? 0)} · ${row.streak} días subiendo` : `${fmt(row.diff ?? 0)} hoy`,
        ),
      ),
    });
  }

  /**
   * Lo que sube en las plantillas de los rivales.
   *
   * Sólo lo destacable: si a un rival se le está revalorizando alguien de
   * golpe, o es un buen fichaje o va a costar más caro mañana.
   */
  const rivalRisers = rivals
    .map((r) => ({ r, odds: oddsOf(r.player) }))
    .filter((x) => (x.odds?.diff ?? 0) >= 300_000)
    .sort((a, b) => (b.odds?.diff ?? 0) - (a.odds?.diff ?? 0))
    .slice(0, 5);

  if (rivalRisers.length > 0) {
    sections.push({
      key: "suben-rivales",
      compact: true,
      title: "Suben en plantillas rivales",
      lead: "Cada día que pase, más caros de clausular.",
      tone: "neutral",
      players: rivalRisers.map(({ r, odds }) =>
        toReportPlayer(r.player, odds, {
          owner: r.owner.name,
          ownerTeamId: r.owner.teamId,
          why: `lo tiene ${r.owner.name}`,
        }),
      ),
    });
  }

  const fallers = [...movers].sort((a, b) => (a.diff ?? 0) - (b.diff ?? 0)).slice(0, 5);
  if (fallers.length > 0) {
    sections.push({
      key: "bajan-liga",
      compact: true,
      title: "Los que más bajan hoy",
      lead: "Si tienes alguno, cada día que pasa vale menos.",
      tone: "aviso",
      players: fallers.map((row) =>
        fromRow(
          row,
          row.streak < -1
            ? `${fmt(row.diff ?? 0)} · ${Math.abs(row.streak)} días bajando`
            : `${fmt(row.diff ?? 0)} hoy`,
        ),
      ),
    });
  }

  /* --------------------------------------------------- mi plantilla hoy */

  const myMoves = mine
    .map((player) => ({ player, odds: oddsOf(player) }))
    .filter((x) => Math.abs(x.odds?.diff ?? 0) >= 50_000)
    .sort((a, b) => (b.odds?.diff ?? 0) - (a.odds?.diff ?? 0));

  const myUp = myMoves.filter((x) => (x.odds?.diff ?? 0) > 0).slice(0, 4);
  const myDown = [...myMoves].reverse().filter((x) => (x.odds?.diff ?? 0) < 0).slice(0, 4);

  if (myUp.length > 0 || myDown.length > 0) {
    sections.push({
      key: "mi-plantilla",
      compact: true,
      title: "Tu plantilla hoy",
      lead: "Lo que se te ha movido. Los de abajo, si además no juegan, son candidatos a soltar.",
      tone: "neutral",
      players: [
        ...myUp.map(({ player, odds }) =>
          toReportPlayer(player, odds, { why: `${fmt(odds?.diff ?? 0)} hoy` }),
        ),
        ...myDown.map(({ player, odds }) =>
          toReportPlayer(player, odds, {
            why:
              (odds?.streak ?? 0) < -1
                ? `${fmt(odds?.diff ?? 0)} · ${Math.abs(odds!.streak)} días bajando`
                : `${fmt(odds?.diff ?? 0)} hoy`,
          }),
        ),
      ],
    });
  }

  /* ------------------------------------------------ bajas y qué fichar */

  const injured = mine.filter((p) => p.status === "injured" || p.status === "suspended");
  if (injured.length > 0) {
    headlines.push(`${injured.length} de los tuyos no pueden jugar`);
    sections.push({
      key: "bajas",
      title: "No te van a jugar",
      lead: "Ni los alinees ni cuentes con ellos para el once de esta jornada.",
      tone: "urgente",
      players: injured.map((player) =>
        toReportPlayer(player, oddsOf(player), {
          why: player.status === "injured" ? "lesionado" : "sancionado",
        }),
      ),
    });
  }

  /* --------------------------------------------- qué le falta a mi once */

  const rated = mine
    .filter((p) => p.position !== "EN")
    .map((p) => rate(p, oddsOf(p), fixturesOf(p)));
  const ideal = bestEleven(rated);

  if (ideal && ideal.gaps.length > 0) {
    const hole = ideal.gaps.find((g: Gap) => g.kind === "hueco");
    if (hole) headlines.push(hole.title);

    /**
     * A qué puestos hay que ir, y con nombres.
     *
     * De poco sirve decir "necesitas un defensa" sin enseñar cuáles se pueden
     * fichar hoy: se cruzan los huecos con las cláusulas abiertas o pagables
     * de ese mismo puesto.
     */
    const wanted = new Set(ideal.gaps.map((g: Gap) => g.position));
    const fixes = candidates
      .filter((c) => wanted.has(c.player.position) && (c.isOpen || c.opensSoon) && c.affordable)
      .map((c) => ({ c, score: outOfTen(scoreSquad(c).score) }))
      .filter((x) => x.score >= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    sections.push({
      key: "refuerzos",
      title: "Lo que le falta a tu once",
      lead: "Los puestos que hoy no puedes cubrir con garantías, y quién los taparía.",
      tone: ideal.gaps.some((g: Gap) => g.kind === "hueco") ? "urgente" : "aviso",
      notes: ideal.gaps.map((g: Gap) => `${g.title}. ${g.detail}`),
      players: fixes.map(({ c, score }) =>
        toReportPlayer(c.player, c.odds, {
          score,
          owner: c.owner.name,
          ownerTeamId: c.owner.teamId,
          why: `${cash(c.clause)} de cláusula · lo tiene ${c.owner.name}`,
        }),
      ),
    });
  }

  /* ------------------------------------------------------- la enfermería */

  /**
   * Las bajas, al final del todo.
   *
   * Antes esto era un aviso aparte que llegaba a cualquier hora; molestaba más
   * de lo que servía, porque una lesión no exige hacer nada en ese momento —lo
   * que exige es tenerla presente al montar el once—. Aquí, leída con el café,
   * está en su sitio.
   *
   * Sólo las que importan: las de alguien de la liga y las de los libres del
   * mercado, que son la trampa más cara que hay.
   */
  const enMercado = new Set(market.map((item) => ff.get(item.player)?.slug).filter(Boolean));

  const duenoDe = new Map<string, string>();
  for (const player of mine) {
    const slug = ff.get(player)?.slug;
    if (slug) duenoDe.set(slug, "TUYO");
  }
  for (const r of rivals) {
    const slug = ff.get(r.player)?.slug;
    if (slug && !duenoDe.has(slug)) duenoDe.set(slug, r.owner.name);
  }

  const bajas = [...ff.bajas.values()]
    .filter((baja) => duenoDe.has(baja.slug) || enMercado.has(baja.slug))
    .map((baja) => {
      const dueno = duenoDe.get(baja.slug) ?? "libre en el mercado";
      const hasta = baja.hasta ? ` · ${baja.hasta.replace(/^Baja /, "")}` : "";
      return {
        mio: dueno === "TUYO",
        // Las largas primero: son las que obligan a buscar recambio.
        dias: baja.dias ?? 0,
        texto: `${baja.name} · ${baja.motivo ?? "sin detalles"}${hasta} · ${
          dueno === "TUYO" ? "es tuyo" : dueno
        }`,
      };
    })
    .sort((a, b) => Number(b.mio) - Number(a.mio) || b.dias - a.dias);

  if (bajas.length > 0) {
    const mias = bajas.filter((b) => b.mio).length;

    sections.push({
      key: "bajas",
      title: "Lesionados y sancionados",
      lead:
        mias > 0
          ? `Tienes ${mias} tocado${mias === 1 ? "" : "s"}. Mira el once antes de que empiece.`
          : "Ninguno tuyo está tocado. Los de los demás, por si te interesa alguno.",
      tone: mias > 0 ? "aviso" : "neutral",
      compact: true,
      players: [],
      notes: bajas.slice(0, 20).map((b) => b.texto),
    });
  }

  if (headlines.length === 0) headlines.push("Día tranquilo: nada que exija moverse hoy");

  return {
    builtAt: new Date(now).toISOString(),
    league: leagueName,
    manager: header.managerName ?? "Tu equipo",
    money: budget.money,
    headlines,
    today,
    alert,
    sections,
  };
}
