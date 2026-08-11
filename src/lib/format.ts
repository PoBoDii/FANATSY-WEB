const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/** 12.400.000 € → "12,4 M€". Los valores de Fantasy son siempre grandes. */
export function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2).replace(".", ",")} M€`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)} k€`;
  return EUR.format(value);
}

export function moneyExact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return EUR.format(value);
}

export function signed(value: number | null | undefined): string {
  if (value == null || value === 0 || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : "−"}${money(Math.abs(value)).replace("−", "")}`;
}

export function num(value: number | null | undefined, decimals = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** "Quedan 3h 12m" a partir de una fecha ISO. */
export function timeLeft(iso: string | null): string | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (!Number.isFinite(end)) return null;
  const ms = end - Date.now();
  if (ms <= 0) return "Cerrado";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`;
  return h > 0 ? `${h} h ${m} m` : `${m} m`;
}

/** "11 ago 13:47" — día y hora exactos, para fechas que importan. */
export function dateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const day = d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "");
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

export function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}
