import { NextResponse, type NextRequest } from "next/server";

/**
 * Cerrojo mínimo para cuando el panel esté desplegado en internet.
 * Si `APP_PASSWORD` no está definida (uso local) no hace nada.
 *
 * Para entrar: https://tu-web/?key=LA_CLAVE — deja una cookie y ya no vuelve
 * a pedirla en ese navegador.
 */
export function middleware(request: NextRequest) {
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

  return new NextResponse("No autorizado. Añade ?key=... a la URL.", {
    status: 401,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
