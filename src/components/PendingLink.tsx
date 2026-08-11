"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

/**
 * Enlace que avisa de que está cargando.
 *
 * Las pestañas y los filtros van por URL, y como cada página se calcula en el
 * servidor (con scraping de por medio) pasa medio segundo largo entre el clic
 * y el cambio. Sin señal parecía que no se había pulsado. `useLinkStatus` da
 * el estado de la navegación en curso desde dentro del propio enlace.
 */
function Spinner() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      className="border-current/30 ml-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-t-current align-[-1px]"
    />
  );
}

/** Marca el enlace mientras se navega a él. */
function Dim({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return <span className={pending ? "opacity-60" : undefined}>{children}</span>;
}

export function PendingLink({
  children,
  spinner = true,
  ...props
}: ComponentProps<typeof Link> & { spinner?: boolean }) {
  return (
    <Link {...props}>
      <Dim>{children}</Dim>
      {spinner && <Spinner />}
    </Link>
  );
}
