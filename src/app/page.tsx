import { getSession } from "@/lib/session";
import { TeamView } from "@/components/TeamView";
import { PITCH_STATS, type PitchStat } from "@/components/Pitch";
import { ErrorBox } from "@/components/ui";
import { Setup } from "@/components/Setup";
import { NoLeague } from "@/components/NoLeague";

export const dynamic = "force-dynamic";

export default async function MiPlantillaPage({
  searchParams,
}: {
  searchParams: Promise<{
    vista?: string;
    stat?: string;
    orden?: string;
    dir?: string;
    pos?: string;
    abiertas?: string;
  }>;
}) {
  const params = await searchParams;
  const session = await getSession();

  // Sin credenciales o con credenciales malas: guía de configuración en vez
  // de un stack trace.
  if (session.error) {
    return <Setup error={session.error} />;
  }

  if (!session.active) {
    return <NoLeague managerName={session.managerName} />;
  }

  if (!session.active.myTeamId) {
    return (
      <ErrorBox
        error="La liga no devuelve tu equipo"
        hint="Puede pasar si acabas de unirte. Mira /diagnóstico y consulta la respuesta cruda de /leagues."
      />
    );
  }

  return (
    <TeamView
      leagueId={session.active.id}
      teamId={session.active.myTeamId}
      eyebrow={session.active.name}
      view={params.vista === "lista" ? "lista" : "once"}
      sortParams={params}
      pitchStat={(PITCH_STATS.find((s) => s.key === params.stat)?.key ?? "ahora") as PitchStat}
    />
  );
}
