"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Volver a donde estabas, no a una sección fija.
 *
 * Antes cada página tenía su enlace de vuelta cableado ("← Equipos"), así que
 * si llegabas a un club desde tu plantilla acababas en la lista de equipos y
 * perdías el sitio. Ahora se usa el historial del navegador, que es lo que uno
 * espera de una flecha de volver.
 *
 * Cuando no hay historial —la página se abrió directamente, o se llegó desde
 * fuera— se cae al destino de siempre, que para eso se sigue pasando.
 */
export function BackLink({
  href,
  label,
  className = "",
}: {
  /** A dónde ir si no hay nada atrás en el historial. */
  href: string;
  /** Texto de ese destino de reserva ("Equipos", "Clasificación"…). */
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);

  // `history.length` sólo se puede mirar en el cliente, y hasta que se
  // hidrata se enseña el enlace normal: así funciona sin JavaScript.
  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, []);

  const base = `label hover:text-acid inline-flex items-center gap-1.5 transition-colors ${className}`;

  if (!canGoBack) {
    return (
      <Link href={href} className={base}>
        ← {label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => router.back()} className={base} title={`Volver`}>
      ← Volver
    </button>
  );
}
