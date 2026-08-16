import Link from "next/link";
import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { fixturesByClub } from "@/lib/equipos";
import { enrichOdds, getFf } from "@/lib/futbolfantasy";
import { FF_MARKET_URL, type FfPlayer } from "@/lib/odds";
import { FfLink } from "@/components/FfLink";
import { toList, toMarketItem, type MarketItem } from "@/lib/normalize";
import { money, num, timeLeft } from "@/lib/format";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PlayerCard, toCard } from "@/components/PlayerCard";
import { Empty, ErrorBox, PageHeader, StatTile } from "@/components/ui";

export const dynamic = "force-dynamic";

type Sort =
  | "nota"
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

/** Criterios de orden. Sin elegir nada manda el puesto, como en el juego. */
const SORTS: { key: Sort; label: string; natural: "asc" | "desc" }[] = [
  { key: "posicion", label: "Posición", natural: "asc" },
  { key: "nota", label: "Nota", natural: "desc" },
  { key: "precio", label: "Precio", natural: "desc" },
  { key: "prob", label: "Juega", natural: "desc" },
  { key: "dif", label: "Cambio de valor", natural: "desc" },
  { key: "pujas", label: "Pujas", natural: "desc" },
  { key: "puntos", label: "Puntos", natural: "desc" },
  { key: "media", label: "Media", natural: "desc" },
];

export default async function MercadoPage({
  searchParams,
}: {
  searchParams: Promise<{ orden?: string; dir?: string }>;
}) {
  const { orden, dir: rawDir } = await searchParams;
  /**
   * El sentido por defecto es el natural **del criterio que va a mandar**, no
   * el de la URL. Sin `orden` el criterio cae en "posición" pero el sentido
   * caía en "desc", y la lista salía de delanteros a porteros.
   */
  const sort: Sort = SORTS.find((c) => c.key === orden)?.key ?? "posicion";
  const natural = SORTS.find((c) => c.key === sort)!.natural;
  const dir: "asc" | "desc" = rawDir === "asc" || rawDir === "desc" ? rawDir : natural;

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

  /**
   * Nota del jugador, de 0 a 10.
   *
   * La probabilidad de jugar multiplica en vez de sumar, igual que en fichajes:
   * quien no sale no puntúa, y ninguna otra virtud lo compensa.
   */
  const marketScore = (item: MarketItem): number => {
    const player = item.player;
    const p = oddsOf(item)?.probability;
    if (player.status === "injured" || player.status === "suspended" || p === 0) return 0;

    const plays = p == null ? 0.5 : p / 100;
    const average =
      player.averagePoints > 0 ? player.averagePoints : (player.lastSeasonPoints ?? 0) / 38;
    const form = Math.min(1, average / 7);
    const perMillion = item.price > 0 ? average / (item.price / 1_000_000) : 0;
    const cheap = Math.min(1, perMillion / 0.8);

    return Math.round(plays * (0.5 + 0.3 * form + 0.2 * cheap) * 100) / 10;
  };

  // A igualdad de criterio manda quien más sube: es el desempate útil.
  const byDiff = (a: MarketItem, b: MarketItem) =>
    (oddsOf(b)?.diff ?? -Infinity) - (oddsOf(a)?.diff ?? -Infinity);

  // Cada criterio se define de mayor a menor y `dir` lo invierte, igual que
  // en las listas de plantilla.
  const compare = (a: MarketItem, b: MarketItem) => {
    switch (sort) {
      case "posicion":
        /**
         * Portero, defensa, centro y delantera, como se lee una alineación.
         * Va definido al revés porque la lista se invierte después cuando el
         * sentido es "asc", que es el natural de este criterio.
         */
        return (
          POSITION_RANK[b.player.position] - POSITION_RANK[a.player.position] ||
          b.price - a.price
        );
      case "nombre":
        return b.player.name.localeCompare(a.player.name, "es");
      case "puntos":
        return b.player.points - a.player.points || byDiff(a, b);
      case "media":
        return b.player.averagePoints - a.player.averagePoints || byDiff(a, b);
      case "prob":
        return (oddsOf(b)?.probability ?? -1) - (oddsOf(a)?.probability ?? -1) || byDiff(a, b);
      case "nota":
        return marketScore(b) - marketScore(a) || b.price - a.price;
      case "pujas":
        return b.bids - a.bids || b.price - a.price;
      case "dif":
        return byDiff(a, b);
      default:
        return b.price - a.price || byDiff(a, b);
    }
  };

  /**
   * Cada jugador del mercado, ya aplanado a lo que pinta la tarjeta.
   *
   * La nota es la misma idea que en fichajes: lo primero es que juegue, y
   * después lo que rinde por lo que cuesta. Aquí no hay cláusula que valorar,
   * así que se puntúa al jugador, no la operación.
   */
  const cardOf = (item: MarketItem) =>
    toCard(item.player, oddsOf(item), fixturesOf(item.player), {
      deal: { rank: 0, score: marketScore(item), headline: "", opensIn: null },
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

  const withBid = items.filter((i) => i.myBid).length;
  const total = players.reduce((s, i) => s + i.price, 0);

  return (
    <>
      <PageHeader
        eyebrow={league.name}
        title="Mercado"
        // Sin subtítulo: son siempre doce libres y decir cuántos hay
        // escondidos no cambia ninguna decisión.
        action={
          <div className="flex items-center gap-2">
            <FfLink href={FF_MARKET_URL} label="Ver el mercado en futbolfantasy" />
            <AutoRefresh seconds={600} />
          </div>
        }
      />

      <div className="border-line grid grid-cols-3 border-b">
        <StatTile label="Valor total" value={money(total)} />
        <StatTile
          label="Más caro"
          value={sorted.length ? money(Math.max(...players.map((i) => i.price))) : "—"}
          delay={60}
        />
        <StatTile
          label="Mis pujas"
          value={num(withBid)}
          sub={withBid ? "en curso" : "ninguna"}
          tone={withBid ? "acid" : "neutral"}
          delay={120}
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
        // Ordenando por puesto se reparte en columnas; con cualquier otro
        // criterio va en una sola, que es donde se ve el orden de un vistazo.
        <div
          className={
            sort === "posicion"
              ? "grid grid-cols-[minmax(0,1fr)] gap-2 p-2.5 sm:p-3 lg:grid-cols-2 lg:p-4 2xl:grid-cols-3"
              : "mx-auto grid max-w-2xl grid-cols-[minmax(0,1fr)] gap-2 p-2.5 sm:p-3 lg:p-4"
          }
        >
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
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2 p-2.5 sm:p-3 lg:grid-cols-2 lg:p-4 2xl:grid-cols-3">
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

