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
import { SortHeader, type SortColumn } from "@/components/SortHeader";
import {
  AlertBadge,
  ClubLink,
  Empty,
  ErrorBox,
  OddsChip,
  PageHeader,
  PlayerAvatar,
  PositionTag,
  PriceDelta,
  StatTile,
  StatusTag,
} from "@/components/ui";

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

/**
 * Columnas del mercado. Los anchos son los mismos que los de la fila, para
 * que cada título caiga sobre su dato.
 */
const COLUMNS: SortColumn<Sort>[] = [
  { key: "posicion", label: "Posición", width: "w-[190px]", align: "left", natural: "asc" },
  { key: "prob", label: "Juega", width: "w-[86px]", align: "left", natural: "desc" },
  { key: "pujas", label: "Pujas", width: "flex-1", align: "left", natural: "desc", hide: "hidden md:flex" },
  { key: "hueco", label: "", width: "w-[124px]", hide: "hidden lg:flex", spacer: true },
  { key: "puntos", label: "Puntos", width: "w-[74px]", align: "right", natural: "desc", hide: "hidden sm:flex" },
  { key: "media", label: "Media", width: "w-[70px]", align: "right", natural: "desc", hide: "hidden sm:flex" },
  { key: "dif", label: "Hoy", width: "w-[150px]", align: "right", natural: "desc" },
  { key: "precio", label: "Precio", width: "w-[126px] pr-2.5", align: "right", natural: "desc" },
];

export default async function MercadoPage({
  searchParams,
}: {
  searchParams: Promise<{ orden?: string; dir?: string }>;
}) {
  const { orden, dir: rawDir } = await searchParams;
  const column = COLUMNS.find((c) => c.key === orden);
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

  // Fuera lo que venden otros managers: aquí sólo interesa lo pujable.
  const items = all.filter(
    (item) => !item.sellerTeamId || item.sellerTeamId === league.myTeamId,
  );

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
            {players.length} jugadores pujables
            {coaches.length > 0 ? ` · ${coaches.length} entrenadores` : ""}
            {hidden > 0 ? ` · ${hidden} ocultos (los venden otros managers)` : ""}
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

      <SortHeader
        columns={COLUMNS}
        sort={sort}
        dir={dir}
        leading="w-[52px]"
        hrefOf={(key, next) => `/mercado?orden=${key}&dir=${next}`}
      />

      {sorted.length === 0 ? (
        <Empty
          title="Mercado vacío"
          hint="No hay jugadores pujables ahora mismo. Se renueva cada día."
        />
      ) : (
        <div className="space-y-2 p-2.5 sm:p-3 lg:p-4">
          {sorted.map((item, i) => (
            <MarketRow
              key={item.id || item.player.id}
              item={item}
              odds={oddsOf(item)}
              fixtures={fixturesOf(item.player)}
              delay={i * 22}
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
          <div className="space-y-2 p-2.5 sm:p-3 lg:p-4">
            {coaches.map((item, i) => (
              <MarketRow key={item.id || item.player.id} item={item} odds={null} delay={i * 22} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ fila */

function MarketRow({
  item,
  odds,
  fixtures,
  delay,
}: {
  item: MarketItem;
  odds: FfPlayer | null;
  fixtures?: Fixture[] | null;
  delay: number;
}) {
  const { player } = item;
  const overValue = item.price - player.marketValue;
  const left = timeLeft(item.expiresAt);
  const diff = odds?.diff ?? null;
  const tone = odds?.probability != null ? oddsTone(odds.probability) : null;

  // El mercado de LaLiga no manda el club del jugador; futbolfantasy sí, y
  // además trae el escudo por id de equipo.
  const club = player.clubName !== "—" ? player.clubName : (odds?.teamName ?? "—");
  const badge = player.clubBadge ?? ffBadge(odds?.teamId ?? null);

  return (
    <div
      className="border-line rise hover:border-acid/40 relative flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border bg-panel py-2.5 pr-3 pl-3.5 shadow-sm transition-all hover:shadow-md sm:flex-nowrap lg:gap-5 lg:pr-6 lg:pl-6"
      style={{ animationDelay: `${delay}ms` }}
    >
      <Link href={`/jugador/${player.id}`} className="absolute inset-0" aria-label={player.name} />
      <span
        aria-hidden
        className="absolute top-2 bottom-2 left-0 w-[4px] rounded-r-full"
        style={{ background: tone?.color ?? "transparent" }}
      />

      <PlayerAvatar player={player} size={52} className="h-11 w-11 sm:h-[52px] sm:w-[52px]" />

      {/* Identidad */}
      <div className="min-w-0 flex-1 sm:w-[190px] sm:flex-none sm:shrink-0">
        <div className="flex items-center gap-2">
          <PositionTag position={player.position} />
          <span className="truncate text-[0.9rem] leading-tight font-medium sm:text-[0.95rem]">
            {player.name}
          </span>
          <AlertBadge alerts={odds?.alerts} />
        </div>
        <ClubLink name={club} badge={badge} size={14} className="text-muted mt-1 text-xs" />
        {fixtures && fixtures.length > 0 && (
          <div className="mt-1.5 hidden sm:block lg:block">
            <FixtureStrip fixtures={fixtures} limit={5} />
          </div>
        )}
      </div>

      {/* Probabilidad, con espacio propio en vez de pegada al nombre */}
      {player.position !== "EN" ? (
        <div className="w-auto shrink-0 sm:w-[86px]">
          <OddsChip odds={odds} />
        </div>
      ) : (
        <div className="hidden w-[86px] shrink-0 sm:block" />
      )}

      <div className="hidden min-w-0 flex-1 flex-col gap-1 md:flex">
        <span
          className={`tnum text-[0.85rem] font-semibold ${
            item.bids > 0 ? "text-ink" : "text-faint"
          }`}
        >
          {item.bids > 0 ? `${item.bids} ${item.bids === 1 ? "puja" : "pujas"}` : "sin pujas"}
        </span>
        <StatusTag status={player.status} />
        {left && <span className="text-faint text-[0.68rem]">cierra en {left}</span>}
      </div>

      {/* Mi puja: al lado del estado, no encima del precio de venta */}
      <div className="hidden w-[124px] shrink-0 lg:block">
        {item.myBid ? (
          <div className="border-acid/60 bg-acid/10 rounded-sm border px-2 py-1.5">
            <div className="label text-acid text-[0.55rem] leading-none">Mi puja</div>
            <div className="tnum text-acid mt-1 text-[1rem] leading-none font-semibold whitespace-nowrap">
              {money(item.myBid)}
            </div>
            <div className="tnum text-faint mt-1 text-[0.62rem] whitespace-nowrap">
              {item.myBid === player.marketValue ? "al valor" : signed(item.myBid - player.marketValue)}
            </div>
          </div>
        ) : null}
      </div>

      <div className="hidden w-[74px] shrink-0 text-right sm:block">
        <div className="tnum text-ink text-[1.15rem] leading-none font-semibold">
          {num(player.points)}
        </div>
      </div>

      <div className="hidden w-[70px] shrink-0 text-right sm:block">
        <div className="tnum text-muted text-[1rem] leading-none">
          {num(player.averagePoints, 1)}
        </div>
      </div>

      <div className="border-line flex w-full items-center gap-3 border-t pt-2.5 sm:contents sm:border-0 sm:pt-0">
        {/* Calendario: en el móvil va aquí, que arriba no cabe */}
        {fixtures && fixtures.length > 0 && (
          <div className="shrink-0 sm:hidden">
            <FixtureStrip fixtures={fixtures} limit={3} />
          </div>
        )}

        {/* Variación del día: el dato que más se mira, en grande */}
        <div className="border-line ml-auto shrink-0 text-right sm:ml-0 sm:w-[150px] sm:border-l sm:pl-3">
          <div className="flex justify-end">
            <span className="sm:hidden">
              <PriceDelta diff={diff} size="sm" />
            </span>
            <span className="hidden sm:inline">
              <PriceDelta diff={diff} pct={odds?.diffPct} size="md" />
            </span>
          </div>
          <div className="tnum text-faint mt-1 text-[0.68rem]">
            valor {money(player.marketValue)}
          </div>
        </div>

        {/* Precio de venta */}
        <div className="border-line bg-panel-2/60 w-[104px] shrink-0 rounded-lg border px-2.5 py-1.5 sm:w-[126px]">
          <div className="tnum text-ink text-[1.05rem] leading-none font-semibold whitespace-nowrap sm:text-[1.15rem]">
            {money(item.price)}
          </div>
          <div className="tnum text-faint mt-1.5 text-[0.65rem] whitespace-nowrap">
            {overValue === 0 ? "al valor" : `${signed(overValue)} s/ valor`}
          </div>
        </div>
      </div>
    </div>
  );
}
