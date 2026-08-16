import Link from "next/link";
import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { fixturesByClub, type Fixture } from "@/lib/equipos";
import { FixtureStrip } from "@/components/Fixtures";
import { enrichOdds, getFf } from "@/lib/futbolfantasy";
import { FF_MARKET_URL, ffBadge, oddsTone, type FfPlayer } from "@/lib/odds";
import { FfLink } from "@/components/FfLink";
import { toList, toMarketItem, type MarketItem } from "@/lib/normalize";
import { money, num, signed, timeLeft } from "@/lib/format";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PlayerCard, toCard } from "@/components/PlayerCard";
import { Empty, ErrorBox, PageHeader, StatTile } from "@/components/ui";

export const dynamic = "force-dynamic";

type Sort =
  | "posicion"
  | "nombre"
  | "precio"
  | "puntos"
  | "prob"
  | "dif"
  | "media"
  | "pujas"
  | "hueco";

/** Orden natural del once, para agrupar por línea. */
const POSITION_RANK: Record<string, number> = { PT: 0, DF: 1, MC: 2, DL: 3, EN: 4, "?": 5 };

/** Criterios de orden. Los primeros son los que más se usan. */
const SORTS: { key: Sort; label: string; natural: "asc" | "desc" }[] = [
  { key: "precio", label: "Precio", natural: "desc" },
  { key: "prob", label: "Juega", natural: "desc" },
  { key: "dif", label: "Cambio de valor", natural: "desc" },
  { key: "pujas", label: "Pujas", natural: "desc" },
  { key: "puntos", label: "Puntos", natural: "desc" },
  { key: "media", label: "Media", natural: "desc" },
  { key: "posicion", label: "Posición", natural: "asc" },
];

export default async function MercadoPage({
  searchParams,
}: {
  searchParams: Promise<{ orden?: string; dir?: string }>;
}) {
  const { orden, dir: rawDir } = await searchParams;
  const column = SORTS.find((c) => c.key === orden);
  const sort: Sort = column?.key ?? "precio";
  const dir: "asc" | "desc" =
    rawDir === "asc" || rawDir === "desc" ? rawDir : (column?.natural ?? "desc");

  const session = await getSession();
  if (!session.active)
    return (
      <Empty
        title="Todavía sin liga"
        hint="El mercado depende de la liga en la que juegues. Los detalles, en Mi plantilla."
      />
    );

  const league = session.active;
  const [{ data, error }, ff] = await Promise.all([safe(fantasy.market(league.id)), getFf()]);
  if (error) return <ErrorBox error={error} />;

  const all = toList(data)
    .map((raw) => toMarketItem(raw, league.myTeamId))
    .filter((item) => item.player.id);

  /**
   * Sólo el mercado del juego.
   *
   * Todo lo que tiene vendedor es de un manager —tuyo incluido— y no es lo que
   * se viene a mirar aquí: los de otros se fichan por cláusula (eso está en
   * Fichajes) y los tuyos ya los tienes. Lo que interesa es la lista diaria de
   * jugadores libres, que es la única donde se puja de verdad.
   */
  const items = all.filter((item) => !item.sellerTeamId);

  // Los entrenadores van aparte, al final: rara vez interesan.
  const coaches = items.filter((i) => i.player.position === "EN");
  const players = items.filter((i) => i.player.position !== "EN");

  // La página de equipo de futbolfantasy sólo publica el once proyectado, así
  // que a los del mercado les falta a menudo. Se rellenan desde su ficha.
  const lookup = await enrichOdds(ff, players.map((i) => i.player));
  const fixturesOf = await fixturesByClub(
    players.map((i) => i.player),
    lookup,
  );
  const oddsOf = (item: MarketItem): FfPlayer | null => lookup(item.player);

  // A igualdad de criterio manda quien más sube: es el desempate útil.
  const byDiff = (a: MarketItem, b: MarketItem) =>
    (oddsOf(b)?.diff ?? -Infinity) - (oddsOf(a)?.diff ?? -Infinity);

  // Cada criterio se define de mayor a menor y `dir` lo invierte, igual que
  // en las listas de plantilla.
  const compare = (a: MarketItem, b: MarketItem) => {
    switch (sort) {
      case "posicion":
        // Al revés que el resto: la lista se invierte después, así que se
        // define de atrás hacia adelante para que "asc" salga PT→DL.
        return (
          POSITION_RANK[b.player.position] - POSITION_RANK[a.player.position] ||
          a.price - b.price
        );
      case "nombre":
        return b.player.name.localeCompare(a.player.name, "es");
      case "puntos":
        return b.player.points - a.player.points || byDiff(a, b);
      case "media":
        return b.player.averagePoints - a.player.averagePoints || byDiff(a, b);
      case "prob":
        return (oddsOf(b)?.probability ?? -1) - (oddsOf(a)?.probability ?? -1) || byDiff(a, b);
      case "pujas":
        return b.bids - a.bids || b.price - a.price;
      case "dif":
        return byDiff(a, b);
      default:
        return b.price - a.price || byDiff(a, b);
    }
  };

  /** Cada jugador del mercado, ya aplanado a lo que pinta la tarjeta. */
  const cardOf = (item: MarketItem) =>
    toCard(item.player, oddsOf(item), fixturesOf(item.player), {
      market: {
        price: item.price,
        overValue: item.price - item.player.marketValue,
        timeLeft: timeLeft(item.expiresAt),
        bids: item.bids,
        myBid: item.myBid,
      },
    });

  const ordered = [...players].sort(compare);
  const sorted = dir === "asc" ? ordered.reverse() : ordered;

  const hidden = all.length - items.length;
  const withBid = items.filter((i) => i.myBid).length;
  const total = players.reduce((s, i) => s + i.price, 0);

  return (
    <>
      <PageHeader
        eyebrow={league.name}
        title="Mercado"
        meta={
          <>
            {players.length} jugadores libres
            {coaches.length > 0 ? ` · ${coaches.length} entrenadores` : ""}
            {hidden > 0 ? ` · ${hidden} fuera (los vende un manager)` : ""}
          </>
        }
        action={
          <div className="flex items-center gap-2">
            <FfLink href={FF_MARKET_URL} label="Ver el mercado en futbolfantasy" />
            <AutoRefresh seconds={120} />
          </div>
        }
      />

      <div className="border-line grid grid-cols-2 border-b lg:grid-cols-4">
        <StatTile label="En venta" value={num(players.length)} tone="acid" />
        <StatTile label="Valor total" value={money(total)} delay={60} />
        <StatTile
          label="Más caro"
          value={sorted.length ? money(Math.max(...players.map((i) => i.price))) : "—"}
          delay={120}
        />
        <StatTile
          label="Mis pujas"
          value={num(withBid)}
          sub={withBid ? "en curso" : "ninguna"}
          tone={withBid ? "acid" : "neutral"}
          delay={180}
        />
      </div>

      <div className="border-line flex gap-1.5 overflow-x-auto border-b px-3.5 py-2.5 sm:px-5 lg:px-6">
        <span className="label shrink-0 self-center pr-1">Ordenar</span>
        {SORTS.map((option) => {
          const active = sort === option.key;
          const nextDir = active ? (dir === "desc" ? "asc" : "desc") : option.natural;
          return (
            <Link
              key={option.key}
              href={`/mercado?orden=${option.key}&dir=${nextDir}`}
              scroll={false}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.78rem] transition-colors ${
                active ? "bg-ink text-void font-semibold" : "bg-panel-2 text-muted hover:text-ink"
              }`}
            >
              {option.label}
              {active && (
                <span className="text-[0.62rem] opacity-70">{dir === "desc" ? "▼" : "▲"}</span>
              )}
            </Link>
          );
        })}
      </div>

      {sorted.length === 0 ? (
        <Empty
          title="Mercado vacío"
          hint="No hay jugadores libres ahora mismo. Se renueva cada día."
        />
      ) : (
        <div className="grid gap-2 p-2.5 sm:p-3 lg:grid-cols-2 lg:p-4 2xl:grid-cols-3">
          {sorted.map((item, i) => (
            <PlayerCard
              key={item.id || item.player.id}
              card={cardOf(item)}
              leagueId={league.id}
              delay={Math.min(i * 18, 280)}
            />
          ))}
        </div>
      )}

      {coaches.length > 0 && (
        <section className="mt-4">
          <div className="border-line bg-panel-2/60 flex items-baseline gap-3 border-y px-5 py-3 lg:px-6">
            <h2 className="display text-lg">Entrenadores</h2>
            <span className="tnum text-faint text-xs">{coaches.length}</span>
          </div>
          <div className="grid gap-2 p-2.5 sm:p-3 lg:grid-cols-2 lg:p-4 2xl:grid-cols-3">
            {coaches.map((item, i) => (
              <PlayerCard
                key={item.id || item.player.id}
                card={cardOf(item)}
                leagueId={league.id}
                delay={i * 22}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

