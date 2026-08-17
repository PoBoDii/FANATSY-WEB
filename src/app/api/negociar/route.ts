import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { getFf } from "@/lib/futbolfantasy";
import { playersOfTeam, teamHeader, toList, toManager, type Player } from "@/lib/normalize";
import { buscarJugador, precioDe, responder, tratoNuevo, type Trato } from "@/lib/negociacion";
import { sendTelegram } from "@/lib/telegram";
import { openLedger } from "@/lib/estado";
import { leerPrecios } from "@/lib/precios-manuales";
import { cerradoPara, leerEstado } from "@/lib/bot-estado";
import { apilar } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Palabras que aparecen en todas estas frases y no son nombres de nadie.
 *
 * Sin esta lista, "quiero" o "interesa" se buscaban como si fueran jugadores y
 * cualquier coincidencia parcial mandaba la conversación a paseo.
 */
const RELLENO = new Set([
  "quiero", "interesa", "dame", "vendes", "vender", "cuanto", "pides", "ofrezco",
  "doy", "pago", "tienes", "hola", "buenas", "oye", "para", "por", "que", "como",
  "kilos", "millones", "euros", "seria", "seria", "mira", "venga", "vale",
]);

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

  /**
   * El interruptor, lo primero de todo.
   *
   * Se mira antes que la liga y antes que la plantilla: si el chat está cerrado
   * no hay ninguna razón para gastar cuatro peticiones a LaLiga en contestar
   * que no. `cerrado` viaja en la respuesta para que el navegador bloquee la
   * casilla de escribir y no haya que insistir con cada mensaje.
   */
  const estado = await leerEstado();
  const cerrado = cerradoPara(estado, quien);
  if (cerrado) {
    return Response.json({ texto: cerrado, cerrado: true });
  }

  const session = await getSession();
  const league = session.active;
  const myTeamId = league?.myTeamId;

  if (!league || !myTeamId) {
    return Response.json({ error: "El dueño no tiene liga activa" }, { status: 503 });
  }
  const [{ data: teamRaw }, { data: teamsRaw }, ff, aMano] = await Promise.all([
    safe(fantasy.team(league.id, myTeamId)),
    safe(fantasy.leagueTeams(league.id)),
    getFf(),
    leerPrecios(),
  ]);

  const squad = playersOfTeam(teamRaw ?? {});
  // El nombre sale de la sesión: la ficha del equipo no siempre lo trae.
  const dueno = session.managerName ?? teamHeader(teamRaw ?? {}).managerName ?? "su dueño";

  /**
   * Los jugadores que NO son míos, con su dueño.
   *
   * Sirve para lo más frecuente que pasa en estos chats: preguntar por alguien
   * que no tengo. En vez de un "no te entiendo", el bot dice de quién es y
   * manda a paseo a quien pregunta.
   */
  const ajenos: { player: Player; dueno: string }[] = [];
  toList(teamsRaw).forEach((raw, i) => {
    const manager = toManager(raw, i, myTeamId);
    if (manager.isMe) return;
    for (const player of playersOfTeam(raw)) ajenos.push({ player, dueno: manager.name });
  });

  const buscarAjeno = (texto: string) => {
    const suyo = buscarJugador(
      texto,
      ajenos.map((a) => a.player),
    );
    if (suyo) {
      const dueno = ajenos.find((a) => a.player.id === suyo.id)?.dueno ?? null;
      return { nombre: suyo.name, dueno };
    }

    /**
     * Y si tampoco es de nadie, se busca en los seiscientos de LaLiga.
     *
     * Hay que ir palabra por palabra: `byName` espera un nombre, no una frase
     * entera, y "me interesa lamine yamal te doy 90M" no casa con nada.
     */
    const palabras = texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z ]/g, " ")
      .split(/\s+/)
      // Fuera las palabras de relleno: "quiero", "interesa", "dame"…
      .filter((w) => w.length >= 4 && !RELLENO.has(w));

    for (let i = 0; i < palabras.length; i++) {
      // Se prueban parejas primero ("lamine yamal") y luego palabras sueltas.
      for (const clave of [palabras.slice(i, i + 2).join(" "), palabras[i]]) {
        const libre = ff.byName(clave);
        if (libre) return { nombre: libre.displayName ?? libre.name, dueno: null };
      }
    }

    /**
     * Último recurso: buscar la palabra dentro del nombre completo de los
     * seiscientos de la liga. Es como se les llama de verdad — "lamine" y no
     * "Lamine Yamal", "vini" y no "Vinícius".
     */
    for (const palabra of palabras) {
      const hit = ff.all.find((row) => row.name.split(" ").some((t) => t.startsWith(palabra)));
      if (hit) return { nombre: hit.displayName ?? hit.name, dueno: null };
    }
    return null;
  };

  const trato: Trato = body.trato ?? tratoNuevo(quien);
  trato.quien = quien;

  const salida = responder(
    trato,
    mensaje,
    squad,
    (player) => precioDe(player, ff.get(player), aMano[player.id]),
    dueno,
    buscarAjeno,
  );

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
      await sendTelegram(salida.avisoAlDueno, "negociador");
    }
  }

  /**
   * Cada intercambio se guarda.
   *
   * Sirve para ver cómo negocia cada uno —quién tira a la baja, quién cede
   * rápido, quién insiste— y para ajustar los precios con esa información. Se
   * guarda el par entero, no sólo lo que dicen ellos, para poder releerlo como
   * la conversación que fue.
   */
  await apilar(`chat:${quien}`, {
    at: Date.now(),
    quien,
    jugador: salida.trato.playerName,
    dice: mensaje,
    responde: salida.texto,
    fase: salida.trato.fase,
    ofrece: salida.trato.ofrece,
    pide: salida.trato.pide,
  });

  return Response.json({ texto: salida.texto, trato: salida.trato });
}
