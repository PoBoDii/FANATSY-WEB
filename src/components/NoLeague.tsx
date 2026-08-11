/**
 * Conexión correcta pero la cuenta todavía no tiene equipo en la temporada en
 * curso. La API responde 500 a `/leagues` en ese estado (en vez de una lista
 * vacía), así que conviene explicarlo: no hay nada roto.
 */
export function NoLeague({ managerName }: { managerName: string | null }) {
  return (
    <div className="px-6 py-14 lg:px-10 lg:py-20">
      <div className="rise max-w-2xl">
        <div className="flex items-center gap-2">
          <span className="bg-up h-1.5 w-1.5 rounded-full" />
          <span className="label text-up">Conectado</span>
        </div>

        <h1 className="display mt-3 text-[clamp(2.4rem,6vw,4.5rem)]">
          Hola,
          <br />
          {managerName ?? "manager"}
        </h1>

        <p className="text-muted mt-5 max-w-lg leading-relaxed">
          El login contra LaLiga funciona y tu perfil llega bien. Lo que falta es
          que tu cuenta tenga <strong className="text-ink">un equipo en una liga</strong> de
          esta temporada — hasta entonces la API no devuelve nada que enseñar.
        </p>
      </div>

      <div className="border-line rise mt-10 max-w-2xl border-t pt-6" style={{ animationDelay: "120ms" }}>
        <div className="label mb-4">Qué hacer</div>
        <ol className="space-y-4">
          {[
            "Abre la app oficial de LALIGA Fantasy en el móvil e inicia sesión con este mismo correo.",
            "Crea una liga o únete a la de tus amigos con su código de invitación.",
            "Ficha tus primeros jugadores para que se te genere la plantilla.",
            "Vuelve aquí y recarga: el panel se llenará solo.",
          ].map((step, i) => (
            <li key={i} className="flex gap-4">
              <span className="tnum text-acid pt-0.5 text-xs">0{i + 1}</span>
              <span className="text-sm leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-faint rise mt-10 max-w-2xl text-xs" style={{ animationDelay: "200ms" }}>
        ¿Quieres comprobarlo por tu cuenta? En <span className="text-muted">Diagnóstico</span> lanza{" "}
        <span className="tnum">/v3/user/me</span> — responderá con tus datos — y luego{" "}
        <span className="tnum">/v3/leagues</span>, que dará 500 hasta que tengas liga.
      </p>
    </div>
  );
}
