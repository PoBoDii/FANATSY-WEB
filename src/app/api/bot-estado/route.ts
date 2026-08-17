import { guardarEstado, type EstadoBot } from "@/lib/bot-estado";

export const dynamic = "force-dynamic";

/**
 * Abre y cierra el chat negociador.
 *
 * Va detrás del cerrojo de la web, igual que la página desde la que se usa: no
 * lleva llave propia porque nadie de fuera llega hasta aquí.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<EstadoBot>;

  const cambio: Partial<EstadoBot> = {};
  if (typeof body.abierto === "boolean") cambio.abierto = body.abierto;
  if (Array.isArray(body.vetados)) cambio.vetados = body.vetados.map(String).slice(0, 20);
  if (typeof body.motivo === "string") cambio.motivo = body.motivo.slice(0, 160);

  return Response.json({ ok: true, estado: await guardarEstado(cambio) });
}
