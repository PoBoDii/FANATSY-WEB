import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { enrichRows, getFf, normalizeName } from "@/lib/futbolfantasy";
import { ffPhoto } from "@/lib/odds";
import { playersOfTeam, toList, toManager, type Player } from "@/lib/normalize";
import { money, num } from "@/lib/format";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Empty, PageHeader, StatTile } from "@/components/ui";
import { PriceFilters, PriceTabs, type PriceEntry } from "@/components/PriceList";

export const dynamic = "force-dynamic";

/**
 * Subidas y bajadas de valor del día.
 *
 * Los precios salen de futbolfantasy (que ya calcula la variación diaria) y se
 * cruzan con la liga para saber de quién es cada jugador, por cuánto está su
 * cláusula y cuándo queda libre.
 */
export default async function PreciosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; equipo?: string; pos?: string; manager?: string }>;
}) {
  const filters = await searchParams;
  const session = await getSession();
  const league = session.active;

  const [ff, { data: teamsRaw }] = await Promise.all([
    getFf(),
    league ? safe(fantasy.leagueTeams(league.id)) : Promise.resolve({ data: null, error: null }),
  ]);

  if (ff.size === 0) {
    return (
      <>
        <PageHeader eyebrow="Precios" title="Subidas y bajadas" />
        <Empty
          title="Sin datos de precios"
          hint="futbolfantasy no respondió o cambió el marcado. Míralo en Diagnóstico."
        />
      </>
    );
  }

  // Quién tiene a quién, con su cláusula: se recorre la liga entera una vez.
  type Owner = { manager: string; isMe: boolean; player: Player };
  const owners = new Map<string, Owner>();
  toList(teamsRaw).forEach((raw, i) => {
    const manager = toManager(raw, i, league?.myTeamId ?? null);
    for (const player of playersOfTeam(raw)) {
      owners.set(normalizeName(player.fullName || player.name), {
        manager: manager.name,
        isMe: manager.isMe,
        player,
      });
    }
  });

  // Equipos de mi liga, para el filtro por dueño. El mío va marcado.
  const managers = toList(teamsRaw)
    .map((raw, i) => toManager(raw, i, league?.myTeamId ?? null))
    .map((m) => ({ name: m.name, isMe: m.isMe }))
    .sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name, "es"));

  const movers = ff.all.filter((row) => row.diff !== null && row.diff !== 0);

  const entries: PriceEntry[] = movers
    .map((row) => {
      const owner = owners.get(row.name) ?? null;
      return {
        name: row.name,
        displayName: owner?.player.name ?? titleCase(row.name),
        // La foto de LaLiga es mejor, pero sólo la hay para los de la liga;
        // para el resto vale la de futbolfantasy.
        image: owner?.player.image ?? ffPhoto(row.ffId),
        clubBadge: owner?.player.clubBadge ?? null,
        club: row.teamName ?? owner?.player.clubName ?? "—",
        teamId: row.teamId,
        position: row.position ?? owner?.player.position ?? null,
        playerId: owner?.player.id ?? null,
        value: row.value,
        previousValue: row.previousValue,
        diff: row.diff!,
        diffPct: row.diffPct,
        streak: row.streak,
        probability: row.probability,
        alerts: row.alerts,
        ownerName: owner?.manager ?? null,
        ownerIsMe: owner?.isMe ?? false,
        buyoutClause: owner?.player.buyoutClause ?? null,
        buyoutUnlockAt: owner?.player.buyoutUnlockAt ?? null,
      };
    });

  const query = normalizeName(filters.q ?? "");
  const teamFilter = new Set((filters.equipo ?? "").split(",").filter(Boolean));
  const posFilter = new Set((filters.pos ?? "").split(",").filter(Boolean));
  const managerFilter = new Set((filters.manager ?? "").split(",").filter(Boolean));

  const visible = entries.filter((entry) => {
    if (query && !entry.name.includes(query)) return false;
    if (teamFilter.size && (!entry.teamId || !teamFilter.has(entry.teamId))) return false;
    if (posFilter.size && (!entry.position || !posFilter.has(entry.position))) return false;
    if (managerFilter.size && (!entry.ownerName || !managerFilter.has(entry.ownerName)))
      return false;
    return true;
  });

  const risers = visible.filter((e) => e.diff > 0).sort((a, b) => b.diff - a.diff);
  const fallers = visible.filter((e) => e.diff < 0).sort((a, b) => a.diff - b.diff);

  // La probabilidad se busca en la ficha SÓLO para lo que se va a ver: las
  // primeras de cada pestaña ya filtradas. Enriquecer los 600 sería absurdo, y
  // hacerlo por variación dejaba fuera justo al que estabas buscando.
  const byName = new Map(movers.map((row) => [row.name, row]));
  const onScreen = [...risers.slice(0, 30), ...fallers.slice(0, 30)]
    .map((entry) => byName.get(entry.name))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const filled = new Map(
    (await enrichRows(onScreen, 60)).map((row) => [row.name, row.probability]),
  );
  for (const entry of [...risers, ...fallers]) {
    if (entry.probability === null) entry.probability = filled.get(entry.name) ?? null;
  }

  const teams = [...ff.teams.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));

  // De portería a delantera, no como salgan en el HTML.
  const POSITION_ORDER = ["Portero", "Defensa", "Mediocampista", "Delantero"];
  const positions = [...new Set(ff.all.map((r) => r.position).filter(Boolean))]
    .sort((a, b) => POSITION_ORDER.indexOf(a!) - POSITION_ORDER.indexOf(b!)) as string[];

  return (
    <>
      <PageHeader
        eyebrow="Precios"
        title="Subidas y bajadas"
        meta={
          <>
            {num(risers.length)} suben · {num(fallers.length)} bajan · variación respecto a ayer
          </>
        }
        action={<AutoRefresh seconds={120} />}
      />

      <div className="border-line grid grid-cols-2 border-b lg:grid-cols-4">
        <StatTile
          label="Suben"
          value={num(risers.length)}
          sub={risers[0] ? `hasta ${money(risers[0].diff)}` : undefined}
          tone="up"
        />
        <StatTile
          label="Bajan"
          value={num(fallers.length)}
          sub={fallers[0] ? `hasta ${money(fallers[0].diff)}` : undefined}
          tone="down"
          delay={60}
        />
        <StatTile
          label="De tu liga"
          value={num(visible.filter((e) => e.ownerName).length)}
          sub="tienen dueño"
          delay={120}
        />
        <StatTile
          label="Tuyos"
          value={num(visible.filter((e) => e.ownerIsMe).length)}
          tone="acid"
          delay={180}
        />
      </div>

      <PriceFilters
        teams={teams}
        positions={positions}
        managers={managers}
        current={filters}
      />

      <PriceTabs risers={risers} fallers={fallers} />
    </>
  );
}

/** "denzel dumfries" → "Denzel Dumfries", para los que no están en la liga. */
function titleCase(value: string): string {
  return value.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}
