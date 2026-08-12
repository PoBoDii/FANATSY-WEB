/**
 * Botón a la página equivalente de futbolfantasy, la fuente de casi todo lo que
 * se enseña aquí: la ficha del jugador, la del club, el mercado, el partido.
 * Sirve para contrastar un dato raro o leer entero lo que aquí sólo se resume.
 *
 * Vive en su propio fichero y no en `ui.tsx` porque lo usan las tarjetas de
 * partido, y `ui.tsx` ya importa de ellas: juntos formarían un ciclo.
 *
 * Va con `relative z-10` porque muchas veces se pinta dentro de una fila que ya
 * es un enlace extendido; sin levantarlo, el clic se lo quedaría la fila.
 */
export function FfLink({
  href,
  label = "Ver en futbolfantasy",
  compact = false,
  tone = "panel",
}: {
  /** `null` cuando no se conoce el slug: entonces no se pinta nada. */
  href: string | null;
  label?: string;
  /** Sólo el icono y las siglas, para cabeceras apretadas. */
  compact?: boolean;
  /** `sobre-color` para las cabeceras de club, que van sobre el color del club. */
  tone?: "panel" | "sobre-color";
}) {
  if (!href) return null;

  const skin =
    tone === "sobre-color"
      ? "border-white/30 bg-black/25 text-white/90 hover:bg-black/40 hover:text-white"
      : "border-line bg-panel-2 text-muted hover:border-acid hover:text-acid";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`${label} — se abre en futbolfantasy.com`}
      className={`relative z-10 inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-[0.68rem] font-semibold transition-colors ${skin}`}
    >
      <span className="bg-acid inline-flex h-[15px] w-[15px] items-center justify-center rounded text-[0.5rem] font-bold text-white">
        FF
      </span>
      {!compact && <span>futbolfantasy</span>}
      <svg
        viewBox="0 0 12 12"
        className="h-2.5 w-2.5 shrink-0"
        aria-hidden
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M4.5 1.5h6v6" strokeLinecap="round" />
        <path d="M10.5 1.5 5 7" strokeLinecap="round" />
        <path d="M9 7.5v3h-8v-8h3" strokeLinecap="round" />
      </svg>
    </a>
  );
}
