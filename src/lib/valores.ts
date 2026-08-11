import type { Player } from "./normalize";
import type { FfPlayer } from "./odds";

/**
 * Lo que se ha movido el valor de una plantilla desde ayer.
 *
 * Se guardan las subidas y las bajadas por separado a propósito: el neto
 * esconde lo que ha pasado. Una plantilla que sube 4 M€ y baja 4 M€ ha tenido
 * un día movidísimo y en neto parece que no ha pasado nada.
 */
export type ValueSwing = {
  /** Suma de todo lo que ha subido (siempre ≥ 0). */
  up: number;
  /** Suma de todo lo que ha bajado, en positivo (siempre ≥ 0). */
  down: number;
  /** `up - down`. */
  net: number;
  risers: number;
  fallers: number;
};

export const EMPTY_SWING: ValueSwing = { up: 0, down: 0, net: 0, risers: 0, fallers: 0 };

export function squadSwing(
  players: Player[],
  oddsOf: (player: Player) => FfPlayer | null,
): ValueSwing {
  let up = 0;
  let down = 0;
  let risers = 0;
  let fallers = 0;

  for (const player of players) {
    const diff = oddsOf(player)?.diff;
    if (!diff) continue;
    if (diff > 0) {
      up += diff;
      risers++;
    } else {
      down -= diff;
      fallers++;
    }
  }

  return { up, down, net: up - down, risers, fallers };
}
