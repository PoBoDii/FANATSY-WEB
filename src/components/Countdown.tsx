"use client";

import { useEffect, useState } from "react";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Precisión creciente según se acerca: días y horas cuando falta mucho, horas
 * y minutos el último día, y minutos y segundos la última hora. Cuando quedan
 * segundos, verlos importa.
 */
function format(ms: number): string {
  if (ms <= 0) return "libre";
  if (ms < HOUR) {
    const m = Math.floor(ms / MINUTE);
    const s = Math.floor((ms % MINUTE) / 1000);
    return `${m}m ${String(s).padStart(2, "0")}s`;
  }
  if (ms < DAY) {
    const h = Math.floor(ms / HOUR);
    const m = Math.floor((ms % HOUR) / MINUTE);
    return `${h}h ${String(m).padStart(2, "0")}m`;
  }
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  return `${d}d ${h}h`;
}

/**
 * Cuenta atrás hasta que la cláusula se desbloquea.
 *
 * Refresca cada segundo en la última hora y cada medio minuto el resto del
 * tiempo: no tiene sentido repintar cada segundo algo que dice "13d 21h".
 *
 * `suppressHydrationWarning` porque servidor y cliente pueden caer a distinto
 * lado de un segundo; se corrige en el primer efecto.
 */
export function Countdown({ until }: { until: string }) {
  const target = new Date(until).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const left = target - Date.now();
    const step = left < HOUR ? 1000 : 30_000;
    const id = setInterval(() => setNow(Date.now()), step);
    return () => clearInterval(id);
  }, [target, now < target && target - now < HOUR]);

  if (!Number.isFinite(target)) return null;

  const left = target - now;
  const free = left <= 0;
  const urgent = !free && left < DAY;
  const soon = !free && !urgent && left < 2 * DAY;

  const tone = free || urgent ? "bg-down text-black" : soon ? "bg-warn text-black" : "bg-panel-2 text-ink";

  return (
    <span
      suppressHydrationWarning
      className={`tnum inline-flex items-center gap-1 rounded-sm px-1.5 py-[3px] text-[0.72rem] leading-none font-semibold ${tone}`}
      title={
        free
          ? "Cualquiera puede pagar la cláusula"
          : `Blindado hasta ${new Date(until).toLocaleString("es-ES")}`
      }
    >
      <LockIcon open={free} />
      {free ? "abierta" : format(left)}
    </span>
  );
}

function LockIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 10 12" className="h-2.5 w-2.5 shrink-0" aria-hidden>
      <path
        d={open ? "M2.4 5V3.4a2.6 2.6 0 0 1 5.2 0" : "M2.4 5V3.4a2.6 2.6 0 0 1 5.2 0V5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect x="0.6" y="5" width="8.8" height="6.4" rx="1.2" fill="currentColor" />
    </svg>
  );
}
