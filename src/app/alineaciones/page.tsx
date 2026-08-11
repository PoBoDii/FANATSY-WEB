import Link from "next/link";
import { getMatches } from "@/lib/alineaciones";
import { findTeamByName } from "@/lib/equipos";
import { Empty, PageHeader } from "@/components/ui";
import { RoundPicker } from "@/components/RoundPicker";

export const dynamic = "force-dynamic";

/** LaLiga tiene 38 jornadas. */
const ROUNDS = Array.from({ length: 38 }, (_, i) => i + 1);

export default async function AlineacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ j?: string }>;
}) {
  const { j } = await searchParams;
  const round = Math.min(38, Math.max(1, Number(j) || 1));
  const matches = await getMatches(round);

  return (
    <>
      <PageHeader
        eyebrow="Alineaciones probables"
        title={`Jornada ${round}`}
        meta="Onces que futbolfantasy da como más probables. Entra en un partido para verlos."
        action={<RoundPicker rounds={ROUNDS} current={round} />}
      />

      {matches.length === 0 ? (
        <Empty
          title="Sin partidos"
          hint="futbolfantasy todavía no publica los onces de esta jornada."
        />
      ) : (
        <div className="grid gap-2.5 p-2.5 sm:grid-cols-2 sm:gap-3 sm:p-4 lg:p-6">
          {matches.map((match, i) => {
            const home = findTeamByName(match.home.name);
            const away = findTeamByName(match.away.name);
            return (
              <Link
                key={match.id}
                href={`/alineaciones/${match.id}?j=${round}`}
                className="border-line hover:border-acid/50 rise overflow-hidden rounded-xl border bg-panel shadow-sm transition-all hover:shadow-md"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                {/* Franja partida: mitad del color del local, mitad del
                    visitante. Igual que dentro del partido. */}
                <div className="flex h-1.5">
                  <span className="flex-1" style={{ background: home?.color ?? "#cbd5e1" }} />
                  <span className="flex-1" style={{ background: away?.color ?? "#cbd5e1" }} />
                </div>

                <div className="flex items-center gap-2 p-3 sm:gap-3 sm:p-4">
                  <Side name={match.home.name} badge={match.home.badge} align="right" />

                  <div className="w-[84px] shrink-0 text-center sm:w-[92px]">
                    <div className="text-faint text-[0.68rem] leading-tight">{match.kickoff}</div>
                    <div className="display text-acid mt-1 text-sm">VS</div>
                  </div>

                  <Side name={match.away.name} badge={match.away.badge} align="left" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function Side({
  name,
  badge,
  align,
}: {
  name: string;
  badge: string | null;
  align: "left" | "right";
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2.5 ${
        align === "right" ? "flex-row-reverse text-right" : ""
      }`}
    >
      {badge && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={badge} alt="" width={30} height={30} className="shrink-0 object-contain" />
      )}
      <span className="truncate text-[0.9rem] font-semibold">{name}</span>
    </div>
  );
}
