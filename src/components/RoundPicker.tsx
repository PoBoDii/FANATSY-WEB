"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Desplegable de jornada. Navega al cambiar, sin botón de por medio. */
export function RoundPicker({ rounds, current }: { rounds: number[]; current: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <label className="flex items-center gap-2">
      <span className="label">Jornada</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => start(() => router.push(`/alineaciones?j=${e.target.value}`))}
        className="border-line bg-panel text-ink focus:border-acid rounded-lg border px-3 py-1.5 text-sm font-semibold outline-none"
      >
        {rounds.map((round) => (
          <option key={round} value={round}>
            J{round}
          </option>
        ))}
      </select>
    </label>
  );
}
