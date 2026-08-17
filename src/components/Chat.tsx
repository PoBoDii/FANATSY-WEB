"use client";

import { useEffect, useRef, useState } from "react";
import type { Trato } from "@/lib/negociacion";

/**
 * El chat del bot negociador.
 *
 * Una página suelta, sin menú ni acceso al resto de la web: el enlace se pega
 * en el grupo de la liga y quien entra sólo puede hacer una cosa, preguntar por
 * un jugador y regatear.
 *
 * Se pide el nombre antes de empezar porque el aviso que le llega al dueño
 * tiene que decir con quién ha cerrado el trato.
 */

type Linea = { de: "bot" | "yo"; texto: string };

const BIENVENIDA =
  "Buenas. Soy quien lleva los fichajes de este equipo. Dime a quién quieres y " +
  "cuánto sueltas. Te aviso ya: de regalar, nada.";

export function Chat({ managers, fijo }: { managers: string[]; fijo?: string }) {
  // Con enlace personal no hay nada que elegir: se entra directo.
  const [quien, setQuien] = useState(fijo ?? "");
  const [entrado, setEntrado] = useState(Boolean(fijo));
  const [lineas, setLineas] = useState<Linea[]>(
    fijo ? [{ de: "bot", texto: `Hombre, ${fijo}. ${BIENVENIDA}` }] : [],
  );
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [trato, setTrato] = useState<Trato | null>(null);

  const finRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lineas, pensando]);

  const entrar = () => {
    if (quien.trim().length < 1) return;
    setEntrado(true);
    setLineas([{ de: "bot", texto: BIENVENIDA }]);
  };

  const enviar = async () => {
    const mensaje = texto.trim();
    if (!mensaje || pensando) return;

    setLineas((l) => [...l, { de: "yo", texto: mensaje }]);
    setTexto("");
    setPensando(true);

    try {
      const res = await fetch("/api/negociar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje, quien, trato }),
      });
      const data = (await res.json()) as { texto?: string; trato?: Trato; error?: string };

      setLineas((l) => [
        ...l,
        { de: "bot", texto: data.texto ?? data.error ?? "Ahora mismo no puedo responder." },
      ]);
      if (data.trato) setTrato(data.trato);
    } catch {
      setLineas((l) => [...l, { de: "bot", texto: "Se ha cortado la conexión. Repítemelo." }]);
    } finally {
      setPensando(false);
    }
  };

  if (!entrado) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
        <h1 className="display text-[2rem] leading-tight">Negociar fichajes</h1>
        <p className="text-muted mt-2 text-[0.9rem]">
          Aquí se negocia. Dile a quién quieres y cuánto pagas; si llegáis a un número, avisa a su
          dueño y ya cerráis la operación en el juego.
        </p>

        <label className="label mt-6 block" htmlFor="quien">
          ¿Quién eres?
        </label>
        {/* Un desplegable con los managers de la liga: escribiéndolo a mano
            llegaban tratos firmados por "asdf". */}
        <select
          id="quien"
          value={quien}
          onChange={(e) => setQuien(e.target.value)}
          className="border-line bg-panel mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-[1rem] outline-none focus:border-acid"
        >
          <option value="">Elige tu equipo…</option>
          {managers.map((nombre) => (
            <option key={nombre} value={nombre}>
              {nombre}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={entrar}
          disabled={quien.trim().length < 1}
          className="bg-acid mt-3 cursor-pointer rounded-xl px-4 py-2.5 font-semibold text-white disabled:opacity-40"
        >
          Empezar
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-3xl flex-col px-3 sm:px-6">
      <header className="border-line flex items-center gap-3 border-b py-3.5">
        <span className="bg-acid flex h-10 w-10 items-center justify-center rounded-full text-[1.1rem]">
          🤝
        </span>
        <div>
          <div className="text-[1.05rem] font-semibold">PoBoFantasy</div>
          <div className="text-faint text-[0.72rem]">
            {trato?.playerName ? `Hablando de ${trato.playerName}` : "Dime qué jugador te interesa"}
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-2.5 overflow-y-auto py-4">
        {lineas.map((linea, i) => (
          <div key={i} className={`flex ${linea.de === "yo" ? "justify-end" : "justify-start"}`}>
            <p
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[0.95rem] leading-snug sm:text-[1rem] ${
                linea.de === "yo" ? "bg-acid text-white" : "bg-panel-2 text-ink"
              }`}
            >
              {/* El bot marca las cifras con ** para que destaquen. */}
              {linea.texto.split(/\*\*(.+?)\*\*/g).map((parte, j) =>
                j % 2 === 1 ? (
                  <strong key={j}>{parte}</strong>
                ) : (
                  <span key={j}>{parte}</span>
                ),
              )}
            </p>
          </div>
        ))}

        {pensando && (
          <div className="flex justify-start">
            <p className="bg-panel-2 text-faint rounded-2xl px-3.5 py-2 text-[0.92rem]">
              escribiendo…
            </p>
          </div>
        )}

        <div ref={finRef} />
      </div>

      <div className="border-line flex gap-2 border-t py-3">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          placeholder="Me interesa X, te doy 50"
          className="border-line bg-panel min-w-0 flex-1 rounded-xl border px-3.5 py-2.5 outline-none focus:border-acid"
        />
        <button
          type="button"
          onClick={enviar}
          disabled={pensando || !texto.trim()}
          className="bg-acid shrink-0 cursor-pointer rounded-xl px-4 py-2.5 font-semibold text-white disabled:opacity-40"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
