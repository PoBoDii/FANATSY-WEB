"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Vuelve a pedir los datos del servidor cada X segundos.
 *
 * El mercado cambia a diario, las pujas y la plantilla a todas horas y las
 * probabilidades durante la semana, así que la página no puede quedarse
 * congelada en lo que hubiera al abrirla.
 *
 * `router.refresh()` sólo revalida los Server Components: no recarga la
 * pestaña, no pierde el scroll ni lo que tengas escrito en un filtro.
 */
export function AutoRefresh({ seconds = 600 }: { seconds?: number }) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    setUpdatedAt(new Date());
    let last = Date.now();

    const tick = () => {
      // Con la pestaña en segundo plano no tiene sentido gastar peticiones.
      if (document.visibilityState !== "visible") return;
      last = Date.now();
      router.refresh();
      setUpdatedAt(new Date());
    };

    const id = setInterval(tick, seconds * 1000);

    /**
     * Al volver a la pestaña se refresca, pero sólo si ha pasado el intervalo.
     *
     * Antes se refrescaba en cada vuelta, y como el oyente **no se quitaba
     * nunca**, cada navegación dejaba uno más: al cabo de diez páginas, volver
     * a la pestaña disparaba diez recargas del servidor a la vez. Cada una de
     * esas recargas es una ejecución de servidor que se paga.
     */
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last > seconds * 1000) tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, seconds]);

  return (
    <span className="text-faint inline-flex items-center gap-1.5 text-[0.65rem]" suppressHydrationWarning>
      <span className="bg-up inline-block h-1.5 w-1.5 animate-pulse rounded-full" />
      {updatedAt
        ? `en vivo · ${updatedAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
        : "en vivo"}
    </span>
  );
}
