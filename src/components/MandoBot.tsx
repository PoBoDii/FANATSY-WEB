"use client";

import { useState } from "react";
import type { EstadoBot } from "@/lib/bot-estado";

/**
 * El interruptor del chat negociador.
 *
 * Un botón grande para cerrarlo entero y un vetado por manager, porque casi
 * siempre el problema es una persona concreta dándole a la tecla y no hace
 * falta dejar a los otros ocho sin poder negociar.
 *
 * El cambio es inmediato: quien tenga el chat abierto se queda sin poder
 * escribir en el siguiente mensaje que mande.
 */
export function MandoBot({ inicial, managers }: { inicial: EstadoBot; managers: string[] }) {
  const [estado, setEstado] = useState(inicial);
  const [guardando, setGuardando] = useState(false);

  async function cambiar(cambio: Partial<EstadoBot>) {
    setGuardando(true);
    // Se pinta el cambio antes de que conteste el servidor: si falla, se
    // recupera con el estado que devuelve la respuesta.
    setEstado((e) => ({ ...e, ...cambio }));

    const res = await fetch("/api/bot-estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambio),
    }).catch(() => null);

    const data = (await res?.json().catch(() => null)) as { estado?: EstadoBot } | null;
    if (data?.estado) setEstado(data.estado);
    setGuardando(false);
  }

  const alternar = (nombre: string) =>
    cambiar({
      vetados: estado.vetados.includes(nombre)
        ? estado.vetados.filter((v) => v !== nombre)
        : [...estado.vetados, nombre],
    });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3 sm:p-5">
      <div
        className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 ${
          estado.abierto ? "border-line bg-panel" : "border-down/40 bg-down/5"
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {estado.abierto ? "🟢 El chat está abierto" : "🔴 El chat está cerrado"}
          </p>
          <p className="text-faint mt-0.5 text-[0.8rem]">
            {estado.abierto
              ? "Cualquiera con su enlace puede negociar."
              : "Nadie puede escribir, aunque lo tenga abierto."}
          </p>
        </div>

        <button
          type="button"
          onClick={() => cambiar({ abierto: !estado.abierto })}
          disabled={guardando}
          className={`shrink-0 cursor-pointer rounded-xl px-4 py-2.5 font-semibold text-white ${
            estado.abierto ? "bg-down" : "bg-up"
          }`}
        >
          {estado.abierto ? "Chapar el chat" : "Volver a abrir"}
        </button>
      </div>

      <div className="bg-panel border-line rounded-2xl border p-4">
        <p className="font-semibold">Cerrarlo a alguien en concreto</p>
        <p className="text-faint mt-0.5 mb-3 text-[0.8rem]">
          Toca un nombre para dejarle fuera. Los demás siguen negociando.
        </p>

        <div className="flex flex-wrap gap-2">
          {managers.map((nombre) => {
            const vetado = estado.vetados.includes(nombre);
            return (
              <button
                key={nombre}
                type="button"
                onClick={() => alternar(nombre)}
                disabled={guardando}
                className={`cursor-pointer rounded-xl border px-3 py-1.5 text-[0.85rem] font-semibold transition-colors ${
                  vetado
                    ? "border-down/50 bg-down/15 text-down"
                    : "border-line text-muted hover:text-ink"
                }`}
              >
                {vetado ? "🔒 " : ""}
                {nombre}
              </button>
            );
          })}
        </div>
      </div>

      <label className="bg-panel border-line rounded-2xl border p-4">
        <span className="block font-semibold">Qué les digo al cerrarles</span>
        <span className="text-faint mt-0.5 mb-2 block text-[0.8rem]">
          Se lo lee tal cual quien intente escribir. En blanco sale un mensaje normal.
        </span>
        <input
          value={estado.motivo ?? ""}
          onChange={(e) => setEstado((s) => ({ ...s, motivo: e.target.value }))}
          onBlur={() => cambiar({ motivo: estado.motivo })}
          placeholder="Hoy no se negocia, que estoy comiendo."
          className="border-line bg-panel-2 focus:border-acid w-full rounded-xl border px-3 py-2 text-[0.9rem] outline-none"
        />
      </label>
    </div>
  );
}
