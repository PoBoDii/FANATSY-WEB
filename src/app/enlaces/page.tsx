import { fantasy, safe } from "@/lib/api";
import { getSession } from "@/lib/session";
import { toList, toManager } from "@/lib/normalize";
import { enlaceDe } from "@/lib/enlaces";
import { Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Los enlaces personales del bot negociador, uno por manager.
 *
 * Está aquí y no detrás de un token en una ruta de servicio porque es una
 * lista que se consulta a mano, cada vez que entra alguien nuevo en la liga: si
 * hay que acordarse de una contraseña y pegarla en la barra de direcciones,
 * acaba costando más encontrar el enlace que repartirlo.
 *
 * La página va dentro del cerrojo de la web, así que ya está protegida: quien
 * llegue aquí es porque tiene la clave.
 */
export default async function EnlacesPage() {
  const session = await getSession();
  const league = session.active;

  if (!league) {
    return <Empty title="Todavía sin liga" hint="Los detalles, en Mi plantilla." />;
  }

  const { data } = await safe(fantasy.leagueTeams(league.id));
  const base = process.env.SITE_URL ?? "";

  const managers = toList(data)
    .map((raw, i) => toManager(raw, i, league.myTeamId))
    .filter((m) => !m.isMe)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  return (
    <>
      <PageHeader
        eyebrow={league.name}
        title="Enlaces del bot"
        meta="Uno por manager. Cada uno lleva su nombre firmado, así que nadie puede hacerse pasar por otro."
      />

      <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-2 p-3 sm:p-5">
        {managers.map((m) => {
          const url = `${base}/negociar/${enlaceDe(m.name)}`;
          return (
            <div key={m.teamId} className="bg-panel border-line rounded-2xl border px-3.5 py-3">
              <div className="text-[0.95rem] font-semibold">{m.name}</div>
              {/* `break-all` porque una URL larga no tiene por dónde partir. */}
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-acid tnum mt-1 block text-[0.72rem] break-all hover:underline"
              >
                {url || `/negociar/${enlaceDe(m.name)}`}
              </a>
            </div>
          );
        })}
      </div>

      <p className="text-faint mx-auto max-w-3xl px-4 pb-8 text-[0.74rem]">
        Si no ves el dominio delante, define <code>SITE_URL</code> en las variables del sitio.
        Y ojo: la firma se calcula con <code>INFORME_TOKEN</code>, así que si algún día lo cambias,
        todos estos enlaces dejan de valer y hay que repartirlos otra vez.
      </p>
    </>
  );
}
