import { fantasy, safe } from "./api";
import { getFf } from "./futbolfantasy";
import { TEAMS, getFixtures, isLeagueFixture } from "./equipos";
import { playersOfTeam, teamHeader, toList, toManager, toMarketItem, type Player } from "./normalize";
import type { FfPlayer } from "./odds";
import { buildCandidate, outOfTen, scoreClause, scoreSquad } from "./fichajes";
import { openLedger } from "./estado";

/**
 * Avisos al momento.
 *
 * ── Cómo evita llegar tarde ───────────────────────────────────────────────
 *
 * El reloj pasa cada diez minutos, pero los avisos no se atan a la pasada: se
 * disparan cuando **falta menos de X** para el suceso. Un aviso "a media hora"
 * se manda en cuanto quedan 40 minutos o menos, y la memoria de lo ya enviado
 * impide que se repita en las pasadas siguientes.
 *
 * La consecuencia es la que se buscaba: el aviso puede llegar con 40 minutos de
 * antelación en vez de 30, pero **nunca llega tarde**, ni siquiera si GitHub
 * retrasa un disparo un cuarto de hora.
 *
 * ── Y por qué van agrupados ───────────────────────────────────────────────
 *
 * Porque el primer día se abren cincuenta cláusulas a la vez. Todo lo que cae
 * en la misma pasada y es del mismo tipo se junta en un solo mensaje, con los
 * más interesantes arriba.
 */

/* ------------------------------------------------------------------ tipos */

export type Alerta = {
  /** Identifica el suceso: es lo que se recuerda para no repetirlo. */
  key: string;
  kind: "clausula-rival" | "clausula-mia" | "lesion" | "caida" | "mercado" | "jornada";
  /** Cuanto más alto, más arriba en el mensaje. */
  priority: number;
  text: string;
};

export type AlertReport = {
  checkedAt: string;
  /** Los mensajes ya montados, listos para mandar. */
  messages: string[];
  /** Cuántos avisos había, para el registro del cron. */
  count: number;
};

const MIN = 60_000;

/** Aviso "a media hora": salta en cuanto quedan 40 minutos o menos. */
const EARLY_RIVAL = 40 * MIN;
/** Aviso "a última hora": salta en cuanto quedan 8 minutos o menos. */
const LAST_CALL = 8 * MIN;
/** El de mis cláusulas se adelanta más: blindar lleva su tiempo. */
const EARLY_MINE = 70 * MIN;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cash = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(2).replace(".", ",")} M€`;
  return `${Math.round(abs / 1000)} k€`;
};

/** "en 6 min", "en 1 h 5 min". */
function timeTo(ms: number): string {
  const mins = Math.max(0, Math.round(ms / MIN));
  if (mins < 60) return `en ${mins} min`;
  return `en ${Math.floor(mins / 60)} h ${mins % 60} min`;
}

/* ------------------------------------------------------------ el chequeo */

export async function checkAlerts(
  leagueId: string,
  myTeamId: string | null,
  now = Date.now(),
  /**
   * Mirar sin gastar.
   *
   * Con esto puesto se calcula todo igual pero no se apunta nada como enviado,
   * que es lo que promete `?probar=1`. Antes lo apuntaba de todas formas: abrir
   * la previsualización una vez te dejaba sin los avisos de ese día.
   */
  soloMirar = false,
): Promise<AlertReport> {
  const ledger = await openLedger(now);
  const alerts: Alerta[] = [];

  const [{ data: teamsRaw }, { data: myTeamRaw }, { data: marketRaw }, ff] = await Promise.all([
    safe(fantasy.leagueTeams(leagueId)),
    myTeamId ? safe(fantasy.team(leagueId, myTeamId)) : Promise.resolve({ data: null, error: null }),
    safe(fantasy.market(leagueId)),
    getFf(),
  ]);

  const mine = playersOfTeam(myTeamRaw ?? {});
  const budget = { money: teamHeader(myTeamRaw ?? {}).teamMoney ?? 0 };
  const oddsOf = (player: Player) => ff.get(player);

  const rivals: { player: Player; owner: { name: string; teamId: string } }[] = [];
  toList(teamsRaw).forEach((raw, i) => {
    const manager = toManager(raw, i, myTeamId);
    if (manager.isMe) return;
    for (const player of playersOfTeam(raw)) {
      rivals.push({ player, owner: { name: manager.name, teamId: manager.teamId } });
    }
  });

  /* ------------------------------------------------- cláusulas de rivales */

  const candidates = rivals
    .map((r) => buildCandidate(r.player, r.owner, oddsOf(r.player), null, budget, now))
    .filter((c): c is NonNullable<typeof c> => c !== null);

  for (const c of candidates) {
    if (c.isOpen || !c.opensAt) continue;
    const left = new Date(c.opensAt).getTime() - now;
    if (left <= 0) continue;

    const score = outOfTen(Math.max(scoreSquad(c).score, scoreClause(c).score));
    const label =
      `<b>${esc(c.player.name)}</b> · ${cash(c.clause)}` +
      `${c.odds?.probability != null ? ` · ${c.odds.probability}%` : ""}` +
      ` · nota ${score.toFixed(1)} · de ${esc(c.owner.name)}` +
      `${c.affordable ? "" : " · no te llega"}`;

    if (left <= LAST_CALL) {
      alerts.push({
        key: `rival-ya-${c.player.id}-${c.opensAt}`,
        kind: "clausula-rival",
        priority: 100 + score,
        text: label,
      });
    } else if (left <= EARLY_RIVAL) {
      alerts.push({
        key: `rival-pronto-${c.player.id}-${c.opensAt}`,
        kind: "clausula-rival",
        priority: 50 + score,
        text: `${label} · ${timeTo(left)}`,
      });
    }
  }

  /* ---------------------------------------------------- cláusulas propias */

  for (const player of mine) {
    if (!player.buyoutUnlockAt) continue;
    const left = new Date(player.buyoutUnlockAt).getTime() - now;
    if (left <= 0) continue;

    const odds = oddsOf(player);
    const label =
      `<b>${esc(player.name)}</b> · cláusula ${cash(player.buyoutClause ?? 0)}` +
      `${odds?.probability != null ? ` · ${odds.probability}%` : ""}`;

    if (left <= LAST_CALL) {
      alerts.push({
        key: `mia-ya-${player.id}-${player.buyoutUnlockAt}`,
        kind: "clausula-mia",
        priority: 200,
        text: label,
      });
    } else if (left <= EARLY_MINE) {
      alerts.push({
        key: `mia-pronto-${player.id}-${player.buyoutUnlockAt}`,
        kind: "clausula-mia",
        priority: 150,
        text: `${label} · ${timeTo(left)}`,
      });
    }
  }

  /* ------------------------------------------------------ partes médicos */

  /**
   * Un aviso nuevo de futbolfantasy sobre alguien que importa: mío, de un
   * rival o del mercado. De los otros seiscientos jugadores de la liga no se
   * avisa, porque no se puede hacer nada con esa información.
   */
  const watched = new Map<string, { player: Player; who: string }>();
  for (const player of mine) watched.set(player.id, { player, who: "TUYO" });
  for (const r of rivals) {
    if (!watched.has(r.player.id)) watched.set(r.player.id, { player: r.player, who: r.owner.name });
  }
  for (const raw of toList(marketRaw)) {
    const item = toMarketItem(raw, myTeamId);
    if (item.player.id && !watched.has(item.player.id) && !item.sellerTeamId) {
      watched.set(item.player.id, { player: item.player, who: "en el mercado" });
    }
  }

  /**
   * El parte médico va entero, no sólo lo nuevo.
   *
   * Antes llegaba un aviso por cada lesionado nuevo y nada más, así que para
   * saber cómo estaba la enfermería había que ir rebuscando mensajes viejos.
   * Ahora basta con que aparezca **uno** nuevo para que llegue la lista
   * completa de bajas de la liga, con el motivo y hasta cuándo. Lo nuevo va
   * marcado, que es lo que se mira primero.
   */
  const enfermeria: { key: string; texto: string; mio: boolean; nuevo: boolean }[] = [];

  for (const { player, who } of watched.values()) {
    // Del mercado no se informa aquí: son jugadores de nadie y la enfermería
    // es para saber quién tiene un roto en su plantilla.
    if (who === "en el mercado") continue;

    const odds = oddsOf(player);
    const baja = odds?.slug ? ff.bajas.get(odds.slug) : null;

    /**
     * Sólo partes médicos y bajas confirmadas.
     *
     * futbolfantasy marca como aviso muchas cosas que no son una lesión —un
     * rumor de fichaje, una entrevista— y avisar de todas convertiría el canal
     * en ruido. Se pide o estar en la enfermería del club, o un parte médico
     * explícito, o que el propio juego lo dé por lesionado o sancionado.
     */
    const medical = odds?.alerts.find(
      (a) => a.kind === "injury" && /m[ée]dico|lesi|sanci/i.test(a.label),
    );
    const benched = player.status === "injured" || player.status === "suspended";
    if (!baja && !medical && !benched) continue;

    const que =
      baja?.motivo ??
      (medical
        ? `${medical.label}${medical.tags.length ? ` (${medical.tags.join(", ")})` : ""}`
        : player.status === "injured"
          ? "lesionado"
          : "sancionado");

    // Lo que más falta hacía: cuándo vuelve. Si futbolfantasy no lo dice, al
    // menos se cuenta desde cuándo lleva fuera.
    const cuando = baja?.hasta
      ? ` · ${esc(baja.hasta.replace(/^Baja /, ""))}`
      : baja?.dias
        ? ` · ${baja.dias} días fuera`
        : "";

    const key = `parte-${player.id}-${que}`;
    enfermeria.push({
      key,
      mio: who === "TUYO",
      nuevo: !ledger.has(key),
      texto:
        `<b>${esc(player.name)}</b> · ${esc(que)}${cuando} · ` +
        `${who === "TUYO" ? "<b>es tuyo</b>" : esc(who)}`,
    });
  }

  const nuevasBajas = enfermeria.filter((b) => b.nuevo);

  /**
   * Sin ninguna baja nueva no se manda nada.
   *
   * La lista completa es útil cuando algo ha cambiado; recibirla cada diez
   * minutos sin novedades sería exactamente el ruido que se quiere evitar.
   */
  const parteMedico =
    nuevasBajas.length === 0
      ? null
      : [
          `<b>🚑 Parte médico</b> · ${nuevasBajas.length} nuevo${
            nuevasBajas.length === 1 ? "" : "s"
          } de ${enfermeria.length} bajas`,
          "",
          ...enfermeria
            // Lo mío primero, lo nuevo por delante dentro de cada grupo.
            .sort(
              (a, b) =>
                Number(b.mio) - Number(a.mio) ||
                Number(b.nuevo) - Number(a.nuevo) ||
                a.texto.localeCompare(b.texto),
            )
            .slice(0, 30)
            .map((b) => `${b.nuevo ? "🆕" : "•"} ${b.texto}`),
        ].join("\n");

  /* ---------------------------------------------------- caídas de golpe */

  for (const player of mine) {
    const odds = oddsOf(player);
    const diff = odds?.diff ?? 0;
    if (diff > -700_000) continue;

    alerts.push({
      // Con la fecha en la clave, el mismo desplome no se repite en el día.
      key: `caida-${player.id}-${new Date(now).toDateString()}`,
      kind: "caida",
      priority: 60,
      text: `<b>${esc(player.name)}</b> · ${cash(diff)} hoy · vale ${cash(player.marketValue)}`,
    });
  }

  /* ------------------------------------------------------ inicio de jornada */

  const calendars = await Promise.all(TEAMS.map((team) => getFixtures(team.slug)));
  const upcoming = calendars
    .flatMap((c) => c.next)
    .filter(isLeagueFixture)
    .map((f) => ({ f, at: kickoff(f.date, now) }))
    .filter((x): x is { f: (typeof calendars)[number]["next"][number]; at: number } => x.at !== null)
    .sort((a, b) => a.at - b.at);

  const first = upcoming[0];
  if (first) {
    const left = first.at - now;
    if (left > 0 && left <= 55 * MIN) {
      const doubtful = mine.filter((p) => {
        const odds = oddsOf(p);
        return odds?.probability != null && odds.probability < 50;
      });

      alerts.push({
        key: `jornada-${first.f.id}`,
        kind: "jornada",
        priority: 250,
        text:
          `Empieza la jornada ${timeTo(left)} con ${esc(first.f.home.name)} — ${esc(first.f.away.name)}.` +
          (doubtful.length > 0
            ? ` Revisa el once: ${doubtful
                .slice(0, 5)
                .map((p) => `${esc(p.name)} (${oddsOf(p)?.probability}%)`)
                .join(", ")}.`
            : " Tu once no tiene dudas."),
      });
    }
  }

  /* ------------------------------------------------------- a enviar */

  const fresh = alerts.filter((a) => !ledger.has(a.key));

  if (!soloMirar) {
    for (const b of nuevasBajas) ledger.add(b.key);
    for (const a of fresh) ledger.add(a.key);
    await ledger.flush();
  }

  return {
    checkedAt: new Date(now).toISOString(),
    messages: groupMessages(fresh, parteMedico),
    count: fresh.length + nuevasBajas.length,
  };
}

/* ------------------------------------------------------------- mensajes */

const HEADS: Record<Alerta["kind"], string> = {
  "clausula-mia": "🔒 Se abren TUS cláusulas",
  jornada: "🏁 Empieza la jornada",
  lesion: "🚑 Parte médico",
  "clausula-rival": "⏰ Cláusulas a punto de abrirse",
  caida: "📉 Se está desplomando",
  mercado: "🛒 Cierra el mercado",
};

const ORDER: Alerta["kind"][] = [
  "clausula-mia",
  "jornada",
  "lesion",
  "clausula-rival",
  "caida",
  "mercado",
];

/**
 * Un mensaje por tipo, no uno por jugador.
 *
 * Cuando se abren quince cláusulas a la vez llega un solo aviso con las quince,
 * ordenadas por interés, en vez de quince notificaciones seguidas.
 */
function groupMessages(alerts: Alerta[], parteMedico: string | null): string[] {
  const messages: string[] = [];

  for (const kind of ORDER) {
    // El parte médico llega montado de fuera: es el único que enseña también lo
    // que ya se había avisado, así que no puede salir del reparto normal.
    if (kind === "lesion") {
      if (parteMedico) messages.push(parteMedico);
      continue;
    }

    const group = alerts.filter((a) => a.kind === kind).sort((a, b) => b.priority - a.priority);
    if (group.length === 0) continue;

    const lines = [`<b>${HEADS[kind]}</b>`, ""];
    for (const alert of group.slice(0, 12)) lines.push(`• ${alert.text}`);
    if (group.length > 12) lines.push(`<i>y ${group.length - 12} más</i>`);

    messages.push(lines.join("\n"));
  }

  return messages;
}

/** Igual que en el informe: la fuente da la fecha como texto. */
function kickoff(text: string, now: number): number | null {
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
  return at < now - 180 * 24 * 3600_000 ? at + 365 * 24 * 3600_000 : at;
}

/* -------------------------------------------------- cierre del mercado */

/**
 * El aviso de las 21:55, que va por su propio reloj.
 *
 * Es el único que tiene hora fija todos los días, así que no depende del ciclo
 * de diez minutos: lo dispara un cron propio a esa hora exacta. Así no puede
 * llegar tarde por mucho que GitHub retrase los demás.
 */
export async function marketClosing(
  leagueId: string,
  myTeamId: string | null,
): Promise<string | null> {
  const [{ data: marketRaw }, ff] = await Promise.all([
    safe(fantasy.market(leagueId)),
    getFf(),
  ]);

  const picks = toList(marketRaw)
    .map((raw) => toMarketItem(raw, myTeamId))
    .filter((item) => item.player.id && !item.sellerTeamId && item.player.position !== "EN")
    .map((item) => {
      const odds: FfPlayer | null = ff.get(item.player);
      const p = odds?.probability;
      const plays = p == null ? 0.5 : p / 100;
      const average =
        item.player.averagePoints > 0
          ? item.player.averagePoints
          : (item.player.lastSeasonPoints ?? 0) / 38;
      const perMillion = item.price > 0 ? average / (item.price / 1_000_000) : 0;
      const score =
        item.player.status === "ok" && p !== 0
          ? Math.round(plays * (0.5 + 0.3 * Math.min(1, average / 7) + 0.2 * Math.min(1, perMillion / 0.8)) * 100) / 10
          : 0;
      return { item, odds, score };
    })
    .filter((x) => x.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (picks.length === 0) {
    return "<b>🛒 El mercado cierra en 5 minutos</b>\n\nHoy no hay nada que merezca una puja.";
  }

  const lines = [
    "<b>🛒 El mercado cierra en 5 minutos</b>",
    "",
    "Lo que merece una puja hoy:",
    "",
  ];

  for (const { item, odds, score } of picks) {
    lines.push(
      `• <b>${esc(item.player.name)}</b> · ${cash(item.price)}` +
        `${odds?.probability != null ? ` · ${odds.probability}%` : ""}` +
        ` · nota ${score.toFixed(1)}` +
        `${item.myBid ? ` · <i>ya pujaste ${cash(item.myBid)}</i>` : item.bids ? ` · ${item.bids} pujas` : " · sin pujas"}`,
    );
  }

  return lines.join("\n");
}
