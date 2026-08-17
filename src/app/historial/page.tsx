import Link from "next/link";
import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { playersOfTeam, toActivity, toList, toManager, toPlayer } from "@/lib/normalize";
import {
  resumir,
  seguirClausulas,
  seguirPuntos,
  sincronizar,
  totales,
  type Etapa,
} from "@/lib/historial";
import { hayAlmacen } from "@/lib/db";
import { money, shortDate } from "@/lib/format";
import { Empty, PageHeader, Section, StatTile } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Cuánto he ganado con cada jugador que ha pasado por mi equipo.
 *
 * El feed de la liga no guarda memoria: a los pocos días los fichajes viejos
 * desaparecen. Cada visita a esta página copia lo que haya al almacén y mira si
 * alguna cláusula ha subido, así que basta con entrar de vez en cuando para no
 * perder nada.
 */
export default async function HistorialPage() {
  const session = await getSession();
  const league = session.active;
  if (!league) return <Empty title="Todavía sin liga" hint="Los detalles, en Mi plantilla." />;

  const [{ data: activityRaw }, { data: teamsRaw }, { data: teamRaw }, { data: playersRaw }] =
    await Promise.all([
      safe(fantasy.activity(league.id)),
      safe(fantasy.leagueTeams(league.id)),
      safe(fantasy.team(league.id, league.myTeamId ?? "")),
      safe(fantasy.players()),
    ]);

  /* ------------------------------------------------ con qué se resuelve todo */

  const managers = toList(teamsRaw).map((raw, i) => toManager(raw, i, league.myTeamId));
  const yo = managers.find((m) => m.isMe) ?? null;

  const nombres = new Map<string, string>();
  for (const m of managers) if (m.userId) nombres.set(String(m.userId), m.name);

  const mios = playersOfTeam(teamRaw);

  // El listado de LaLiga pone nombre a los que ya vendí y no están en mi equipo.
  const catalogo = new Map<string, string>();
  for (const raw of toList(playersRaw)) {
    const p = toPlayer(raw);
    if (p.id) catalogo.set(p.id, p.name);
  }

  /* -------------------------------------------------------- copiar y resumir */

  const movimientos = await sincronizar(
    toList(activityRaw).map(toActivity),
    yo?.userId ?? null,
    (userId) => (userId ? (nombres.get(String(userId)) ?? null) : null),
    (playerId) => catalogo.get(playerId) ?? null,
  );

  const [subidas, semanas] = await Promise.all([
    seguirClausulas(mios, movimientos),
    league.myTeamId
      ? seguirPuntos(league.myTeamId, mios)
      : Promise.resolve({} as Awaited<ReturnType<typeof seguirPuntos>>),
  ]);

  const etapas = resumir(movimientos, subidas, semanas);
  const { cerradas, abiertas, realizado, invertido, blindajes, puntos } = totales(etapas);

  return (
    <>
      <PageHeader
        eyebrow={league.name}
        title="Compraventa"
        meta={
          hayAlmacen()
            ? `${cerradas.length} operaciones cerradas · ${abiertas.length} en plantilla`
            : "Sin almacén configurado: esto se pierde al reiniciar el servidor"
        }
      />

      <div className="border-line grid grid-cols-2 border-b lg:grid-cols-4">
        {/* Sólo cuenta lo vendido: mientras un jugador siga en la plantilla no
            he ganado ni perdido nada con él, por mucho que su valor se mueva. */}
        <StatTile
          label="Balance"
          value={money(realizado)}
          sub={`${cerradas.length} operaciones cerradas`}
          tone={realizado > 0 ? "up" : realizado < 0 ? "down" : undefined}
        />
        <StatTile
          label="Invertido ahora"
          value={money(invertido)}
          sub="fichajes y blindajes en curso"
          delay={60}
        />
        <StatTile
          label="Gastado en blindajes"
          value={money(blindajes)}
          sub={`${money(blindajes * 2)} de cláusula`}
          delay={120}
        />
        <StatTile label="Puntos generados" value={String(puntos)} tone="acid" delay={180} />
      </div>

      <Section title="En plantilla" count={abiertas.length}>
        {abiertas.length === 0 ? (
          <Empty
            title="Todavía sin fichajes apuntados"
            hint="En cuanto fiches a alguien aparecerá aquí solo."
          />
        ) : (
          <ol>
            {abiertas.map((etapa) => (
              <Fila key={etapa.id} etapa={etapa} />
            ))}
          </ol>
        )}
      </Section>

      {cerradas.length > 0 && (
        <Section title="Vendidos" count={cerradas.length}>
          <ol>
            {cerradas.map((etapa) => (
              <Fila key={etapa.id} etapa={etapa} />
            ))}
          </ol>
        </Section>
      )}
    </>
  );
}

function Fila({ etapa }: { etapa: Etapa }) {
  const bien = etapa.balance >= 0;

  return (
    <li className="border-line border-b px-3.5 py-3 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link href={`/jugador/${etapa.playerId}`} className="hover:text-acid font-semibold">
          {etapa.playerName}
        </Link>

        {etapa.puntos > 0 && (
          <span className="text-acid tnum text-[0.78rem] font-semibold">
            {etapa.puntos} pts conmigo
          </span>
        )}

        <span className={`tnum ml-auto font-semibold ${bien ? "text-up" : "text-down"}`}>
          {bien ? "+" : ""}
          {money(etapa.balance)}
        </span>
      </div>

      {/* La operación contada por orden: lo que pagué, lo que puse después y lo
          que cobré. Cada línea es dinero que ha salido o entrado. */}
      <ul className="text-muted mt-1.5 space-y-0.5 text-[0.82rem]">
        <li>
          Fichado por <strong className="text-ink">{money(etapa.fichado.amount)}</strong>
          {etapa.fichado.contraparte ? ` a ${etapa.fichado.contraparte}` : ""} el{" "}
          {shortDate(etapa.fichado.date)}
        </li>

        {etapa.subidas.map((subida, i) => (
          <li key={i}>
            Cláusula subida a <strong className="text-ink">{money(subida.a)}</strong> ·{" "}
            <strong className="text-ink">{money(subida.gastado)}</strong> gastados el{" "}
            {shortDate(new Date(subida.at).toISOString())}
          </li>
        ))}

        {etapa.vendido && (
          <li>
            Vendido por <strong className="text-up">{money(etapa.vendido.amount)}</strong>
            {etapa.vendido.contraparte ? ` a ${etapa.vendido.contraparte}` : ""} el{" "}
            {shortDate(etapa.vendido.date)}
          </li>
        )}

        {!etapa.cerrado && (
          <li className="text-faint">
            Llevo {money(etapa.fichado.amount + etapa.blindaje)} metidos. El balance se cierra
            cuando lo venda.
          </li>
        )}
      </ul>
    </li>
  );
}
