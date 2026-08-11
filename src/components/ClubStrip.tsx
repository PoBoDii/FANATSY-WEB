import Link from "next/link";
import { TEAMS } from "@/lib/equipos";
import { ffBadge } from "@/lib/odds";

/**
 * Tira con los veinte escudos de LaLiga, como la de futbolfantasy.
 *
 * Sólo en el móvil: ahí no hay barra lateral, y tener los clubes siempre a
 * mano ahorra tres toques. Se desliza en horizontal y cada escudo lleva a la
 * ficha de su equipo.
 */
export function ClubStrip() {
  return (
    <div className="border-line bg-panel border-t lg:hidden">
      <div className="flex gap-1.5 overflow-x-auto px-3 py-1.5">
        {TEAMS.map((team) => (
          <Link
            key={team.slug}
            href={`/equipos/${team.slug}`}
            title={team.name}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 bg-panel transition-transform active:scale-95"
            style={{ borderColor: `${team.color}55` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ffBadge(team.ffId) ?? ""}
              alt={team.name}
              width={20}
              height={20}
              className="object-contain"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
