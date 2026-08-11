import Link from "next/link";
import { TEAMS, getFixtures } from "@/lib/equipos";
import { ffBadge } from "@/lib/odds";
import { DifficultyBadge, isLeague } from "@/components/Fixtures";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function EquiposPage() {
  // El próximo partido de liga de cada club. Van los veinte a la vez y con
  // caché propia, así que sólo cuesta la primera visita.
  const fixtures = await Promise.all(
    TEAMS.map(async (team) => {
      const { next } = await getFixtures(team.slug);
      return next.find(isLeague) ?? null;
    }),
  );

  return (
    <>
      <PageHeader
        eyebrow="LaLiga"
        title="Equipos"
        meta="Once probable, calendario con dificultad, plantilla, lesionados y noticias de cada club."
      />

      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 lg:p-6">
        {TEAMS.map((team, i) => {
          const next = fixtures[i];
          const rival = next ? (next.atHome ? next.away : next.home) : null;

          return (
            <Link
              key={team.slug}
              href={`/equipos/${team.slug}`}
              className="rise relative flex flex-col items-center gap-3 overflow-hidden rounded-xl border-2 border-transparent bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg active:translate-y-0 active:opacity-60"
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

              {/* Próximo partido de liga, en pequeño: para decidir sin entrar. */}
              {next && rival ? (
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="text-faint shrink-0 text-[0.62rem]">
                    {next.atHome ? "🏠" : "✈️"}
                  </span>
                  {rival.badge && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={rival.badge}
                      alt=""
                      width={14}
                      height={14}
                      className="shrink-0 object-contain"
                    />
                  )}
                  <span className="text-muted truncate text-[0.66rem] font-medium">
                    {rival.name}
                  </span>
                  <DifficultyBadge level={next.difficulty} size="xs" />
                </span>
              ) : (
                <span className="text-faint text-[0.62rem]">sin próximo partido</span>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}
