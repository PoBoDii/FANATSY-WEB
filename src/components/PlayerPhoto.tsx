"use client";

import { useState } from "react";

/**
 * Foto de jugador con recambio. Los CDN de LaLiga y futbolfantasy tienen
 * huecos —jugadores recién fichados, filiales— y sin esto quedaba el icono de
 * imagen rota. Al fallar se prueba la alternativa y, si tampoco, las iniciales.
 */
export function PlayerPhoto({
  src,
  fallback,
  name,
  size,
  className = "",
}: {
  src: string | null;
  fallback?: string | null;
  name: string;
  size: number;
  className?: string;
}) {
  const sources = [src, fallback].filter((s): s is string => Boolean(s));
  const [index, setIndex] = useState(0);
  const current = sources[index];

  // Con clases propias manda el CSS: la foto a sangre de la tarjeta necesita
  // estirarse al hueco, y un alto en línea lo impediría.
  const box = className ? undefined : { width: size, height: size };

  if (!current) {
    return (
      <div
        className={`bg-panel-2 text-faint flex items-center justify-center text-[0.65rem] font-semibold ${className}`}
        style={box}
      >
        {name.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setIndex((i) => i + 1)}
      className={`object-cover object-top ${className}`}
      style={box}
    />
  );
}
