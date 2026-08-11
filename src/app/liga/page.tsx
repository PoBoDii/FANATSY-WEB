import Link from "next/link";
import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { playersOfTeam, toList, toManager } from "@/lib/normalize";
import { money, num } from "@/lib/format";
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
  const { data, error } = await safe(fantasy.leagueTeams(league.id));

  if (error) return <ErrorBox error={error} />;

  const now = Date.now();
  const managers = toList(data)
    .map((raw, i) => ({
      ...toManager(raw, i, league.myTeamId),
      // Cuántos de sus jugadores se pueden clausular ya mismo.
      openClauses: playersOfTeam(raw).filter(
        (p) =>
          p.buyoutClause && (!p.buyoutUnlockAt || new Date(p.buyoutUnlockAt).getTime() <= now),
      ).length,
    }))
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
            href={`/equipo/${m.teamId}`}
            className="border-line rise hover:bg-panel-2 group border-b px-5 py-6 transition-colors last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="flex items-baseline gap-3">
              <span className={`display text-4xl ${i === 0 ? "text-acid" : "text-faint"}`}>
                {m.position}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[0.95rem] font-medium group-hover:underline">
                  {m.name}
                </div>
                {m.isMe && <span className="label text-acid">tú</span>}
              </div>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="tnum text-2xl">{num(m.points)}</span>
              <span className="tnum text-faint text-xs">{money(m.teamValue)}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Tabla completa */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-line border-b">
              <th className="label px-5 py-3 text-left lg:px-6">#</th>
              <th className="label px-3 py-3 text-left">Manager</th>
              <th className="label px-3 py-3 text-right">Cláusulas abiertas</th>
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
                <td className="tnum text-faint px-5 py-3 lg:px-6">
                  {m.isMe && <span className="bg-acid mr-2 inline-block h-3 w-[2px] align-middle" />}
                  {m.position}
                </td>
                <td className="px-3 py-3">
                  <Link href={`/equipo/${m.teamId}`} className="hover:text-acid transition-colors">
                    {m.name}
                  </Link>
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
        Pincha en cualquier manager para ver su plantilla completa.
      </p>
    </>
  );
}
