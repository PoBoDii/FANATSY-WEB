import Link from "next/link";
import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { playersOfTeam, toList, toManager } from "@/lib/normalize";
import { getFf } from "@/lib/futbolfantasy";
import { squadSwing } from "@/lib/valores";
import { managerColor } from "@/lib/managers";
import { money, num, signed } from "@/lib/format";
import { Empty, ErrorBox, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LigaPage() {
  const session = await getSession();
  if (!session.active) {
    return (
      <Empty
        title="Todavía sin liga"
        hint="Crea o únete a una liga desde la app oficial y esto se llenará solo. Los detalles, en Mi plantilla."
      />
    );
  }

  const league = session.active;
  const [{ data, error }, ff] = await Promise.all([
    safe(fantasy.leagueTeams(league.id)),
    getFf(),
  ]);

  if (error) return <ErrorBox error={error} />;

  const now = Date.now();
  const managers = toList(data)
    .map((raw, i) => {
      const squad = playersOfTeam(raw);
      const manager = toManager(raw, i, league.myTeamId);
      return {
        ...manager,
        // Cuántos de sus jugadores se pueden clausular ya mismo.
        openClauses: squad.filter(
          (p) =>
            p.buyoutClause && (!p.buyoutUnlockAt || new Date(p.buyoutUnlockAt).getTime() <= now),
        ).length,
        // Cuánto se le ha movido la plantilla desde ayer.
        swing: squadSwing(squad, (p) => ff.get(p)),
        color: managerColor(i, manager.isMe),
      };
    })
    .sort((a, b) => a.position - b.position);

  if (managers.length === 0) {
    return (
      <>
        <PageHeader eyebrow={league.name} title="Clasificación" />
        <Empty title="Clasificación vacía" hint="Aún no hay puntos en esta liga." />
      </>
    );
  }

  const leader = managers[0];
  const me = managers.find((m) => m.isMe);

  // Mi propio equipo lleva a "Mi plantilla", que es la vista buena (con campo)
  // y no a la ficha de rival.
  const hrefOf = (m: { isMe: boolean; teamId: string }) => (m.isMe ? "/" : `/equipo/${m.teamId}`);

  return (
    <>
      <PageHeader
        eyebrow={league.name}
        title="Clasificación"
        meta={
          <>
            {managers.length} managers
            {me ? ` · vas ${me.position}º, a ${num(leader.points - me.points)} pts del líder` : ""}
          </>
        }
      />

      {/* Podio */}
      <div className="border-line grid grid-cols-1 border-b sm:grid-cols-3">
        {managers.slice(0, 3).map((m, i) => (
          <Link
            key={m.teamId}
            href={hrefOf(m)}
            className="rise group relative overflow-hidden border-b border-white/20 px-5 py-6 text-white transition-transform last:border-b-0 hover:-translate-y-0.5 sm:border-r sm:border-b-0 sm:last:border-r-0"
            style={{
              animationDelay: `${i * 80}ms`,
              // Degradado del color del manager: la clasificación deja de ser
              // una tabla gris y cada equipo se reconoce por su color.
              background: `linear-gradient(140deg, ${m.color} 0%, ${m.color}cc 55%, ${m.color}99 100%)`,
            }}
          >
            <div className="flex items-baseline gap-3">
              <span className="display text-5xl leading-none opacity-90">{m.position}</span>
              <div className="min-w-0">
                <div className="truncate text-[1.05rem] font-bold group-hover:underline">
                  {m.name}
                </div>
                {m.isMe && (
                  <span className="mt-1 inline-block rounded bg-white/25 px-1.5 py-[1px] text-[0.6rem] font-bold tracking-wide uppercase">
                    tú
                  </span>
                )}
              </div>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="tnum text-3xl font-bold">{num(m.points)}</span>
              <span className="tnum text-xs opacity-80">{money(m.teamValue)}</span>
            </div>
            <div className="mt-3">
              <NetChip net={m.swing.net} />
            </div>
          </Link>
        ))}
      </div>

      {/* Tabla completa */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-line border-b">
              <th className="label px-5 py-3 text-left lg:px-6">#</th>
              <th className="label px-3 py-3 text-left">Manager</th>
              <th className="label px-3 py-3 text-right">Cláusulas abiertas</th>
              <th className="label px-3 py-3 text-right">Valor hoy</th>
              <th className="label px-3 py-3 text-right">Jornada</th>
              <th className="label px-3 py-3 text-right">Valor</th>
              <th className="label px-5 py-3 text-right lg:px-6">Puntos</th>
            </tr>
          </thead>
          <tbody>
            {managers.map((m, i) => (
              <tr
                key={m.teamId}
                className={`border-line rise hover:bg-panel-2 border-b transition-colors ${
                  m.isMe ? "bg-acid/[0.04]" : ""
                }`}
                style={{ animationDelay: `${Math.min(i * 25, 400)}ms` }}
              >
                <td className="tnum text-faint relative px-5 py-3 lg:px-6">
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-[5px]"
                    style={{ background: m.color }}
                  />
                  {m.position}
                </td>
                <td className="px-3 py-3">
                  <Link href={hrefOf(m)} className="hover:text-acid font-medium transition-colors">
                    {m.name}
                  </Link>
                  {m.isMe && <span className="label text-acid ml-2">tú</span>}
                </td>
                <td className="px-3 py-3 text-right">
                  {m.openClauses > 0 ? (
                    <span className="tnum border-down/50 bg-down/15 text-down rounded-sm border px-2 py-[3px] text-sm font-semibold">
                      {m.openClauses}
                    </span>
                  ) : (
                    <span className="tnum text-faint text-sm">0</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="flex justify-end">
                    <NetChip net={m.swing.net} />
                  </div>
                  <div className="text-faint mt-1 text-[0.62rem]">
                    {m.swing.risers} suben · {m.swing.fallers} bajan
                  </div>
                </td>
                <td className="tnum text-muted px-3 py-3 text-right">
                  {m.weekPoints === null ? "—" : num(m.weekPoints)}
                </td>
                <td className="tnum text-muted px-3 py-3 text-right">{money(m.teamValue)}</td>
                <td className="tnum px-5 py-3 text-right lg:px-6">{num(m.points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-faint px-5 py-6 text-xs lg:px-6">
        Pincha en cualquier manager para ver su plantilla completa. «Valor hoy» es lo que ha
        ganado o perdido su plantilla desde ayer; el desglose de subidas y bajadas está dentro.
      </p>
    </>
  );
}

/**
 * Lo que ha ganado o perdido la plantilla hoy, en neto. Es el número que se
 * compara entre managers; el desglose de subidas y bajadas está dentro de cada
 * equipo, que es donde sirve de algo.
 */
function NetChip({ net }: { net: number }) {
  if (net === 0) {
    return <span className="tnum text-faint text-[0.72rem]">sin cambios</span>;
  }
  const up = net > 0;
  return (
    <span
      className={`tnum inline-flex items-center gap-1 rounded-md px-2 py-[3px] text-[0.85rem] font-bold ${
        up ? "bg-up text-white" : "bg-down text-white"
      }`}
      title="Subidas menos bajadas de toda la plantilla desde ayer"
    >
      {up ? "▲" : "▼"} {signed(net)}
    </span>
  );
}
