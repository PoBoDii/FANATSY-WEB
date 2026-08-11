import { money, signed } from "@/lib/format";
import type { ValueSwing } from "@/lib/valores";

/**
 * Cuánto se ha movido el valor de una plantilla hoy.
 *
 * Subidas y bajadas van por separado porque el neto las esconde: ganar 3 M€ y
 * perder 3 M€ no es un día tranquilo. El total va al lado, no en lugar de
 * ellas.
 */
export function SwingBand({ swing, mine = false }: { swing: ValueSwing; mine?: boolean }) {
  const quiet = swing.up === 0 && swing.down === 0;
  const people = (n: number) => `${n} ${n === 1 ? "jugador" : "jugadores"}`;

  return (
    <div className="grid grid-cols-3 gap-3 px-4 py-4 lg:px-6">
      <div className="rise border-line rounded-2xl border bg-gradient-to-br from-emerald-50 to-white px-5 py-4 shadow-sm">
        <div className="label text-up">{mine ? "Me sube hoy" : "Le sube hoy"}</div>
        <div className="tnum text-up mt-2 text-[1.75rem] leading-none font-semibold">
          {swing.up > 0 ? signed(swing.up) : "—"}
        </div>
        <div className="text-faint mt-1.5 text-xs">
          {swing.risers > 0 ? people(swing.risers) : "nadie sube"}
        </div>
      </div>

      <div
        className="rise border-line rounded-2xl border bg-gradient-to-br from-rose-50 to-white px-5 py-4 shadow-sm"
        style={{ animationDelay: "60ms" }}
      >
        <div className="label text-down">{mine ? "Me baja hoy" : "Le baja hoy"}</div>
        <div className="tnum text-down mt-2 text-[1.75rem] leading-none font-semibold">
          {swing.down > 0 ? `−${money(swing.down)}` : "—"}
        </div>
        <div className="text-faint mt-1.5 text-xs">
          {swing.fallers > 0 ? people(swing.fallers) : "nadie baja"}
        </div>
      </div>

      <div
        className="rise border-line rounded-2xl border bg-white px-5 py-4 shadow-sm"
        style={{ animationDelay: "120ms" }}
      >
        <div className="label">Total del día</div>
        <div
          className={`tnum mt-2 text-[1.75rem] leading-none font-semibold ${
            quiet
              ? "text-faint"
              : swing.net > 0
                ? "text-up"
                : swing.net < 0
                  ? "text-down"
                  : "text-ink"
          }`}
        >
          {quiet ? "—" : signed(swing.net)}
        </div>
        <div className="text-faint mt-1.5 text-xs">
          {quiet ? "sin cambios" : "subidas menos bajadas"}
        </div>
      </div>
    </div>
  );
}
