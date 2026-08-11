import { fantasy, safe } from "@/lib/api";
import { getFf } from "@/lib/futbolfantasy";
import { dateTime } from "@/lib/format";
import { getSession } from "@/lib/session";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Consola cruda contra la API. Existe porque los nombres de campo de LaLiga
 * cambian entre temporadas: si una vista sale vacía, aquí se ve el JSON real y
 * se ajusta el normalizador en src/lib/normalize.ts.
 */
export default async function DebugPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string }>;
}) {
  const { path } = await searchParams;
  const session = await getSession();
  const league = session.active;
  const team = league?.myTeamId;

  const presets = [
    { label: "Mi usuario", path: "/v3/user/me" },
    { label: "Mis ligas", path: "/v3/leagues" },
    { label: "Jornada actual", path: "/v3/week/current" },
    { label: "Calendario", path: "/v3/calendar" },
    ...(league
      ? [
          { label: "Detalle de la liga", path: `/v3/leagues/${league.id}` },
          { label: "Equipos + clasificación", path: `/v5/leagues/${league.id}/teams` },
          { label: "Mercado", path: `/v3/league/${league.id}/market` },
          { label: "Actividad", path: `/v5/leagues/${league.id}/activity` },
        ]
      : []),
    ...(league && team
      ? [
          { label: "Mi equipo", path: `/v3/leagues/${league.id}/teams/${team}` },
          { label: "Mi alineación", path: `/v3/teams/${team}/lineup` },
          { label: "Mi saldo", path: `/v3/teams/${team}/money` },
        ]
      : []),
  ];

  const result = path ? await safe(fantasy.raw(path)) : null;
  const odds = await getFf();

  return (
    <>
      <PageHeader
        eyebrow="Herramientas"
        title="Diagnóstico"
        meta="Lanza cualquier endpoint de la API y mira la respuesta tal cual llega."
      />

      <div className="border-line border-b px-5 py-5 lg:px-6">
        <div className="label mb-3">Atajos</div>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <a
              key={p.path}
              href={`/debug?path=${encodeURIComponent(p.path)}`}
              className={`border-line hover:border-acid hover:text-acid border px-3 py-1.5 text-xs transition-colors ${
                path === p.path ? "border-acid text-acid" : "text-muted"
              }`}
            >
              {p.label}
            </a>
          ))}
        </div>
      </div>

      <div className="border-line border-b px-5 py-5 lg:px-6">
        <div className="label mb-3">Probabilidades (futbolfantasy)</div>
        {odds.size > 0 ? (
          <p className="text-muted text-sm">
            <span className="tnum text-acid">{odds.size}</span> jugadores indexados (
            <span className="tnum">{odds.withProbability}</span> con probabilidad publicada),
            actualizado {dateTime(new Date(odds.builtAt).toISOString())}. Se reconstruye entero
            cada 5 min; consultar un jugador no cuesta ninguna petición.
          </p>
        ) : (
          <p className="text-down text-sm">
            Sin datos: futbolfantasy no respondió o cambió el marcado. El panel sigue
            funcionando, simplemente no se enseña la probabilidad.
          </p>
        )}
      </div>

      <form action="/debug" className="border-line flex gap-2 border-b px-5 py-5 lg:px-6">
        <input
          name="path"
          defaultValue={path ?? ""}
          placeholder="/v3/competition/1/players"
          className="border-line bg-panel tnum focus:border-acid min-w-0 flex-1 border px-3 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          className="bg-acid display hover:bg-acid/85 rounded-lg px-5 py-2 text-sm text-white transition-colors"
        >
          Lanzar
        </button>
      </form>

      <div className="px-5 py-5 lg:px-6">
        {!path && (
          <p className="text-faint text-sm">
            Elige un atajo o escribe una ruta. Se manda con tu token y{" "}
            <span className="tnum">x-lang=es</span> ya puestos.
          </p>
        )}

        {result?.error && (
          <div className="border-down/40 bg-down/5 border px-4 py-3">
            <div className="label text-down">Error</div>
            <p className="tnum mt-1.5 text-sm break-words">{result.error}</p>
          </div>
        )}

        {result?.data !== undefined && result.data !== null && (
          <pre className="border-line bg-panel tnum max-h-[70vh] overflow-auto border p-4 text-xs leading-relaxed">
            {JSON.stringify(result.data, null, 2)}
          </pre>
        )}
      </div>
    </>
  );
}
