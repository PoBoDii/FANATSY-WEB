import type { Report, ReportPlayer } from "./informe";
import { money } from "./format";

/**
 * Envío a Telegram.
 *
 * ── Por qué Telegram y no correo ──────────────────────────────────────────
 *
 * Porque es gratis, sin cuotas ni límites que valgan para esto, y sobre todo
 * porque no hace falta ningún servicio intermedio: un bot es una URL a la que
 * se le hace POST. El correo exigiría contratar un proveedor de envío, y
 * WhatsApp e Instagram piden cuenta de empresa y aprobación previa.
 *
 * ── Qué hace falta configurar ─────────────────────────────────────────────
 *
 *  1. Hablar con @BotFather en Telegram y crear un bot → da el `BOT_TOKEN`.
 *  2. Escribirle algo al bot desde tu cuenta, y abrir
 *     `https://api.telegram.org/bot<TOKEN>/getUpdates` para leer tu `chat.id`.
 *  3. Guardar los dos valores como variables de entorno en Netlify:
 *     `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`.
 *
 * ── Y un segundo bot para el negociador ───────────────────────────────────
 *
 * Los tratos que cierra el chat llegan por un bot aparte
 * (`TELEGRAM_NEGOCIAR_BOT_TOKEN`), para no mezclar en la misma conversación el
 * informe de la mañana con las ofertas que van llegando a cualquier hora.
 *
 * El `chat_id` es el mismo: en Telegram identifica a la persona, no al bot. Lo
 * único imprescindible es haberle dado a Start al bot nuevo, porque un bot no
 * puede escribir primero a nadie.
 */

const API = "https://api.telegram.org";

export type TelegramResult = { ok: boolean; error: string | null };

/**
 * Manda un mensaje. Nunca lanza: si Telegram falla, el informe de la web tiene
 * que seguir viéndose igual.
 */
export async function sendTelegram(
  text: string,
  /** "negociador" manda por el bot de las ofertas; por defecto, el de siempre. */
  bot: "informe" | "negociador" = "informe",
): Promise<TelegramResult> {
  /**
   * El bot del negociador cae en el de siempre si no está configurado.
   *
   * Es preferible que un trato cerrado llegue al chat equivocado a que no
   * llegue: el aviso es el que te dice que alguien quiere comprarte a alguien.
   */
  const token =
    bot === "negociador"
      ? (process.env.TELEGRAM_NEGOCIAR_BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN)
      : process.env.TELEGRAM_BOT_TOKEN;

  const chat =
    bot === "negociador"
      ? (process.env.TELEGRAM_NEGOCIAR_CHAT_ID ?? process.env.TELEGRAM_CHAT_ID)
      : process.env.TELEGRAM_CHAT_ID;

  if (!token || !chat) {
    return { ok: false, error: "Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID" };
  }

  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text,
        parse_mode: "HTML",
        // Sin vista previa: los enlaces a la web meterían una tarjeta enorme.
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return { ok: false, error: `Telegram respondió ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ------------------------------------------------------------- formato */

/** Telegram interpreta HTML: hay que escapar lo que venga de los datos. */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Un emoji por tipo de aviso: es lo que hace escaneable el mensaje. */
const MARK = {
  urgente: "🔴",
  aviso: "🟠",
  oportunidad: "🟢",
  neutral: "⚪️",
} as const;

/**
 * Un jugador, en uno o dos renglones.
 *
 * En las secciones marcadas como `compact` el porqué repetiría lo que ya dice
 * la propia línea —"sube 563 k€" justo debajo de "▲563 k€"—, así que se omite y
 * en su lugar se pega al final lo único que añade: de quién es.
 */
function line(player: ReportPlayer, compact: boolean): string {
  const bits = [`<b>${esc(player.name)}</b>`];
  if (player.probability !== null) bits.push(`${player.probability}%`);
  bits.push(money(player.value));
  if (player.diff) bits.push(`${player.diff > 0 ? "▲" : "▼"}${money(Math.abs(player.diff))}`);
  if (player.score !== null) bits.push(`nota ${player.score.toFixed(1)}`);
  if (compact && player.owner) bits.push(esc(player.owner));

  const first = `• ${bits.join(" · ")}`;
  return compact || !player.why ? first : `${first}\n   <i>${esc(player.why)}</i>`;
}

/**
 * El informe como mensaje.
 *
 * Se recorta a lo que cabe leer en el móvil sin desplazarse tres pantallas:
 * los titulares, y de cada bloque los cuatro primeros. Para el detalle está la
 * web, cuyo enlace va al final.
 */
export function reportToText(report: Report, webUrl?: string): string {
  const day = new Date(report.builtAt).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const out: string[] = [`<b>⚽ Informe del ${day}</b>`, ""];

  // El aviso del día va antes que nada y en mayúsculas: es lo que se pierde si
  // se lee el mensaje tarde.
  if (report.alert) {
    out.push("", `<b>${report.alert.kind === "cierre" ? "⏰" : "🏁"} ${esc(report.alert.text.toUpperCase())}</b>`);
  }

  if (report.today.length > 0) {
    out.push("", "<b>Hoy se juega</b>");
    for (const match of report.today) {
      // Los partidos con jugadores míos van marcados: son los que decido.
      const mark = match.mine > 0 ? ` ⭐️${match.mine}` : "";
      out.push(
        `• ${esc(match.home.name)} — ${esc(match.away.name)} · ${esc(match.time)}${mark}`,
      );
    }
  }

  for (const section of report.sections) {
    out.push("", `${MARK[section.tone]} <b>${esc(section.title)}</b>`);

    for (const note of section.notes ?? []) out.push(`• ${esc(note)}`);
    for (const player of section.players.slice(0, 4)) {
      out.push(line(player, section.compact === true));
    }

    const rest = section.players.length - 4;
    if (rest > 0) out.push(`   <i>y ${rest} más</i>`);
  }

  out.push("", `<i>Saldo: ${money(report.money)}</i>`);
  if (webUrl) out.push(`<a href="${webUrl}/informe">Ver el informe completo</a>`);

  return out.join("\n");
}
