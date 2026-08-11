import Link from "next/link";
import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { fixturesByClub, type Fixture } from "@/lib/equipos";
import { FixtureStrip } from "@/components/Fixtures";
import { enrichOdds, getFf } from "@/lib/futbolfantasy";
import { ffBadge, oddsTone, type FfPlayer } from "@/lib/odds";
import { toList, toMarketItem, type MarketItem } from "@/lib/normalize";
import { money, num, signed, timeLeft } from "@/lib/format";
import { AutoRefresh } from "@/components/AutoRefresh";
import {
  AlertBadge,
  ClubBadge,
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

type Sort = "precio" | "puntos" | "prob" | "dif" | "media";

const SORTS: { key: Sort; label: string }[] = [
  { key: "precio", label: "Precio" },
  { key: "puntos", label: "Puntos" },
  { key: "media", label: "Media" },
  { key: "prob", label: "Probabilidad" },
  { key: "dif", label: "Sube más" },
];

export default async function MercadoPage({
  searchParams,
}: {
  searchParams: Promise<{ orden?: string; dir?: string }>;
}) {
  const { orden, dir: rawDir } = await searchParams;
  const sort: Sort = (SORTS.find((s) => s.key === orden)?.key ?? "precio") as Sort;
  const dir: "asc" | "desc" = rawDir === "asc" ? "asc" : "desc";

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
      case "puntos":
        return b.player.points - a.player.points || byDiff(a, b);
      case "media":
        return b.player.averagePoints - a.player.averagePoints || byDiff(a, b);
      case "prob":
        return (oddsOf(b)?.probability ?? -1) - (oddsOf(a)?.probability ?? -1) || byDiff(a, b);
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
        action={<AutoRefresh seconds={60} />}
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

      {/* Ordenación */}
      <div className="border-line flex flex-wrap items-center gap-2 border-b px-5 py-3.5 lg:px-6">
        <span className="label mr-1">Ordenar por</span>
        {SORTS.map((option) => {
          const active = sort === option.key;
          const nextDir = active && dir === "desc" ? "asc" : "desc";
          return (
            <Link
              key={option.key}
              href={`/mercado?orden=${option.key}&dir=${nextDir}`}
              scroll={false}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                active
                  ? "border-acid/60 bg-acid/10 text-acid"
                  : "border-line text-muted hover:border-faint hover:text-ink"
              }`}
            >
              {option.label}
              {active && (
                <span className="bg-acid/15 rounded-full px-1.5 py-[1px] text-[0.62rem]">
                  {dir === "desc" ? "máx" : "mín"}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {sorted.length === 0 ? (
        <Empty
          title="Mercado vacío"
          hint="No hay jugadores pujables ahora mismo. Se renueva cada día."
        />
      ) : (
        <div>
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
        <section className="mt-8">
          <div className="border-line bg-panel/40 flex items-baseline gap-3 border-y px-5 py-3 lg:px-6">
            <h2 className="display text-lg">Entrenadores</h2>
            <span className="tnum text-faint text-xs">{coaches.length}</span>
          </div>
          {coaches.map((item, i) => (
            <MarketRow key={item.id || item.player.id} item={item} odds={null} delay={i * 22} />
          ))}
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
      className="border-line rise hover:bg-panel-2 relative flex items-center gap-3 border-b py-2.5 pr-4 pl-4 transition-colors lg:gap-5 lg:pr-6 lg:pl-6"
      style={{ animationDelay: `${delay}ms` }}
    >
      <Link href={`/jugador/${player.id}`} className="absolute inset-0" aria-label={player.name} />
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[4px]"
        style={{ background: tone?.color ?? "transparent" }}
      />

      <PlayerAvatar player={player} size={52} />

      {/* Identidad */}
      <div className="min-w-0 w-[190px] shrink-0">
        <div className="flex items-center gap-2">
          <PositionTag position={player.position} />
          <span className="truncate text-[0.95rem] leading-tight font-medium">{player.name}</span>
          <AlertBadge alerts={odds?.alerts} />
        </div>
        <div className="text-muted mt-1 flex items-center gap-1.5 text-xs">
          <ClubBadge src={badge} size={14} />
          <span className="truncate">{club}</span>
        </div>
      </div>

      {/* Probabilidad, con espacio propio en vez de pegada al nombre */}
      {player.position !== "EN" ? (
        <div className="w-[86px] shrink-0">
          <div className="label text-[0.55rem] leading-none">Juega</div>
          <div className="mt-1.5">
            <OddsChip odds={odds} />
          </div>
        </div>
      ) : (
        <div className="w-[86px] shrink-0" />
      )}

      {/* Calendario de su club: los cinco próximos de liga */}
      <div className="hidden shrink-0 lg:block">
        <div className="label mb-1 text-[0.55rem]">Calendario</div>
        <FixtureStrip fixtures={fixtures ?? []} />
      </div>

      <div className="hidden min-w-0 flex-1 flex-col gap-1 md:flex">
        <StatusTag status={player.status} />
        <span className="text-faint text-[0.72rem]">
          {item.bids > 0 ? `${item.bids} ${item.bids === 1 ? "puja" : "pujas"}` : "sin pujas"}
          {left ? ` · cierra en ${left}` : ""}
        </span>
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

      {/* Rendimiento */}
      <div className="hidden w-[74px] shrink-0 text-right sm:block">
        <div className="label text-[0.55rem] leading-none">Puntos</div>
        <div className="tnum text-ink mt-1 text-[1.05rem] leading-none">{num(player.points)}</div>
        <div className="tnum text-faint mt-1 text-[0.68rem]">
          {num(player.averagePoints, 1)} media
        </div>
      </div>

      {/* Variación del día: el dato que más se mira, en grande */}
      <div className="border-line w-[150px] shrink-0 border-l pl-3 text-right">
        <div className="label text-[0.55rem] leading-none">Hoy</div>
        <div className="mt-1 flex justify-end">
          <PriceDelta diff={diff} pct={odds?.diffPct} size="md" />
        </div>
        <div className="tnum text-faint mt-1 text-[0.68rem]">valor {money(player.marketValue)}</div>
      </div>

      {/* Precio de venta */}
      <div className="border-line bg-panel-2/60 w-[126px] shrink-0 rounded-sm border px-2.5 py-1.5">
        <div className="label text-[0.55rem] leading-none">Precio</div>
        <div className="tnum text-ink mt-1.5 text-[1.15rem] leading-none font-semibold whitespace-nowrap">
          {money(item.price)}
        </div>
        <div className="tnum text-faint mt-1.5 text-[0.65rem] whitespace-nowrap">
          {overValue === 0 ? "al valor" : `${signed(overValue)} s/ valor`}
        </div>
      </div>
    </div>
  );
}
