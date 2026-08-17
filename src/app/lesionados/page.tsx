import Link from "next/link";
import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { getFf } from "@/lib/futbolfantasy";
import type { Baja } from "@/lib/futbolfantasy";
import { playersOfTeam, toList, toManager, type Player } from "@/lib/normalize";
import { ffPhoto, ffPlayerUrl, type FfPlayer } from "@/lib/odds";
import { num } from "@/lib/format";
import { Empty, PageHeader, PositionTag, Section, StatTile } from "@/components/ui";
import { FfLink } from "@/components/FfLink";

export const dynamic = "force-dynamic";

type Dueno = { player: Player; manager: string; isMe: boolean };
type Entrada = { baja: Baja; dueno: Dueno | null; row: FfPlayer | null };

/**
 * La enfermería de LaLiga.
 *
 * El juego marca a un jugador como "lesionado" y ahí se acaba la información:
 * no dice de qué ni hasta cuándo, así que no hay forma de saber si vuelve el
 * domingo o en marzo. futbolfantasy sí lo publica, club por club, y eso es lo
 * que se recoge aquí.
 *
 * Ordenado por lo que importa: primero los tuyos —son los huecos que tienes que
 * tapar—, luego los de los rivales —son los que puedes robarles baratos o los
 * que explican por qué alguien no puntúa— y al final los libres, que en el
 * mercado son la trampa más cara de todas.
 */
export default async function LesionadosPage() {
  const session = await getSession();
  const league = session.active;

  const [ff, { data: teamsRaw }] = await Promise.all([
    getFf(),
    league ? safe(fantasy.leagueTeams(league.id)) : Promise.resolve({ data: null }),
  ]);

  if (ff.bajas.size === 0) {
    return (
      <>
        <PageHeader eyebrow="Lesionados" title="La enfermería" />
        <Empty
          title="Sin partes médicos"
          hint="futbolfantasy no respondió o cambió el marcado. Míralo en Diagnóstico."
        />
      </>
    );
  }

  /* ------------------------------------------------------- de quién es cada uno */

  const duenos = new Map<string, Dueno>();

  toList(teamsRaw).forEach((raw, i) => {
    const manager = toManager(raw, i, league?.myTeamId ?? null);
    for (const player of playersOfTeam(raw)) {
      const hit = ff.get(player);
      if (hit?.slug) duenos.set(hit.slug, { player, manager: manager.name, isMe: manager.isMe });
    }
  });

  // Para los que no tiene nadie, la ficha de futbolfantasy es todo lo que hay:
  // de ahí salen la foto y el equipo.
  const filas = new Map<string, FfPlayer>();
  for (const row of ff.all) if (row.slug) filas.set(row.slug, row);

  const todas: Entrada[] = [...ff.bajas.values()].map((baja) => ({
    baja,
    dueno: duenos.get(baja.slug) ?? null,
    row: filas.get(baja.slug) ?? null,
  }));

  const mias = todas.filter((e) => e.dueno?.isMe);
  const rivales = todas.filter((e) => e.dueno && !e.dueno.isMe);
  const libres = todas.filter((e) => !e.dueno);

  // Las más largas arriba: una rotura de cruzado importa más que una duda para
  // el domingo, y es lo que decide si hay que buscar recambio.
  const porGravedad = (a: Entrada, b: Entrada) =>
    (b.baja.dias ?? 0) - (a.baja.dias ?? 0) || a.baja.name.localeCompare(b.baja.name, "es");

  return (
    <>
      <PageHeader
        eyebrow="Lesionados y sancionados"
        title="La enfermería"
        meta={`${num(todas.length)} bajas en LaLiga · ${num(mias.length + rivales.length)} con dueño en tu liga`}
        action={<FfLink href="https://www.futbolfantasy.com/laliga/lesionados" label="Verlo en futbolfantasy" />}
      />

      <div className="border-line grid grid-cols-2 border-b lg:grid-cols-4">
        <StatTile label="Tuyos" value={num(mias.length)} tone={mias.length > 0 ? "down" : "up"} />
        <StatTile label="De rivales" value={num(rivales.length)} delay={60} />
        <StatTile label="Sin dueño" value={num(libres.length)} sub="cuidado en el mercado" delay={120} />
        <StatTile label="En LaLiga" value={num(todas.length)} delay={180} />
      </div>

      <Section title="Tuyos" count={mias.length}>
        {mias.length === 0 ? (
          <Empty title="Ninguno tuyo está tocado" hint="Disfrútalo mientras dure." />
        ) : (
          <ol>
            {mias.sort(porGravedad).map((e) => (
              <Fila key={e.baja.slug} entrada={e} />
            ))}
          </ol>
        )}
      </Section>

      {rivales.length > 0 && (
        <Section title="De rivales" count={rivales.length}>
          <ol>
            {rivales.sort(porGravedad).map((e) => (
              <Fila key={e.baja.slug} entrada={e} />
            ))}
          </ol>
        </Section>
      )}

      {libres.length > 0 && (
        <Section title="Sin dueño" count={libres.length}>
          <ol>
            {libres.sort(porGravedad).map((e) => (
              <Fila key={e.baja.slug} entrada={e} />
            ))}
          </ol>
        </Section>
      )}
    </>
  );
}

function Fila({ entrada }: { entrada: Entrada }) {
  const { baja, dueno, row } = entrada;
  const foto = dueno?.player.image ?? ffPhoto(row?.ffId ?? null);
  const equipo = row?.teamName ?? dueno?.player.clubName ?? null;

  // "Baja hasta marzo" ya lleva la palabra dentro; se quita para no repetirla.
  const hasta = baja.hasta?.replace(/^Baja /, "") ?? null;
  const grave = /hasta/i.test(baja.hasta ?? "");

  const nombre = (
    <span className="truncate font-semibold">{dueno?.player.name ?? baja.name}</span>
  );

  return (
    <li className="border-line flex items-center gap-3 border-b px-3.5 py-3 sm:px-6 lg:px-10">
      <div className="border-line bg-panel-2 h-11 w-11 shrink-0 overflow-hidden rounded-xl border">
        {foto && (
          // Imágenes de CDN externo: <img> evita depender del optimizador.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {dueno && <PositionTag position={dueno.player.position} size="sm" />}
          {dueno ? (
            <Link href={`/jugador/${dueno.player.id}`} className="hover:text-acid truncate font-semibold">
              {dueno.player.name}
            </Link>
          ) : (
            nombre
          )}
          <span
            className={`shrink-0 rounded-md px-1.5 py-[2px] text-[0.6rem] font-bold ${
              baja.tipo === "sancion" ? "bg-warn/15 text-warn" : "bg-down/15 text-down"
            }`}
          >
            {baja.tipo === "sancion" ? "SANCIÓN" : "LESIÓN"}
          </span>
        </div>

        <p className="text-muted mt-0.5 truncate text-[0.82rem]">
          {baja.motivo ?? "Sin detalles"}
          {equipo && ` · ${equipo}`}
          {baja.dias != null && ` · ${baja.dias} días fuera`}
        </p>
      </div>

      <div className="shrink-0 text-right">
        {hasta && (
          <div className={`text-[0.8rem] font-semibold ${grave ? "text-down" : "text-warn"}`}>
            {hasta}
          </div>
        )}
        <div className="text-faint text-[0.72rem]">
          {dueno ? (dueno.isMe ? "es tuyo" : dueno.manager) : "libre"}
        </div>
        {row?.slug && (
          <a
            href={ffPlayerUrl(row.slug) ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="text-faint hover:text-acid text-[0.68rem]"
          >
            parte médico ↗
          </a>
        )}
      </div>
    </li>
  );
}
