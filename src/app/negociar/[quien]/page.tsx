import { notFound } from "next/navigation";
import { Chat } from "@/components/Chat";
import { nombreDe } from "@/lib/enlaces";
import { cerradoPara, leerEstado } from "@/lib/bot-estado";

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

  /**
   * Se mira el cerrojo aquí y no cuando escriben.
   *
   * Con el enlace personal ya se sabe quién entra antes de pintar nada, así que
   * si tiene el chat cerrado se le enseña el aviso de entrada y ni siquiera
   * aparece la casilla de escribir: no hay mensaje que mandar, ni petición que
   * atender, ni plantilla que cargar.
   */
  const cerrado = cerradoPara(await leerEstado(), nombre);

  return <Chat managers={[nombre]} fijo={nombre} cerradoDeEntrada={cerrado} />;
}
