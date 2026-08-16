import Link from "next/link";
import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { toActivity, toList, toManager, toPlayer } from "@/lib/normalize";
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
  const [{ data, error }, { data: teamsRaw }, { data: playersRaw }] = await Promise.all([
    safe(fantasy.activity(league.id)),
    safe(fantasy.leagueTeams(league.id)),
    // El feed sólo manda el id del jugador; el listado de LaLiga pone el nombre.
    safe(fantasy.players()),
  ]);

  const names = new Map<string, string>();
  toList(teamsRaw).forEach((raw, i) => {
    const m = toManager(raw, i, league.myTeamId);
    if (m.userId) names.set(String(m.userId), m.name);
  });

  /** Id de jugador → nombre y foto, para que el feed diga a quién se fichó. */
  const players = new Map<string, { name: string; image: string | null }>();
  for (const raw of toList(playersRaw)) {
    const p = toPlayer(raw);
    if (p.id) players.set(p.id, { name: p.name, image: p.image });
  }

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
          const player = e.playerId ? (players.get(e.playerId) ?? null) : null;
          const name = e.playerName ?? player?.name ?? null;

          return (
            <li
              key={`${e.id}-${i}`}
              className="border-line rise hover:bg-panel-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b px-5 py-4 transition-colors lg:px-6"
              style={{ animationDelay: `${Math.min(i * 25, 400)}ms` }}
            >
              <span className={`label w-24 shrink-0 ${kind.color}`}>{kind.text}</span>

              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                {player?.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={player.image}
                    alt=""
                    width={34}
                    height={34}
                    className="border-line bg-panel-2 h-[34px] w-[34px] shrink-0 rounded-lg border object-cover object-top"
                  />
                )}
                <span className="min-w-0">
                  <span className="block truncate">
                    {name ? (
                      e.playerId ? (
                        <Link
                          href={`/jugador/${e.playerId}`}
                          className="hover:text-acid font-semibold"
                        >
                          {name}
                        </Link>
                      ) : (
                        <span className="font-semibold">{name}</span>
                      )
                    ) : (
                      <span className="font-semibold">{who ?? "—"}</span>
                    )}
                  </span>
                  <span className="text-faint block truncate text-xs">
                    {name && who ? who : ""}
                    {other ? ` → ${other}` : ""}
                    {e.kind === "other" && e.typeId >= 0 ? ` · tipo ${e.typeId}` : ""}
                  </span>
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
        El feed de LaLiga identifica a la gente y a los jugadores por id, sin nombres: se cruzan
        con el listado de equipos y con el de jugadores. Los tipos no están documentados —
        <strong>fichaje</strong> son los que se resuelven todos a la vez al cerrar el mercado y{" "}
        <strong>venta</strong> los sueltos a cualquier hora—, así que si ves alguno raro dímelo.
        Los que no se reconocen salen como &quot;Movimiento · tipo N&quot;.
      </p>
    </>
  );
}
