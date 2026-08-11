"use client";

import { useEffect, useState } from "react";

/**
 * Cambio entre oscuro y claro.
 *
 * El oscuro es el predeterminado, así que el HTML ya sale con él puesto y no
 * hace falta esperar a JavaScript. Sólo si alguna vez se eligió el claro hay
 * que aplicarlo, y eso lo hace el script que va en el layout antes de pintar,
 * para que no se vea el fogonazo blanco.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.dataset.theme === "light");
  }, []);

  const toggle = () => {
    const next = light ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("tema", next);
    } catch {
      // Navegación privada: se queda sólo para esta sesión.
    }
    setLight(!light);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={light ? "Cambiar a oscuro" : "Cambiar a claro"}
      aria-label={light ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
      className={`border-line text-muted hover:text-ink hover:bg-panel-2 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border text-sm transition-colors ${className}`}
    >
      {light ? "🌙" : "☀️"}
    </button>
  );
}
