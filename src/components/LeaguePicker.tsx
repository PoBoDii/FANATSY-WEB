"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { LeagueRef } from "@/lib/session";

/**
 * Guarda la liga elegida en una cookie y refresca los Server Components.
 * Si sólo hay una liga (lo normal) se muestra como etiqueta estática.
 */
export function LeaguePicker({
  leagues,
  activeId,
}: {
  leagues: LeagueRef[];
  activeId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (leagues.length === 0) {
    return (
      <div className="border-line border-t pt-4">
        <div className="label">Liga</div>
        <div className="text-faint mt-1 text-sm">Sin ligas</div>
      </div>
    );
  }

  const active = leagues.find((l) => l.id === activeId) ?? leagues[0];

  if (leagues.length === 1) {
    return (
      <div className="border-line border-t pt-4">
        <div className="label">Liga</div>
        <div className="text-ink mt-1 text-sm leading-tight">{active.name}</div>
        {active.managers > 0 && (
          <div className="tnum text-faint mt-1 text-xs">{active.managers} managers</div>
        )}
      </div>
    );
  }

  return (
    <div className="border-line border-t pt-4">
      <label className="label" htmlFor="league">
        Liga
      </label>
      <select
        id="league"
        value={active.id}
        disabled={pending}
        onChange={(e) => {
          document.cookie = `league=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
          start(() => router.refresh());
        }}
        className="border-line bg-panel text-ink focus:border-acid mt-1.5 w-full border px-2 py-1.5 text-sm outline-none"
      >
        {leagues.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}
