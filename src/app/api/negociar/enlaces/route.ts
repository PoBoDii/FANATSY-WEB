import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { toList, toManager } from "@/lib/normalize";
import { enlaceDe } from "@/lib/enlaces";

export const dynamic = "force-dynamic";

/**
 * Los enlaces personales de cada manager, para repartirlos por el grupo.
 *
 * Va detrás de la misma llave que el informe: quien tenga esta lista puede
 * hacerse pasar por cualquiera, así que no es cosa de dejarla abierta.
 *
 *   GET /api/negociar/enlaces?token=…
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const expected = process.env.INFORME_TOKEN;

  if (!expected || url.searchParams.get("token") !== expected) {
    return Response.json({ error: "Token no válido" }, { status: 401 });
  }

  const session = await getSession();
  const league = session.active;
  if (!league) return Response.json({ error: "Sin liga" }, { status: 404 });

  const base = process.env.SITE_URL ?? url.origin;
  const { data } = await safe(fantasy.leagueTeams(league.id));

  const enlaces = toList(data)
    .map((raw, i) => toManager(raw, i, league.myTeamId))
    .filter((m) => !m.isMe)
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((m) => `${m.name}: ${base}/negociar/${enlaceDe(m.name)}`);

  return new Response(enlaces.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
