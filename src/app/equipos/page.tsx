import Link from "next/link";
import { TEAMS } from "@/lib/equipos";
import { ffBadge } from "@/lib/odds";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function EquiposPage() {
  return (
    <>
      <PageHeader
        eyebrow="LaLiga"
        title="Equipos"
        meta="Once probable, calendario con dificultad, plantilla, lesionados y noticias de cada club."
      />

      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 lg:p-6">
        {TEAMS.map((team, i) => (
          <Link
            key={team.slug}
            href={`/equipos/${team.slug}`}
            className="rise relative flex flex-col items-center gap-3 overflow-hidden rounded-xl border-2 border-transparent bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
            style={{ animationDelay: `${i * 25}ms`, borderColor: team.color }}
          >
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-1.5"
              style={{ background: team.color }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ffBadge(team.ffId) ?? ""}
              alt=""
              width={52}
              height={52}
              className="object-contain"
            />
            <span className="text-center text-[0.85rem] font-semibold">{team.name}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
