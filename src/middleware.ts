import { NextResponse, type NextRequest } from "next/server";

/**
 * Cerrojo del panel.
 *
 * Para entrar: https://tu-web/?key=LA_CLAVE — deja una cookie y ya no vuelve
 * a pedirla en ese navegador. Si `APP_PASSWORD` no está definida (uso local)
 * no hace nada.
 *
 * ── Lo único abierto: el chat de negociación ──────────────────────────────
 *
 * Su enlace se reparte por el grupo de la liga, así que tiene que entrar
 * cualquiera. Todo lo demás queda detrás de la contraseña: si un rival borra
 * `/negociar` de la barra de direcciones se encuentra un 401, no mi plantilla.
 *
 * De paso ahorra dinero: los rastreadores que husmean la web se llevan un 401
 * de una línea en vez de disparar una página entera con sus veinte peticiones.
 *
 * ── Y las rutas que llama GitHub Actions ──────────────────────────────────
 *
 * El informe y los avisos los pide un robot, y un robot no tiene cookie. No
 * quedan abiertos: cada uno comprueba su `INFORME_TOKEN` nada más entrar, que
 * es la llave que le toca a quien llama desde fuera. Dejarlos detrás de la
 * cookie sólo conseguía un 401 antes de que la ruta llegara a mirar el token.
 */
const ABIERTO = ["/negociar", "/api/negociar", "/api/informe", "/api/alertas"];

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (ABIERTO.some((abierto) => path === abierto || path.startsWith(`${abierto}/`))) {
    return NextResponse.next();
  }

  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  if (request.cookies.get("access")?.value === password) {
    return NextResponse.next();
  }

  const key = request.nextUrl.searchParams.get("key");
  if (key === password) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("key");
    const response = NextResponse.redirect(url);
    response.cookies.set("access", password, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
    return response;
  }

  return new NextResponse("No autorizado.", {
    status: 401,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
