import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { getFf } from "@/lib/futbolfantasy";
import { toList, toManager, playersOfTeam, type Position } from "@/lib/normalize";
import { precioDe } from "@/lib/negociacion";
import { leerPrecios } from "@/lib/precios-manuales";
import { pila, hayAlmacen } from "@/lib/db";
import { Empty, PageHeader, Section } from "@/components/ui";
import { PreciosVenta, type FilaPrecio } from "@/components/PreciosVenta";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

type Linea = {
  at: number;
  quien: string;
  jugador: string | null;
  dice: string;
  responde: string;
  fase: string;
  ofrece: number;
  pide: number;
};

/**
 * El puesto de mando del bot: por cuánto vende y qué le dicen.
 *
 * Las dos cosas van juntas a propósito. Leer que tres rivales se han plantado
 * en los 95 M€ por el mismo jugador es exactamente la información con la que
 * quieres bajar su precio de salida, y tenerlo en la misma pantalla ahorra el
 * viaje.
 */
export default async function NegociacionesPage() {
  const session = await getSession();
  const league = session.active;
  if (!league) return <Empty title="Todavía sin liga" hint="Los detalles, en Mi plantilla." />;

  const [{ data: teamRaw }, { data: teamsRaw }, ff, aMano] = await Promise.all([
    safe(fantasy.team(league.id, league.myTeamId ?? "")),
    safe(fantasy.leagueTeams(league.id)),
    getFf(),
    leerPrecios(),
  ]);

  /* ------------------------------------------------- lo que pido por cada uno */

  const ORDEN: Record<Position, number> = { PT: 0, DF: 1, MC: 2, DL: 3, EN: 4, "?": 5 };

  const filas: FilaPrecio[] = playersOfTeam(teamRaw)
    .sort(
      (a, b) =>
        ORDEN[a.position] - ORDEN[b.position] || b.marketValue - a.marketValue,
    )
    .map((player) => {
      const odds = ff.get(player);
      const calculado = precioDe(player, odds);
      const fijado = aMano[player.id];

      return {
        player,
        diff: odds?.diff ?? null,
        valor: calculado.valor,
        clausula: calculado.clausula,
        calculadoSalida: calculado.salida,
        calculadoMinimo: calculado.minimo,
        salida: fijado?.salida ?? null,
        minimo: fijado?.minimo ?? null,
        nota: fijado?.nota ?? null,
      };
    });

  const fijados = filas.filter((f) => f.salida || f.minimo).length;

  /* ------------------------------------------------------ lo que me han dicho */

  const managers = toList(teamsRaw)
    .map((raw, i) => toManager(raw, i, league.myTeamId))
    .filter((m) => !m.isMe)
    .map((m) => m.name);

  const conversaciones = (
    await Promise.all(
      managers.map(async (nombre) => ({
        nombre,
        lineas: await pila<Linea>(`chat:${nombre}`, 40),
      })),
    )
  )
    .filter((c) => c.lineas.length > 0)
    .sort((a, b) => (b.lineas[0]?.at ?? 0) - (a.lineas[0]?.at ?? 0));

  return (
    <>
      <PageHeader
        eyebrow={league.name}
        title="Negociaciones"
        meta={
          hayAlmacen()
            ? `${fijados} precios fijados a mano · ${conversaciones.length} managers han hablado con el bot`
            : "Sin almacén configurado: lo que guardes aquí se pierde al reiniciar"
        }
      />

      <Section title="Por cuánto vendo" count={filas.length}>
        <div className="p-3 sm:p-5">
          <p className="text-muted mb-3 max-w-2xl text-[0.85rem]">
            En gris está lo que calcula el bot solo. Escribe encima para mandar tú, y borra las
            dos casillas para volver al cálculo.
          </p>
          <PreciosVenta filas={filas} />
        </div>
      </Section>

      <Section title="Lo que me dicen" count={conversaciones.length}>
        {conversaciones.length === 0 ? (
          <Empty
            title="Todavía nadie ha negociado"
            hint="En cuanto alguien hable con el bot, la conversación aparece aquí."
          />
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3 sm:p-5">
            {conversaciones.map(({ nombre, lineas }) => (
              <section key={nombre} className="bg-panel border-line rounded-2xl border">
                <header className="border-line flex items-baseline justify-between gap-3 border-b px-4 py-2.5">
                  <h3 className="truncate font-semibold">{nombre}</h3>
                  <span className="text-faint shrink-0 text-[0.72rem]">
                    {new Date(lineas[0].at).toLocaleString("es-ES", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </header>

                {/* De la más antigua a la más nueva, que es como se leyó. */}
                <div className="space-y-2 px-4 py-3">
                  {[...lineas].reverse().map((linea, i) => (
                    <div key={i}>
                      <div className="flex justify-end">
                        <p className="bg-acid max-w-[80%] rounded-2xl px-3 py-1.5 text-[0.85rem] text-white">
                          {linea.dice}
                        </p>
                      </div>
                      <div className="mt-1 flex justify-start">
                        <p className="bg-panel-2 max-w-[80%] rounded-2xl px-3 py-1.5 text-[0.85rem]">
                          {linea.responde.replace(/\*\*/g, "")}
                        </p>
                      </div>
                      {linea.fase === "acuerdo" && (
                        <p className="text-up mt-1 text-center text-[0.72rem] font-semibold">
                          Cerrado en {money(linea.ofrece)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
