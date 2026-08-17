"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { LeagueRef } from "@/lib/session";
import { LeaguePicker } from "./LeaguePicker";
import { ClubStrip } from "./ClubStrip";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "/", label: "Mi plantilla", num: "01" },
  { href: "/fichajes", label: "Fichajes", num: "02" },
  { href: "/liga", label: "La liga", num: "03" },
  { href: "/mercado", label: "Mercado", num: "04" },
  { href: "/precios", label: "Precios", num: "05" },
  { href: "/alineaciones", label: "Alineaciones", num: "06" },
  { href: "/equipos", label: "Equipos", num: "07" },
  { href: "/actividad", label: "Actividad", num: "08" },
  { href: "/historial", label: "Compraventa", num: "09" },
  { href: "/informe", label: "Informe de hoy", num: "10" },
  { href: "/negociaciones", label: "Negociaciones", num: "11" },
  { href: "/enlaces", label: "Enlaces del bot", num: "12" },
  { href: "/debug", label: "Diagnóstico", num: "13" },
];

/**
 * Menú lateral en pantalla grande y cajón desplegable en el móvil.
 *
 * Ocho secciones en una fila horizontal no caben en 393 px: se salían de la
 * pantalla y había que hacer zoom. En el móvil queda una barra fija con el
 * botón de menú y el cajón entra desde la izquierda, como en futbolfantasy.
 */
export function Nav({ leagues, activeId }: { leagues: LeagueRef[]; activeId: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  /**
   * El chat de negociación no lleva menú.
   *
   * Su enlace se pega en el grupo de la liga, así que ahí entra gente que no
   * debe ver mi plantilla ni mis fichajes: sólo el bot.
   */
  const soloChat = pathname?.startsWith("/negociar") ?? false;

  // Al cambiar de página el cajón se cierra solo; si no, se queda abierto
  // encima del contenido nuevo.
  useEffect(() => setOpen(false), [pathname]);

  // Con el cajón abierto no se desplaza lo de detrás.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (soloChat) return null;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const brand = (
    <Link href="/" className="group flex shrink-0 items-center gap-2">
      <span className="bg-acid flex h-8 w-8 items-center justify-center rounded-xl text-sm text-white shadow-sm lg:h-9 lg:w-9 lg:text-base">
        ⚽
      </span>
      <div>
        <div className="display text-lg leading-none lg:text-2xl">PoBoDi</div>
        <div className="display text-acid text-lg leading-none lg:text-2xl">Fantasy</div>
      </div>
    </Link>
  );

  const links = (
    <nav className="flex flex-col gap-0.5">
      {LINKS.map((link) => {
        const active = isActive(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors ${
              active ? "bg-acid text-white shadow-sm" : "text-muted hover:bg-panel-2 hover:text-ink"
            }`}
          >
            <span className={`tnum text-[0.6rem] ${active ? "text-white/70" : "text-faint"}`}>
              {link.num}
            </span>
            <span className="text-[0.95rem] font-semibold">{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Barra del móvil */}
      <header className="border-line bg-panel sticky top-0 z-50 border-b lg:hidden">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
            className="border-line text-ink hover:bg-panel-2 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border"
          >
            <span className="flex flex-col gap-[3px]">
              <span className="bg-ink block h-[2px] w-4 rounded-full" />
              <span className="bg-ink block h-[2px] w-4 rounded-full" />
              <span className="bg-ink block h-[2px] w-4 rounded-full" />
            </span>
          </button>

          {brand}

          <span className="text-faint ml-auto truncate text-[0.78rem] font-semibold">
            {LINKS.find((l) => isActive(l.href))?.label}
          </span>
          <ThemeToggle />
        </div>

        {/* Los veinte clubes, siempre a mano */}
        <ClubStrip />
      </header>

      {/* Cajón del móvil */}
      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/45"
          />
          <div className="bg-panel absolute inset-y-0 left-0 flex w-[82%] max-w-[320px] flex-col gap-6 overflow-y-auto p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              {brand}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                className="border-line text-muted hover:text-ink flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border text-lg"
              >
                ✕
              </button>
            </div>

            {links}

            <div className="mt-auto">
              <LeaguePicker leagues={leagues} activeId={activeId} />
            </div>
          </div>
        </div>
      )}

      {/* Barra lateral de escritorio */}
      <header className="border-line bg-panel sticky top-0 hidden h-screen w-[248px] shrink-0 border-r lg:block">
        <div className="flex h-full flex-col px-3 py-7">
          <div className="px-3">{brand}</div>
          <div className="mt-10 flex-1">{links}</div>
          <div className="flex items-end gap-2 px-3">
            <div className="min-w-0 flex-1">
              <LeaguePicker leagues={leagues} activeId={activeId} />
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>
    </>
  );
}
