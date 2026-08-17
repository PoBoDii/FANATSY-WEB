import { notFound } from "next/navigation";
import { Chat } from "@/components/Chat";
import { nombreDe } from "@/lib/enlaces";

export const dynamic = "force-dynamic";

/**
 * El chat con el enlace personal de cada manager.
 *
 * El nombre viene firmado en la propia dirección, así que aquí no hay nada que
 * elegir: quien entra por su enlace es quien es. Si la firma no cuadra —alguien
 * ha escrito el nombre a mano— la página no existe.
 */
export default async function NegociarComoPage({
  params,
}: {
  params: Promise<{ quien: string }>;
}) {
  const { quien } = await params;
  const nombre = nombreDe(quien);
  if (!nombre) notFound();

  return <Chat managers={[nombre]} fijo={nombre} />;
}
