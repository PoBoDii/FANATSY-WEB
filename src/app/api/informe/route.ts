import { getSession } from "@/lib/session";
import { buildReport } from "@/lib/informe";
import { reportToText, sendTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/**
 * El informe del día, para quien no es un navegador.
 *
 * Lo llama el cron de GitHub Actions una vez al día: construye el mismo informe
 * que enseña `/informe` y lo manda a Telegram. También sirve el JSON, que es
 * útil para depurar y para cualquier cosa que se quiera montar encima.
 *
 * ── Por qué pide un token ─────────────────────────────────────────────────
 *
 * Porque la ruta es pública y detrás hay una plantilla, un saldo y un montón
 * de peticiones a LaLiga. Sin llave, cualquiera podría dispararla en bucle.
 * El token va en la variable `INFORME_TOKEN`; si no está definida, la ruta
 * queda cerrada en vez de abierta, que es el fallo seguro.
 *
 *   GET /api/informe?token=…            → el informe en JSON
 *   GET /api/informe?token=…&enviar=1   → además lo manda a Telegram
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

  const report = await buildReport(
    session.active.id,
    session.active.myTeamId,
    session.active.name,
  );

  // El enlace del pie sale de la propia petición: así vale igual en Netlify,
  // en un despliegue de prueba o en local, sin configurar nada.
  const base = process.env.SITE_URL ?? url.origin;

  // Vista previa: el mensaje tal cual llegaría, sin mandarlo a nadie.
  if (url.searchParams.get("formato") === "texto") {
    return new Response(reportToText(report, base), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (url.searchParams.get("enviar") !== "1") {
    return Response.json(report);
  }

  const sent = await sendTelegram(reportToText(report, base));

  return Response.json(
    { enviado: sent.ok, error: sent.error, titulares: report.headlines },
    { status: sent.ok ? 200 : 502 },
  );
}
