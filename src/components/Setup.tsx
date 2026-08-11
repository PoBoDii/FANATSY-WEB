/**
 * Pantalla que sale cuando el login contra LaLiga falla. Es la primera cosa
 * que verás al arrancar el proyecto sin `.env.local`, así que explica el
 * camino completo en vez de soltar un error.
 */
export function Setup({ error }: { error: string }) {
  const steps = [
    {
      n: "01",
      title: "Cuenta con email y contraseña",
      body: "Regístrate en LaLiga Fantasy con email y contraseña, no con Google ni Facebook. El flujo de login que usa este panel (ROPC) sólo funciona así.",
    },
    {
      n: "02",
      title: "Crea .env.local",
      body: "En la raíz del proyecto, con tus credenciales. No se sube a ningún sitio: sólo las usa el servidor para pedir el token.",
      code: "FANTASY_EMAIL=tu@email.com\nFANTASY_PASSWORD=tu-contraseña",
    },
    {
      n: "03",
      title: "Reinicia el servidor",
      body: "Next sólo lee .env.local al arrancar. Para el proceso y vuelve a lanzar npm run dev.",
    },
    {
      n: "04",
      title: "Alternativa: token a mano",
      body: "Si tu cuenta es de Google y no quieres cambiarla, entra en fantasy.laliga.com, abre DevTools → Application → Local Storage, copia el token y ponlo en FANTASY_TOKEN. Caduca cada 24 h.",
      code: "FANTASY_TOKEN=eyJhbGciOi...",
    },
  ];

  return (
    <div className="px-6 py-14 lg:px-10 lg:py-20">
      <div className="rise max-w-2xl">
        <div className="label text-acid">Configuración pendiente</div>
        <h1 className="display mt-2 text-[clamp(2.4rem,6vw,4.5rem)]">
          Conecta
          <br />
          tu cuenta
        </h1>
        <div className="border-down/40 bg-down/5 mt-6 border px-4 py-3">
          <div className="label text-down">Respuesta de LaLiga</div>
          <p className="tnum mt-1.5 text-sm break-words">{error}</p>
        </div>
      </div>

      <ol className="mt-12 max-w-2xl">
        {steps.map((s, i) => (
          <li
            key={s.n}
            className="border-line rise border-t py-6"
            style={{ animationDelay: `${100 + i * 80}ms` }}
          >
            <div className="flex gap-5">
              <span className="tnum text-acid pt-1 text-xs">{s.n}</span>
              <div className="min-w-0 flex-1">
                <h2 className="display text-lg">{s.title}</h2>
                <p className="text-muted mt-2 text-sm leading-relaxed">{s.body}</p>
                {s.code && (
                  <pre className="border-line bg-panel tnum text-ink mt-3 overflow-x-auto border px-3 py-2.5 text-xs">
                    {s.code}
                  </pre>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
