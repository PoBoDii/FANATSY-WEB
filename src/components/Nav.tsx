"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LeagueRef } from "@/lib/session";
import { LeaguePicker } from "./LeaguePicker";

const LINKS = [
  { href: "/", label: "Mi plantilla", num: "01" },
  { href: "/liga", label: "La liga", num: "02" },
  { href: "/mercado", label: "Mercado", num: "03" },
  { href: "/precios", label: "Precios", num: "04" },
  { href: "/alineaciones", label: "Alineaciones", num: "05" },
  { href: "/equipos", label: "Equipos", num: "06" },
  { href: "/actividad", label: "Actividad", num: "07" },
  { href: "/debug", label: "Diagnóstico", num: "08" },
];

export function Nav({
  leagues,
  activeId,
}: {
  leagues: LeagueRef[];
  activeId: string | null;
}) {
  const pathname = usePathname();

  return (
    <header className="border-line bg-panel sticky top-0 z-50 border-b lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0">
      <div className="flex items-center justify-between gap-6 px-5 py-4 lg:h-full lg:flex-col lg:items-stretch lg:justify-start lg:px-0 lg:py-7">
        {/* Marca */}
        <Link href="/" className="group shrink-0 lg:px-6">
          <div className="flex items-center gap-2">
            <span className="bg-acid flex h-8 w-8 items-center justify-center rounded-lg text-base text-white shadow-sm">
              ⚽
            </span>
            <div>
              <div className="display text-xl leading-none lg:text-2xl">Fantasy</div>
              <div className="display text-acid text-xl leading-none lg:text-2xl">Board</div>
            </div>
          </div>
        </Link>

        {/* Navegación */}
        <nav className="flex items-center gap-1 lg:mt-10 lg:flex-1 lg:flex-col lg:items-stretch lg:gap-0">
          {LINKS.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors lg:mx-3 lg:px-3 lg:py-2.5 ${
                  active
                    ? "bg-acid text-white shadow-sm"
                    : "text-muted hover:bg-panel-2 hover:text-ink"
                }`}
              >
                <span
                  className={`tnum hidden text-[0.6rem] lg:block ${
                    active ? "text-white/70" : "text-faint"
                  }`}
                >
                  {link.num}
                </span>
                <span className="text-sm font-semibold lg:text-[0.95rem]">{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Selector de liga */}
        <div className="hidden lg:block lg:px-6">
          <LeaguePicker leagues={leagues} activeId={activeId} />
        </div>
      </div>
    </header>
  );
}
