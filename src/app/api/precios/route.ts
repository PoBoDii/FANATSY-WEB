import { guardarPrecio } from "@/lib/precios-manuales";

export const dynamic = "force-dynamic";

/**
 * Guarda el precio que fijas a mano para un jugador.
 *
 * No lleva llave propia: la ruta vive detrás del cerrojo de la web, igual que
 * la página desde la que se usa.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    playerId?: string;
    salida?: number | null;
    minimo?: number | null;
    nota?: string;
  };

  if (!body.playerId) return Response.json({ error: "Falta el jugador" }, { status: 400 });

  const precios = await guardarPrecio(body.playerId, {
    salida: body.salida ?? undefined,
    minimo: body.minimo ?? undefined,
    nota: body.nota?.slice(0, 120) || undefined,
  });

  return Response.json({ ok: true, guardado: precios[body.playerId] ?? null });
}
