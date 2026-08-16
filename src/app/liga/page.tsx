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

type Sort = "puesto" | "manager" | "clausulas" | "valorhoy" | "jornada" | "valor" | "puntos";

/** Columnas de la tabla. Ordena igual que el mercado: se pulsa el título. */
const COLUMNS: {
  key: Sort;
  label: string;
  align: "left" | "right";
  natural: "asc" | "desc";
  /** Clases de visibilidad: en el móvil no caben las siete. */
  hide?: string;
}[] = [
  { key: "puesto", label: "#", align: "left", natural: "asc" },
  { key: "manager", label: "Manager", align: "left", natural: "asc" },
  { key: "clausulas", label: "Cláusulas", align: "right", natural: "desc", hide: "hidden sm:table-cell" },
  { key: "valorhoy", label: "Valor hoy", align: "right", natural: "desc" },
  { key: "jornada", label: "Jornada", align: "right", natural: "desc", hide: "hidden md:table-cell" },
  { key: "valor", label: "Valor", align: "right", natural: "desc", hide: "hidden sm:table-cell" },
  { key: "puntos", label: "Puntos", align: "right", natural: "desc" },
];

export default async function LigaPage({
  searchParams,
}: {
  searchParams: Promise<{ orden?: string; dir?: string }>;
}) {
  const { orden, dir: rawDir } = await searchParams;
  const column = COLUMNS.find((c) => c.key === orden);
  const sort: Sort = column?.key ?? "puesto";
  const dir: "asc" | "desc" =
    rawDir === "asc" || rawDir === "desc" ? rawDir : (column?.natural ?? "asc");
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

  // El podio siempre va por clasificación; lo que se reordena es la tabla.
  type Row = (typeof managers)[number];
  const compare = (a: Row, b: Row): number => {
    switch (sort) {
      case "manager":
        return a.name.localeCompare(b.name, "es");
      case "clausulas":
        return b.openClauses - a.openClauses || a.position - b.position;
      case "valorhoy":
        return b.swing.net - a.swing.net;
      case "jornada":
        return (b.weekPoints ?? -1) - (a.weekPoints ?? -1);
      case "valor":
        return b.teamValue - a.teamValue;
      case "puntos":
        return b.points - a.points || a.position - b.position;
      default:
        return a.position - b.position;
    }
  };

  const ordered = [...managers].sort(compare);
  const rows = dir === "asc" ? ordered : [...ordered].reverse();

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

  const sortHref = (key: Sort, next: "asc" | "desc") => `/liga?orden=${key}&dir=${next}`;

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

      {/* Tabla completa */}
      <div className="border-line mx-3 mb-6 overflow-x-auto rounded-2xl border bg-panel shadow-sm sm:mx-4 lg:mx-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-line bg-panel-2/60 border-b">
              {COLUMNS.map((col, i) => {
                const active = sort === col.key;
                const nextDir = active ? (dir === "desc" ? "asc" : "desc") : col.natural;
                const edge = i === 0 ? "pl-5 lg:pl-6" : i === COLUMNS.length - 1 ? "pr-5 lg:pr-6" : "";
                return (
                  <th
                    key={col.key}
                    className={`px-2.5 py-2.5 sm:px-3 ${edge} ${col.hide ?? ""} ${
                      col.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    <Link
                      href={sortHref(col.key, nextDir)}
                      scroll={false}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 transition-colors ${
                        active ? "bg-acid/10 text-acid" : "text-faint hover:text-ink"
                      }`}
                      title={`Ordenar por ${col.label}`}
                    >
                      <span className="text-[0.62rem] font-bold tracking-wide uppercase">
                        {col.label}
                      </span>
                      <span className={`text-[0.6rem] leading-none ${active ? "" : "opacity-30"}`}>
                        {active ? (dir === "desc" ? "▼" : "▲") : "▼"}
                      </span>
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <tr
                key={m.teamId}
                className={`border-line rise hover:bg-panel-2 border-b transition-colors last:border-b-0 ${
                  m.isMe ? "bg-acid/[0.04]" : ""
                }`}
                style={{ animationDelay: `${Math.min(i * 25, 400)}ms` }}
              >
                <td className="relative px-3 py-3 text-left sm:px-5 lg:px-6">
                  {/* La posición se lee mejor como número que dentro de una
                      cápsula de color: el color ya lo lleva el punto del nombre. */}
                  <span className="tnum text-muted text-[0.95rem] font-semibold">{m.position}</span>
                </td>
                <td className="px-2.5 py-3 text-left sm:px-3">
                  <Link
                    href={hrefOf(m)}
                    className="hover:text-acid inline-flex items-center gap-2 font-medium transition-colors"
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: m.color }}
                    />
                    {m.name}
                  </Link>
                  {m.isMe && <span className="label text-acid ml-2">tú</span>}
                </td>
                <td className="hidden px-2.5 py-3 text-right sm:table-cell sm:px-3">
                  {m.openClauses > 0 ? (
                    <span className="tnum border-down/50 bg-down/15 text-down rounded-sm border px-2 py-[3px] text-sm font-semibold">
                      {m.openClauses}
                    </span>
                  ) : (
                    <span className="tnum text-faint text-sm">0</span>
                  )}
                </td>
                <td className="px-2.5 py-3 text-right sm:px-3">
                  <div className="flex justify-end">
                    <NetChip net={m.swing.net} />
                  </div>
                  <div className="text-faint mt-1 text-[0.62rem]">
                    {m.swing.risers} suben · {m.swing.fallers} bajan
                  </div>
                </td>
                <td className="tnum text-muted hidden px-3 py-3 text-right md:table-cell">
                  {m.weekPoints === null ? "—" : num(m.weekPoints)}
                </td>
                <td className="tnum text-muted hidden px-3 py-3 text-right sm:table-cell">
                  {money(m.teamValue)}
                </td>
                <td className="tnum px-3 py-3 text-right sm:px-5 lg:px-6">{num(m.points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-faint px-5 pb-8 text-xs lg:px-6">
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
