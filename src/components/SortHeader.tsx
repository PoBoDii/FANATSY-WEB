import Link from "next/link";

/**
 * Cabecera de tabla para las listas que no son un `<table>`.
 *
 * Las filas de jugador son cajas flex, no celdas, así que la cabecera repite
 * los mismos anchos para que cada título caiga sobre su columna. Se pulsa el
 * título y ordena por él; la flecha dice por cuál y en qué sentido.
 */
export type SortColumn<K extends string> = {
  key: K;
  label: string;
  /** Mismas clases de ancho que la celda de la fila. */
  width: string;
  align?: "left" | "right" | "center";
  /** Dirección al entrar por primera vez. Casi siempre de mayor a menor. */
  natural?: "asc" | "desc";
  /** Clases de visibilidad, iguales a las de la celda ("hidden sm:flex"). */
  hide?: string;
  /** Columna que no ordena: sólo guarda el sitio de una celda de la fila. */
  spacer?: boolean;
};

export function SortHeader<K extends string>({
  columns,
  sort,
  dir,
  hrefOf,
  leading,
}: {
  columns: SortColumn<K>[];
  sort: K;
  dir: "asc" | "desc";
  /** Construye el enlace de cada columna; cada página tiene su ruta. */
  hrefOf: (key: K, dir: "asc" | "desc") => string;
  /** Ancho del hueco inicial, el de la foto. */
  leading?: string;
}) {
  const sortable = columns.filter((c) => !c.spacer && c.label);

  return (
    <>
    {/* En el móvil las filas se parten en dos líneas y una cabecera de columnas
        no cuadraría con nada: allí se ordena con una tira de pastillas que se
        desliza en horizontal. */}
    <div className="border-line bg-panel-2/70 sticky top-0 z-20 flex gap-1.5 overflow-x-auto border-y px-3 py-2 backdrop-blur-sm sm:hidden">
      <span className="label shrink-0 self-center pr-1">Ordenar</span>
      {sortable.map((col) => {
        const active = sort === col.key;
        const nextDir = active ? (dir === "desc" ? "asc" : "desc") : (col.natural ?? "desc");
        return (
          <Link
            key={col.key}
            href={hrefOf(col.key, nextDir)}
            scroll={false}
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold transition-colors ${
              active ? "border-acid bg-acid text-white" : "border-line text-muted"
            }`}
          >
            {col.label}
            {active && <span className="ml-1 text-[0.6rem]">{dir === "desc" ? "▼" : "▲"}</span>}
          </Link>
        );
      })}
    </div>

    <div className="border-line bg-panel-2/70 sticky top-0 z-20 hidden items-center gap-3 border-y py-2 pr-4 pl-4 backdrop-blur-sm sm:flex lg:gap-5 lg:pr-6 lg:pl-6">
      {leading && <span className={`${leading} shrink-0`} aria-hidden />}

      {columns.map((col) => {
        const grow = col.width.startsWith("flex-1")
          ? `min-w-0 ${col.width}`
          : `${col.width} shrink-0`;

        if (col.spacer) {
          return <span key={col.key} className={`${grow} ${col.hide ?? ""}`} aria-hidden />;
        }

        const active = sort === col.key;
        // Pulsar la activa da la vuelta; pulsar otra entra por su orden natural.
        const nextDir = active ? (dir === "desc" ? "asc" : "desc") : (col.natural ?? "desc");
        const justify =
          col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "";

        return (
          <Link
            key={col.key}
            href={hrefOf(col.key, nextDir)}
            scroll={false}
            className={`${grow} ${col.hide ?? "flex"} items-center gap-1 rounded-full px-1 py-0.5 ${justify} transition-colors ${
              active ? "bg-acid/10 text-acid" : "text-faint hover:text-ink"
            }`}
            title={`Ordenar por ${col.label}`}
          >
            <span className="text-[0.62rem] font-bold tracking-wide uppercase">{col.label}</span>
            <span className={`text-[0.6rem] leading-none ${active ? "" : "opacity-30"}`}>
              {active ? (dir === "desc" ? "▼" : "▲") : "▼"}
            </span>
          </Link>
        );
      })}
    </div>
    </>
  );
}
