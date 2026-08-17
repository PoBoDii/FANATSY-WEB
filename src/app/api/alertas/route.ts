import { getSession } from "@/lib/session";
import { checkAlerts, marketClosing } from "@/lib/alertas";
import { sendTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/**
 * Los avisos al momento.
 *
 * La llama el cron cada diez minutos y, aparte, un cron propio a las 21:55 para
 * el cierre del mercado, que es el único con hora fija.
 *
 *   GET /api/alertas?token=…             → mira qué hay y lo manda
 *   GET /api/alertas?token=…&probar=1    → lo enseña sin mandarlo ni apuntarlo
 *   GET /api/alertas?token=…&tipo=mercado → sólo el aviso de cierre
 *
 * Misma llave que el informe: la ruta es pública y detrás hay una plantilla y
 * un montón de peticiones a LaLiga.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const expected = process.env.INFORME_TOKEN;

  if (!expected) {
    return Response.json(
      { error: "Falta INFORME_TOKEN en el servidor: la ruta está deshabilitada." },
      { status: 503 },
    );
  }
  if (url.searchParams.get("token") !== expected) {
    return Response.json({ error: "Token no válido" }, { status: 401 });
  }

  const session = await getSession();
  if (!session.active) {
    return Response.json({ error: session.error ?? "Sin liga activa" }, { status: 404 });
  }

  const league = session.active;
  const dryRun = url.searchParams.get("probar") === "1";

  /* ------------------------------------------------ cierre del mercado */

  if (url.searchParams.get("tipo") === "mercado") {
    const text = await marketClosing(league.id, league.myTeamId);
    if (!text) return Response.json({ enviado: false, motivo: "sin nada que decir" });
    if (dryRun) return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });

    const sent = await sendTelegram(text);
    return Response.json(
      { enviado: sent.ok, error: sent.error },
      { status: sent.ok ? 200 : 502 },
    );
  }

  /* ----------------------------------------------------- ciclo normal */

  /**
   * En modo prueba no se apunta nada como enviado, así que se puede mirar las
   * veces que haga falta sin gastar los avisos del día.
   */
  if (dryRun) {
    const preview = await checkAlerts(league.id, league.myTeamId, Date.now(), true);
    return new Response(preview.messages.join("\n\n———\n\n") || "Nada que avisar ahora mismo", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const report = await checkAlerts(league.id, league.myTeamId);

  if (report.messages.length === 0) {
    return Response.json({ enviados: 0, avisos: 0 });
  }

  // Uno detrás de otro y no todos juntos: cada tipo es una notificación, que es
  // lo que hace que se distinga de un vistazo qué ha pasado.
  const results = [];
  for (const message of report.messages) results.push(await sendTelegram(message));

  const failed = results.filter((r) => !r.ok);
  return Response.json(
    {
      enviados: results.length - failed.length,
      avisos: report.count,
      errores: failed.map((r) => r.error),
    },
    { status: failed.length === 0 ? 200 : 502 },
  );
}
