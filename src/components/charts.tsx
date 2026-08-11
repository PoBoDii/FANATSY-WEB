"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { money, num, shortDate } from "@/lib/format";

/** Mide el ancho real del contenedor para dibujar el SVG a tamaño de píxel
 *  (así el grosor de línea y el texto no se deforman al escalar). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  return [ref, width] as const;
}

function Tooltip({
  x,
  y,
  width,
  children,
}: {
  x: number;
  y: number;
  width: number;
  children: React.ReactNode;
}) {
  const flip = x > width - 130;
  return (
    <div
      className="border-line bg-void pointer-events-none absolute z-20 border px-2.5 py-1.5 whitespace-nowrap shadow-lg"
      style={{
        left: flip ? undefined : x + 12,
        right: flip ? width - x + 12 : undefined,
        top: Math.max(4, y - 44),
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------- evolución del valor de mercado */

export function ValueChart({ series }: { series: { date: string; value: number }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const H = 220;
  const PAD = { top: 22, right: 16, bottom: 26, left: 58 };

  const geom = useMemo(() => {
    if (width === 0 || series.length < 2) return null;

    const values = series.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    // Un poco de aire arriba y abajo; nunca eje desde cero en valores de mercado
    // (aplastaría toda la variación real).
    const pad = (max - min) * 0.15 || max * 0.05 || 1;
    const lo = min - pad;
    const hi = max + pad;

    const plotW = width - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const x = (i: number) => PAD.left + (i / (series.length - 1)) * plotW;
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;

    const line = series.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.value)}`).join(" ");
    const area = `${line} L${x(series.length - 1)},${PAD.top + plotH} L${x(0)},${PAD.top + plotH} Z`;

    const ticks = [hi, (hi + lo) / 2, lo];
    const minIdx = values.indexOf(min);
    const maxIdx = values.indexOf(max);

    return { x, y, line, area, ticks, plotH, minIdx, maxIdx, lo, hi };
  }, [width, series]);

  if (series.length < 2) {
    return (
      <p className="text-faint px-5 py-8 text-sm lg:px-6">
        Aún no hay histórico de valor para este jugador.
      </p>
    );
  }

  const active = hover !== null ? series[hover] : null;
  const first = series[0].value;
  const last = series[series.length - 1].value;
  const change = last - first;

  return (
    <div>
      <div className="flex items-baseline justify-between px-5 pt-5 lg:px-6">
        <h3 className="display text-base">Valor de mercado</h3>
        <span className={`tnum text-xs ${change >= 0 ? "text-up" : "text-down"}`}>
          {change >= 0 ? "+" : "−"}
          {money(Math.abs(change))} en el histórico
        </span>
      </div>

      <div ref={ref} className="relative px-2">
        {width > 0 && geom && (
          <svg
            width={width}
            height={H}
            className="block"
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const rel = e.clientX - rect.left - PAD.left;
              const step = (width - PAD.left - PAD.right) / (series.length - 1);
              const i = Math.round(rel / step);
              setHover(Math.max(0, Math.min(series.length - 1, i)));
            }}
          >
            <defs>
              <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ccff00" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#ccff00" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Rejilla recesiva */}
            {geom.ticks.map((t, i) => (
              <g key={i}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={geom.y(t)}
                  y2={geom.y(t)}
                  stroke="#26272c"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={geom.y(t) + 3.5}
                  textAnchor="end"
                  fill="#5a5a55"
                  fontSize={10}
                  fontFamily="var(--font-dm-mono)"
                >
                  {money(t)}
                </text>
              </g>
            ))}

            <path d={geom.area} fill="url(#valueFill)" />
            <path
              d={geom.line}
              fill="none"
              stroke="#ccff00"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Etiquetas selectivas: máximo y mínimo, nada más */}
            {[geom.maxIdx, geom.minIdx].map((idx, k) =>
              idx === hover ? null : (
                <circle
                  key={k}
                  cx={geom.x(idx)}
                  cy={geom.y(series[idx].value)}
                  r={3}
                  fill="#ccff00"
                  stroke="#0a0b0c"
                  strokeWidth={2}
                />
              ),
            )}

            {/* Fechas: primera y última */}
            <text
              x={PAD.left}
              y={H - 8}
              fill="#5a5a55"
              fontSize={10}
              fontFamily="var(--font-dm-mono)"
            >
              {shortDate(series[0].date)}
            </text>
            <text
              x={width - PAD.right}
              y={H - 8}
              textAnchor="end"
              fill="#5a5a55"
              fontSize={10}
              fontFamily="var(--font-dm-mono)"
            >
              {shortDate(series[series.length - 1].date)}
            </text>

            {/* Cruceta */}
            {hover !== null && (
              <g>
                <line
                  x1={geom.x(hover)}
                  x2={geom.x(hover)}
                  y1={PAD.top}
                  y2={PAD.top + geom.plotH}
                  stroke="#8a8981"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <circle
                  cx={geom.x(hover)}
                  cy={geom.y(series[hover].value)}
                  r={4.5}
                  fill="#ccff00"
                  stroke="#0a0b0c"
                  strokeWidth={2}
                />
              </g>
            )}
          </svg>
        )}

        {active && geom && (
          <Tooltip x={geom.x(hover!)} y={geom.y(active.value)} width={width}>
            <div className="tnum text-acid text-sm">{money(active.value)}</div>
            <div className="text-faint text-[0.65rem]">{shortDate(active.date)}</div>
          </Tooltip>
        )}
      </div>

      <DataTable
        summary={`Ver los ${series.length} valores en tabla`}
        head={["Fecha", "Valor"]}
        rows={series.map((d) => [shortDate(d.date), money(d.value)])}
      />
    </div>
  );
}

/* ---------------------------------------------------- puntos por jornada */

export function PointsChart({ series }: { series: { week: number; points: number }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const H = 180;
  const PAD = { top: 22, right: 12, bottom: 24, left: 34 };

  if (series.length === 0) {
    return (
      <p className="text-faint px-5 py-8 text-sm lg:px-6">
        Todavía no ha puntuado en ninguna jornada.
      </p>
    );
  }

  const max = Math.max(...series.map((d) => d.points), 1);
  const min = Math.min(...series.map((d) => d.points), 0);
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;
  const zeroY = PAD.top + (max / (max - min)) * plotH;
  const slot = plotW / series.length;
  const barW = Math.max(3, slot - 2); // 2px de hueco entre barras

  const total = series.reduce((s, d) => s + d.points, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between px-5 pt-5 lg:px-6">
        <h3 className="display text-base">Puntos por jornada</h3>
        <span className="tnum text-muted text-xs">
          {num(total)} pts en {series.length} jornadas
        </span>
      </div>

      <div ref={ref} className="relative px-2">
        {width > 0 && (
          <svg width={width} height={H} className="block">
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={zeroY}
              y2={zeroY}
              stroke="#26272c"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={PAD.top + 4}
              textAnchor="end"
              fill="#5a5a55"
              fontSize={10}
              fontFamily="var(--font-dm-mono)"
            >
              {max}
            </text>

            {series.map((d, i) => {
              const h = (Math.abs(d.points) / (max - min)) * plotH;
              const x = PAD.left + i * slot + (slot - barW) / 2;
              const y = d.points >= 0 ? zeroY - h : zeroY;
              const isHover = hover === i;
              return (
                <g key={d.week}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(1, h)}
                    rx={Math.min(4, barW / 2)}
                    fill={d.points < 0 ? "#ff5c4d" : "#5be49b"}
                    opacity={hover === null || isHover ? 1 : 0.45}
                  />
                  {/* Zona de hover más ancha que la barra */}
                  <rect
                    x={PAD.left + i * slot}
                    y={PAD.top}
                    width={slot}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  />
                </g>
              );
            })}

            <text
              x={PAD.left}
              y={H - 6}
              fill="#5a5a55"
              fontSize={10}
              fontFamily="var(--font-dm-mono)"
            >
              J{series[0].week}
            </text>
            <text
              x={width - PAD.right}
              y={H - 6}
              textAnchor="end"
              fill="#5a5a55"
              fontSize={10}
              fontFamily="var(--font-dm-mono)"
            >
              J{series[series.length - 1].week}
            </text>
          </svg>
        )}

        {hover !== null && (
          <Tooltip x={PAD.left + hover * slot + slot / 2} y={PAD.top + 24} width={width}>
            <div className="tnum text-sm">{num(series[hover].points)} pts</div>
            <div className="text-faint text-[0.65rem]">Jornada {series[hover].week}</div>
          </Tooltip>
        )}
      </div>

      <DataTable
        summary={`Ver las ${series.length} jornadas en tabla`}
        head={["Jornada", "Puntos"]}
        rows={series.map((d) => [`J${d.week}`, num(d.points)])}
      />
    </div>
  );
}

/* --------------------------------------------------------- tabla accesible */

function DataTable({
  summary,
  head,
  rows,
}: {
  summary: string;
  head: [string, string];
  rows: [string, string][];
}) {
  return (
    <details className="border-line border-t">
      <summary className="label hover:text-ink cursor-pointer px-5 py-2.5 transition-colors lg:px-6">
        {summary}
      </summary>
      <div className="max-h-64 overflow-y-auto px-5 pb-4 lg:px-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-line border-b">
              <th className="label py-1.5 text-left">{head[0]}</th>
              <th className="label py-1.5 text-right">{head[1]}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-line/50 border-b">
                <td className="tnum text-muted py-1.5">{r[0]}</td>
                <td className="tnum py-1.5 text-right">{r[1]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
