import Link from "next/link";
import { getSession } from "@/lib/session";
import { buildReport, type ReportMatch, type ReportPlayer, type ReportSection } from "@/lib/informe";
import { money } from "@/lib/format";
import { Empty, PositionTag } from "@/components/ui";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { oddsTone } from "@/lib/odds";
import type { Position } from "@/lib/normalize";

export const dynamic = "force-dynamic";

/**
 * El informe del día.
 *
 * ── Cómo está pensado ─────────────────────────────────────────────────────
 *
 * Como una hoja que se lee de un vistazo cada mañana, no como otra pantalla de
 * la web. De ahí tres decisiones:
 *
 *  · **El orden lo marca el reloj.** Lo que vence hoy va antes que lo de
 *    mañana, y lo de los rivales antes que lo mío: para lo suyo hay que actuar
 *    hoy o se lo lleva otro.
 *  · **Cabe en el ancho que haya.** En el móvil una columna; en un monitor,
 *    tres, para que entre entera sin desplazarse.
 *  · **Se imprime.** Con Ctrl+P sale un PDF decente, que era lo que se pedía,
 *    sin montar un generador de PDF ni pagar por él.
 */
export default async function InformePage() {
  const session = await getSession();
  if (!session.active) {
    return (
      <Empty
        title="Todavía sin liga"
        hint="El informe se arma con tu plantilla y tu liga. Los detalles, en Mi plantilla."
      />
    );
  }

  const league = session.active;
  const report = await buildReport(league.id, league.myTeamId, league.name);

  const day = new Date(report.builtAt).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const time = new Date(report.builtAt).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
      {/* Cabecera propia y no la de la web: esto es una hoja, no una sección */}
      <header className="border-line mb-4 flex flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div>
          <span className="label">{report.league}</span>
          <h1 className="display mt-1 text-[clamp(1.6rem,5vw,2.6rem)] first-letter:uppercase">
            {day}
          </h1>
        </div>
        <div className="text-faint text-right text-[0.78rem]">
          <div>generado a las {time}</div>
          <div className="tnum">saldo {money(report.money)}</div>
        </div>
      </header>

      {/* El aviso del día: empieza la jornada o se cierran las cláusulas */}
      {report.alert && (
        <div
          className={`mb-4 flex items-center gap-3 rounded-2xl px-4 py-3 ${
            report.alert.kind === "cierre"
              ? "bg-down/15 text-down"
              : "bg-acid/15 text-acid"
          }`}
        >
          <span aria-hidden className="text-[1.4rem]">
            {report.alert.kind === "cierre" ? "⏰" : "⚽"}
          </span>
          <p className="text-[1rem] leading-tight font-bold sm:text-[1.15rem]">
            {report.alert.text}
          </p>
        </div>
      )}

      {/* Partidos de hoy, con escudos y los tuyos marcados */}
      {report.today.length > 0 && (
        <section className="mb-4">
          <h2 className="label mb-2">Hoy se juega</h2>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {report.today.map((match) => (
              <MatchRow key={match.id} match={match} />
            ))}
          </div>
        </section>
      )}

      {report.sections.length === 0 ? (
        <Empty
          title="Nada que hacer hoy"
          hint="Ni cláusulas a punto, ni bajas, ni movimientos que merezcan una decisión."
        />
      ) : (
        /**
         * Mampostería por columnas: cada bloque mide lo que mide y se van
         * apilando sin dejar huecos. Con una rejilla normal, un bloque de diez
         * jugadores dejaba media pantalla vacía al lado.
         */
        <div className="gap-3 lg:columns-2 2xl:columns-3">
          {report.sections.map((section) => (
            <Section key={section.key} section={section} />
          ))}
        </div>
      )}

      <p className="text-faint mt-4 text-[0.72rem]">
        Sólo entra lo que exige una decisión: las cláusulas que vencen en las próximas horas, los
        movimientos de valor destacados y los jugadores con nota suficiente. Con Ctrl+P (o
        Compartir → Imprimir en el móvil) sale en PDF.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- partido */

function MatchRow({ match }: { match: ReportMatch }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-3 py-2 ${
        match.mine > 0 ? "bg-[#e0a827]/12" : "bg-panel-2/60"
      }`}
    >
      <Badge src={match.home.badge} />
      <span className="min-w-0 flex-1 truncate text-[0.82rem] font-semibold">
        {match.home.name}
      </span>
      <span className="tnum text-faint shrink-0 text-[0.72rem]">{match.time}</span>
      <span className="min-w-0 flex-1 truncate text-right text-[0.82rem] font-semibold">
        {match.away.name}
      </span>
      <Badge src={match.away.badge} />
      {match.mine > 0 && (
        <span
          className="tnum shrink-0 rounded-full px-1.5 py-[1px] text-[0.6rem] font-bold text-black"
          style={{ background: "#e0a827" }}
          title={`Tienes ${match.mine} jugador${match.mine === 1 ? "" : "es"} en este partido`}
        >
          {match.mine}
        </span>
      )}
    </div>
  );
}

function Badge({ src }: { src: string | null }) {
  if (!src) return <span className="h-5 w-5 shrink-0" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={20} height={20} className="h-5 w-5 shrink-0 object-contain" />;
}

/* ---------------------------------------------------------------- bloque */

const TONE = {
  urgente: { bar: "bg-down", text: "text-down" },
  aviso: { bar: "bg-warn", text: "text-warn" },
  oportunidad: { bar: "bg-up", text: "text-up" },
  neutral: { bar: "bg-faint/50", text: "text-ink" },
} as const;

function Section({ section }: { section: ReportSection }) {
  const tone = TONE[section.tone];

  return (
    <section className="bg-panel border-line mb-3 break-inside-avoid overflow-hidden rounded-2xl border">
      <div className="flex items-start gap-2.5 px-3.5 pt-3 pb-2">
        <span aria-hidden className={`mt-1.5 h-4 w-[3px] shrink-0 rounded-full ${tone.bar}`} />
        <div className="min-w-0">
          <h2 className={`text-[1rem] leading-tight font-bold ${tone.text}`}>{section.title}</h2>
          <p className="text-faint mt-0.5 text-[0.74rem] leading-snug">{section.lead}</p>
        </div>
      </div>

      {section.notes && section.notes.length > 0 && (
        <ul className="space-y-1 px-3.5 pb-2">
          {section.notes.map((note) => (
            <li key={note} className="text-[0.78rem] leading-snug">
              {note}
            </li>
          ))}
        </ul>
      )}

      {section.players.length > 0 && (
        <ul className="border-line divide-line divide-y border-t">
          {section.players.map((player) => (
            <Row key={`${player.name}-${player.id ?? ""}`} player={player} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Una línea del informe.
 *
 * Más apretada que la tarjeta de las listas a propósito: aquí no se viene a
 * estudiar al jugador sino a reconocerlo y saber qué hacer con él. Todo lo que
 * hace falta cabe en dos renglones.
 */
function Row({ player }: { player: ReportPlayer }) {
  const tone = player.probability != null ? oddsTone(player.probability) : null;

  const body = (
    <>
      <div className="bg-panel-2 h-9 w-9 shrink-0 overflow-hidden rounded-lg">
        <PlayerPhoto src={player.photo} name={player.name} size={36} className="h-full w-full" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <PositionTag position={player.position as Position} size="sm" />
          <span className="truncate text-[0.88rem] font-semibold">{player.name}</span>
          {tone && (
            <span
              className="tnum shrink-0 rounded px-1 py-[1px] text-[0.6rem] font-bold"
              style={{ background: tone.color, color: tone.ink }}
            >
              {player.probability}%
            </span>
          )}
        </div>
        <div className="text-faint mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[0.7rem]">
          <span className="tnum">{money(player.value)}</span>
          {player.diff ? (
            <span className={player.diff > 0 ? "text-up" : "text-down"}>
              {player.diff > 0 ? "▲" : "▼"} {money(Math.abs(player.diff))}
            </span>
          ) : null}
          <span className="min-w-0 truncate">{player.why}</span>
        </div>
      </div>

      {player.score !== null && (
        <span
          className={`tnum shrink-0 text-right text-[1.05rem] font-bold ${
            player.score >= 6 ? "text-up" : player.score >= 4 ? "text-ink" : "text-faint"
          }`}
          title="Nota de 0 a 10"
        >
          {player.score.toFixed(1)}
        </span>
      )}
    </>
  );

  const className = "hover:bg-panel-2/60 flex items-center gap-2.5 px-3.5 py-2 transition-colors";

  return (
    <li>
      {player.id ? (
        <Link href={`/jugador/${player.id}`} className={className}>
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  );
}
