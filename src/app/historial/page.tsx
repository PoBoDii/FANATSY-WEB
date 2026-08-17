import Link from "next/link";
import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { playersOfTeam, toActivity, toList, toManager, toPlayer } from "@/lib/normalize";
import { leerBlindajes, resumir, sincronizar, type Ficha } from "@/lib/historial";
import { hayAlmacen } from "@/lib/db";
import { money, shortDate } from "@/lib/format";
import { Empty, PageHeader, Section, StatTile } from "@/components/ui";
import { Blindaje } from "@/components/Blindaje";

export const dynamic = "force-dynamic";

/**
 * Cuánto he ganado con cada jugador que ha pasado por mi equipo.
 *
 * El feed de la liga no guarda memoria: a los pocos días los fichajes viejos
 * desaparecen. Cada visita a esta página copia lo que haya en el feed al
 * almacén, así que basta con entrar de vez en cuando para no perder nada.
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

  // Mi plantilla de hoy: da los puntos y el valor actual de los que sigo
  // teniendo, que es lo que decide si voy ganando o perdiendo con ellos.
  const mios = new Map(playersOfTeam(teamRaw).map((p) => [p.id, p]));

  // El listado de LaLiga pone nombre a los que ya vendí y no están en mi equipo.
  const catalogo = new Map<string, string>();
  for (const raw of toList(playersRaw)) {
    const p = toPlayer(raw);
    if (p.id) catalogo.set(p.id, p.name);
  }

  /* ------------------------------------------------------- copiar y resumir */

  const movimientos = await sincronizar(
    toList(activityRaw).map(toActivity),
    yo?.userId ?? null,
    (userId) => (userId ? (nombres.get(String(userId)) ?? null) : null),
    (playerId) => mios.get(playerId)?.points ?? 0,
    (playerId) => catalogo.get(playerId) ?? null,
  );

  const blindajes = await leerBlindajes();

  const fichas = resumir(
    movimientos,
    blindajes,
    (playerId) => mios.get(playerId)?.marketValue ?? null,
    (playerId) => mios.get(playerId)?.points ?? null,
  );

  const abiertas = fichas.filter((f) => !f.cerrado);
  const cerradas = fichas.filter((f) => f.cerrado);

  const realizado = cerradas.reduce((total, f) => total + f.balance, 0);
  const latente = abiertas.reduce((total, f) => total + f.balance, 0);
  const enBlindajes = fichas.reduce((total, f) => total + f.blindaje, 0);
  const puntos = fichas.reduce((total, f) => total + f.puntos, 0);

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
        <StatTile
          label="Ganado vendiendo"
          value={money(realizado)}
          sub={`${cerradas.length} ventas`}
          tone={realizado >= 0 ? "up" : "down"}
        />
        <StatTile
          label="Plusvalía en plantilla"
          value={money(latente)}
          sub="si vendiera hoy a precio de mercado"
          tone={latente >= 0 ? "up" : "down"}
          delay={60}
        />
        <StatTile
          label="Gastado en blindajes"
          value={money(enBlindajes)}
          sub={`${money(enBlindajes * 2)} de cláusula`}
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
            {abiertas.map((ficha) => (
              <FilaFicha key={ficha.playerId} ficha={ficha} />
            ))}
          </ol>
        )}
      </Section>

      {cerradas.length > 0 && (
        <Section title="Vendidos" count={cerradas.length}>
          <ol>
            {cerradas.map((ficha) => (
              <FilaFicha key={ficha.playerId} ficha={ficha} />
            ))}
          </ol>
        </Section>
      )}
    </>
  );
}

function FilaFicha({ ficha }: { ficha: Ficha }) {
  const bien = ficha.balance >= 0;

  return (
    <li className="border-line border-b px-3.5 py-3 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link href={`/jugador/${ficha.playerId}`} className="hover:text-acid font-semibold">
          {ficha.playerName}
        </Link>

        <span className={`tnum ml-auto font-semibold ${bien ? "text-up" : "text-down"}`}>
          {bien ? "+" : ""}
          {money(ficha.balance)}
        </span>
        {!ficha.cerrado && <span className="text-faint text-[0.7rem]">estimado</span>}
      </div>

      <p className="text-muted mt-1 text-[0.82rem]">
        {ficha.fichado ? (
          <>
            Fichado por <strong className="text-ink">{money(ficha.fichado.amount)}</strong>
            {ficha.fichado.contraparte ? ` a ${ficha.fichado.contraparte}` : ""} el{" "}
            {shortDate(ficha.fichado.date)}
          </>
        ) : (
          "Sin fichaje apuntado"
        )}
        {ficha.vendido && (
          <>
            {" · vendido por "}
            <strong className="text-ink">{money(ficha.vendido.amount)}</strong>
            {ficha.vendido.contraparte ? ` a ${ficha.vendido.contraparte}` : ""} el{" "}
            {shortDate(ficha.vendido.date)}
          </>
        )}
        {ficha.puntos > 0 && ` · ${ficha.puntos} puntos conmigo`}
      </p>

      {/* Los blindajes sólo se apuntan mientras el jugador es mío; una vez
          vendido el gasto ya está metido en el balance y no se toca. */}
      <div className="mt-2">
        {ficha.cerrado ? (
          ficha.blindaje > 0 && (
            <p className="text-faint text-[0.75rem]">
              {money(ficha.blindaje)} en blindajes ({money(ficha.clausulaGanada)} de cláusula)
            </p>
          )
        ) : (
          <Blindaje playerId={ficha.playerId} gastado={ficha.blindaje} />
        )}
      </div>
    </li>
  );
}
