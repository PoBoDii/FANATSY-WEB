import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { toList, toManager } from "@/lib/normalize";
import { Chat } from "@/components/Chat";
import { leerEstado } from "@/lib/bot-estado";

export const dynamic = "force-dynamic";

/**
 * La página del bot negociador.
 *
 * Es lo único de la web que no pide contraseña —su enlace se reparte por el
 * grupo de la liga—, así que sólo carga lo justo: los nombres de los managers,
 * para que quien entra se identifique eligiendo de una lista en vez de
 * escribiendo lo que le apetezca.
 */
export default async function NegociarPage() {
  const session = await getSession();
  const league = session.active;

  const { data } = league
    ? await safe(fantasy.leagueTeams(league.id))
    : { data: null };

  const managers = toList(data)
    .map((raw, i) => toManager(raw, i, league?.myTeamId ?? null))
    .filter((m) => !m.isMe)
    .map((m) => m.name)
    .sort((a, b) => a.localeCompare(b, "es"));

  /**
   * Aquí no se sabe quién entra hasta que elige, así que viaja el estado entero
   * y el navegador decide en cuanto pulsa "Empezar". Es una lista de nombres,
   * nada que no salga ya en el desplegable de al lado.
   */
  return <Chat managers={managers} estado={await leerEstado()} />;
}
