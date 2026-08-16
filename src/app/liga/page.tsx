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

      {/* Una fila por manager. En vez de una tabla con siete columnas que en el
          móvil hay que deslizar, cada manager es una tarjeta ancha con lo suyo
          repartido: puesto y nombre a la izquierda, dinero y puntos a la
          derecha. Cabe entera en cualquier pantalla. */}
      <div className="border-line flex gap-1.5 overflow-x-auto border-b px-3.5 py-2.5 sm:px-5 lg:px-6">
        <span className="label shrink-0 self-center pr-1">Ordenar</span>
        {COLUMNS.filter((c) => c.key !== "puesto").map((col) => {
          const active = sort === col.key;
          const nextDir = active ? (dir === "desc" ? "asc" : "desc") : col.natural;
          return (
            <Link
              key={col.key}
              href={sortHref(col.key, nextDir)}
              scroll={false}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.78rem] transition-colors ${
                active ? "bg-ink text-void font-semibold" : "bg-panel-2 text-muted hover:text-ink"
              }`}
            >
              {col.label}
              {active && <span className="text-[0.62rem] opacity-70">{dir === "desc" ? "▼" : "▲"}</span>}
            </Link>
          );
        })}
        <Link
          href={sortHref("puesto", "asc")}
          scroll={false}
          className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-[0.78rem] transition-colors ${
            sort === "puesto" ? "bg-ink text-void font-semibold" : "bg-panel-2 text-muted hover:text-ink"
          }`}
        >
          Puesto
        </Link>
      </div>

      {/* Siempre en una columna: una clasificación se lee 1, 2, 3… y en dos
          columnas el cuarto queda a la derecha del primero. */}
      <div className="mx-auto grid max-w-3xl gap-2 p-2.5 sm:p-3 lg:p-4">
        {rows.map((m, i) => (
          <Link
            key={m.teamId}
            href={hrefOf(m)}
            className={`rise bg-panel border-line hover:border-faint/60 relative flex items-center gap-3 overflow-hidden rounded-2xl border py-2.5 pr-3 pl-3.5 transition-colors sm:gap-4 sm:py-3 sm:pr-4 sm:pl-5 ${
              m.isMe ? "border-acid/50" : ""
            }`}
            style={{ animationDelay: `${Math.min(i * 25, 400)}ms` }}
          >
            {/* Franja del color del manager, a todo lo alto: es lo que hace
                reconocible una fila sin leer el nombre. */}
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-[5px]"
              style={{ background: m.color }}
            />

            <span className="tnum text-faint w-5 shrink-0 text-center text-[1rem] font-semibold sm:w-7 sm:text-[1.15rem]">
              {m.position}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-[1.02rem] font-semibold sm:text-[1.15rem]">
                  {m.name}
                </span>
                {m.isMe && (
                  <span
                    className="shrink-0 rounded-full px-1.5 py-[1px] text-[0.55rem] font-bold text-black"
                    style={{ background: m.color }}
                  >
                    TÚ
                  </span>
                )}
              </span>
              <span className="text-faint mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.7rem]">
                <span className="tnum">{money(m.teamValue)}</span>
                {m.openClauses > 0 && (
                  <span className="text-down">{m.openClauses} sin blindar</span>
                )}
                {m.weekPoints !== null && (
                  <span className="tnum hidden sm:inline">{num(m.weekPoints)} esta jornada</span>
                )}
              </span>
            </span>

            <span className="shrink-0 text-right">
              <NetChip net={m.swing.net} />
              <span className="text-faint mt-1 block text-[0.62rem]">
                {m.swing.risers} suben · {m.swing.fallers} bajan
              </span>
            </span>

            <span className="w-[46px] shrink-0 text-right sm:w-[56px]">
              <span className="tnum block text-[1.35rem] leading-none font-semibold sm:text-[1.6rem]">
                {num(m.points)}
              </span>
              <span className="label text-[0.5rem]">puntos</span>
            </span>
          </Link>
        ))}
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
