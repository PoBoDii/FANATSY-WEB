import Link from "next/link";
import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { toActivity, toList, toManager } from "@/lib/normalize";
import { money, shortDate } from "@/lib/format";
import { Empty, ErrorBox, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const KIND_LABEL = {
  signing: { text: "Fichaje", color: "text-up" },
  sale: { text: "Venta", color: "text-warn" },
  clause: { text: "Cláusula", color: "text-down" },
  join: { text: "Se une", color: "text-acid" },
  other: { text: "Movimiento", color: "text-muted" },
} as const;

export default async function ActividadPage() {
  const session = await getSession();
  if (!session.active)
    return (
      <Empty
        title="Todavía sin liga"
        hint="Aquí saldrán los fichajes y cláusulas de tu liga. Los detalles, en Mi plantilla."
      />
    );

  const league = session.active;

  // El feed identifica a la gente por id de usuario, así que hace falta el
  // listado de equipos para poner nombres.
  const [{ data, error }, { data: teamsRaw }] = await Promise.all([
    safe(fantasy.activity(league.id)),
    safe(fantasy.leagueTeams(league.id)),
  ]);

  const names = new Map<string, string>();
  toList(teamsRaw).forEach((raw, i) => {
    const m = toManager(raw, i, league.myTeamId);
    if (m.userId) names.set(String(m.userId), m.name);
  });

  const entries = toList(data).map(toActivity);

  if (entries.length === 0) {
    return (
      <>
        <PageHeader eyebrow={league.name} title="Actividad" />
        {error ? (
          <ErrorBox error={error} />
        ) : (
          <Empty
            title="Todavía sin movimientos"
            hint="Aquí irán apareciendo los fichajes, ventas y cláusulas de la liga."
          />
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={league.name}
        title="Actividad"
        meta={`${entries.length} movimientos en la liga`}
      />

      <ol>
        {entries.map((e, i) => {
          const kind = KIND_LABEL[e.kind];
          const who = e.fromUserId ? (names.get(e.fromUserId) ?? `Usuario ${e.fromUserId}`) : null;
          const other = e.toUserId ? (names.get(e.toUserId) ?? `Usuario ${e.toUserId}`) : null;

          return (
            <li
              key={`${e.id}-${i}`}
              className="border-line rise hover:bg-panel-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b px-5 py-4 transition-colors lg:px-6"
              style={{ animationDelay: `${Math.min(i * 25, 400)}ms` }}
            >
              <span className={`label w-24 shrink-0 ${kind.color}`}>{kind.text}</span>

              <span className="min-w-0 flex-1">
                {e.playerName ? (
                  e.playerId ? (
                    <Link href={`/jugador/${e.playerId}`} className="hover:text-acid font-medium">
                      {e.playerName}
                    </Link>
                  ) : (
                    <span className="font-medium">{e.playerName}</span>
                  )
                ) : (
                  <span className="font-medium">{who ?? "—"}</span>
                )}
                <span className="text-faint ml-2 text-xs">
                  {e.playerName && who ? who : ""}
                  {other ? ` → ${other}` : ""}
                  {e.kind === "other" && e.typeId >= 0 ? ` · tipo ${e.typeId}` : ""}
                </span>
              </span>

              <span className="tnum text-ink text-sm">{e.amount ? money(e.amount) : "—"}</span>
              <span className="tnum text-faint w-16 shrink-0 text-right text-xs">
                {shortDate(e.date)}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="text-faint px-5 py-6 text-xs lg:px-6">
        El feed de LaLiga es escueto: identifica a la gente por id y no siempre trae jugador ni
        importe. Los tipos aún sin etiquetar salen como &quot;Movimiento · tipo N&quot;.
      </p>
    </>
  );
}
