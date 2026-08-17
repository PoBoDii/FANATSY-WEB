import { guardarBlindaje } from "@/lib/historial";

export const dynamic = "force-dynamic";

/** Apunta lo gastado subiendo la cláusula de un jugador. Cero lo borra. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    playerId?: string;
    gastado?: number;
  };

  if (!body.playerId) return Response.json({ error: "Falta el jugador" }, { status: 400 });

  await guardarBlindaje(body.playerId, Math.max(0, Math.round(body.gastado ?? 0)));
  return Response.json({ ok: true });
}
