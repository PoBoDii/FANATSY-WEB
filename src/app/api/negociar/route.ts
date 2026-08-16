import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { getFf } from "@/lib/futbolfantasy";
import { playersOfTeam, teamHeader } from "@/lib/normalize";
import { precioDe, responder, tratoNuevo, type Trato } from "@/lib/negociacion";
import { sendTelegram } from "@/lib/telegram";
import { openLedger } from "@/lib/estado";

export const dynamic = "force-dynamic";

/**
 * El bot que negocia.
 *
 * Le habla cualquiera desde `/negociar`, sin contraseña: es un chat público a
 * propósito, para poder pegar el enlace en el grupo. Lo único que puede hacer
 * quien entra es preguntar por jugadores del dueño y regatear — no ve la web ni
 * accede a nada más.
 *
 * La conversación viaja de ida y vuelta en cada mensaje. Guardar el estado en
 * el servidor obligaría a montar sesiones y a limpiarlas; así el navegador se
 * encarga y aquí no queda nada colgando.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    mensaje?: string;
    quien?: string;
    trato?: Trato;
  };

  const mensaje = (body.mensaje ?? "").slice(0, 400).trim();
  const quien = (body.quien ?? "").slice(0, 40).trim() || "Alguien";

  if (!mensaje) {
    return Response.json({ error: "Sin mensaje" }, { status: 400 });
  }

  const session = await getSession();
  const league = session.active;
  const myTeamId = league?.myTeamId;

  if (!league || !myTeamId) {
    return Response.json({ error: "El dueño no tiene liga activa" }, { status: 503 });
  }
  const [{ data: teamRaw }, ff] = await Promise.all([
    safe(fantasy.team(league.id, myTeamId)),
    getFf(),
  ]);

  const squad = playersOfTeam(teamRaw ?? {});
  // El nombre sale de la sesión: la ficha del equipo no siempre lo trae.
  const dueno = session.managerName ?? teamHeader(teamRaw ?? {}).managerName ?? "su dueño";

  const trato: Trato = body.trato ?? tratoNuevo(quien);
  trato.quien = quien;

  const salida = responder(trato, mensaje, squad, (player) => precioDe(player, ff.get(player)), dueno);

  /**
   * El aviso al dueño se manda una sola vez por acuerdo.
   *
   * Sin esta comprobación, recargar la página o insistir con "vale" le
   * dispararía el mismo mensaje otra vez.
   */
  if (salida.avisoAlDueno) {
    const ledger = await openLedger();
    const key = `trato-${quien}-${salida.trato.playerId}-${salida.trato.ofrece}`;
    if (!ledger.has(key)) {
      ledger.add(key);
      await ledger.flush();
      await sendTelegram(salida.avisoAlDueno);
    }
  }

  return Response.json({ texto: salida.texto, trato: salida.trato });
}
