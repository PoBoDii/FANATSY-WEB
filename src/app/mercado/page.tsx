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

type Sort = "nombre" | "precio" | "puntos" | "prob" | "dif" | "media" | "pujas";

/**
 * Cabecera de columna: cada una ordena por lo suyo y guarda el ancho de su
 * celda en la fila, para que el título quede encima del dato.
 *
 * `natural` es la dirección en la que se entra al pulsarla: en el nombre se
 * espera la A→Z y en todo lo demás, de mayor a menor.
 */
const COLUMNS: {
  key: Sort;
  label: string;
  width: string;
  align: "left" | "right" | "center";
  natural: "asc" | "desc";
  hide?: string;
}[] = [
  { key: "nombre", label: "Jugador", width: "w-[190px]", align: "left", natural: "asc" },
  { key: "prob", label: "Juega", width: "w-[86px]", align: "left", natural: "desc" },
  { key: "pujas", label: "Pujas", width: "flex-1", align: "left", natural: "desc", hide: "hidden md:block" },
  { key: "puntos", label: "Puntos", width: "w-[74px]", align: "right", natural: "desc", hide: "hidden sm:block" },
  { key: "media", label: "Media", width: "w-[70px]", align: "right", natural: "desc", hide: "hidden sm:block" },
  { key: "dif", label: "Hoy", width: "w-[150px]", align: "right", natural: "desc" },
  { key: "precio", label: "Precio", width: "w-[126px]", align: "right", natural: "desc" },
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
      case "nombre":
        // Al revés que el resto: la lista se invierte después, y en el nombre
        // lo natural es la A→Z.
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

      <SortHeader sort={sort} dir={dir} />

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

/**
 * Cabecera de tabla: se pulsa el título de la columna y ordena por ella,
 * alternando de mayor a menor. La flecha dice por cuál se está ordenando y en
 * qué sentido, que es lo que una fila de pastillas no contaba.
 */
function SortHeader({ sort, dir }: { sort: Sort; dir: "asc" | "desc" }) {
  return (
    <div className="border-line bg-panel-2/70 sticky top-0 z-20 flex items-center gap-3 border-y py-2 pr-4 pl-4 lg:gap-5 lg:pr-6 lg:pl-6">
      {/* Hueco de la foto, para que los títulos caigan sobre su columna */}
      <span className="w-[52px] shrink-0" aria-hidden />

      {COLUMNS.map((col) => {
        const active = sort === col.key;
        // Pulsar la activa da la vuelta; pulsar otra entra por su orden natural.
        const nextDir = active ? (dir === "desc" ? "asc" : "desc") : col.natural;
        const grow = col.width === "flex-1" ? "min-w-0 flex-1" : `${col.width} shrink-0`;
        const justify =
          col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "";

        return (
          <Link
            key={col.key}
            href={`/mercado?orden=${col.key}&dir=${nextDir}`}
            scroll={false}
            className={`${grow} ${col.hide ?? ""} flex items-center gap-1 ${justify} transition-colors ${
              active ? "text-acid" : "text-faint hover:text-ink"
            }`}
            title={`Ordenar por ${col.label}`}
          >
            <span className="text-[0.62rem] font-bold tracking-wide uppercase">{col.label}</span>
            <span className={`text-[0.6rem] leading-none ${active ? "" : "opacity-30"}`}>
              {active ? (dir === "desc" ? "▼" : "▲") : "▼"}
            </span>
          </Link>
        );
      })}

      {/* Hueco de "mi puja", que no ordena */}
      <span className="hidden w-[124px] shrink-0 lg:block" aria-hidden />
    </div>
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
        <ClubLink name={club} badge={badge} size={14} className="text-muted mt-1 text-xs" />
        {fixtures && fixtures.length > 0 && (
          <div className="mt-1.5 hidden lg:block">
            <FixtureStrip fixtures={fixtures} limit={5} />
          </div>
        )}
      </div>

      {/* Probabilidad, con espacio propio en vez de pegada al nombre */}
      {player.position !== "EN" ? (
        <div className="w-[86px] shrink-0">
          <OddsChip odds={odds} />
        </div>
      ) : (
        <div className="w-[86px] shrink-0" />
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

      {/* Variación del día: el dato que más se mira, en grande */}
      <div className="border-line w-[150px] shrink-0 border-l pl-3 text-right">
        <div className="flex justify-end">
          <PriceDelta diff={diff} pct={odds?.diffPct} size="md" />
        </div>
        <div className="tnum text-faint mt-1 text-[0.68rem]">valor {money(player.marketValue)}</div>
      </div>

      {/* Precio de venta */}
      <div className="border-line bg-panel-2/60 w-[126px] shrink-0 rounded-sm border px-2.5 py-1.5">
        <div className="tnum text-ink text-[1.15rem] leading-none font-semibold whitespace-nowrap">
          {money(item.price)}
        </div>
        <div className="tnum text-faint mt-1.5 text-[0.65rem] whitespace-nowrap">
          {overValue === 0 ? "al valor" : `${signed(overValue)} s/ valor`}
        </div>
      </div>
    </div>
  );
}
