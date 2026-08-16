import type { Player } from "@/lib/normalize";

/**
 * Lo que queda de las listas de plantilla del lado del servidor.
 *
 * Filtrar y ordenar se hacen ahora en el navegador (`SquadBrowser`), porque
 * cada pastilla era una vuelta entera al servidor. Aquí sólo sobrevive la
 * pregunta que también necesitan las páginas para contar y separar pestañas.
 */

/** ¿Se le puede pagar la cláusula ahora mismo? */
export function clauseIsOpen(player: Player): boolean {
  if (!player.buyoutClause) return false;
  if (!player.buyoutUnlockAt) return true;
  const at = new Date(player.buyoutUnlockAt).getTime();
  return !Number.isFinite(at) || at <= Date.now();
}
