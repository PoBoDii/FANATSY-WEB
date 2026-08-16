import type { Metadata } from "next";
import { Archivo, Instrument_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ClubStrip } from "@/components/ClubStrip";
import { getSession } from "@/lib/session";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PoBoDi Fantasy",
  description: "Panel personal de LaLiga Fantasy",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();

  return (
    <html
      lang="es"
      data-theme="dark"
      className={`${archivo.variable} ${instrument.variable} ${dmMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Antes de pintar nada: si alguna vez se eligió el claro, se aplica ya.
            Si no, se queda el oscuro que trae el HTML y no hay fogonazo. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('tema');if(t==='light')document.documentElement.dataset.theme='light'}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-screen">
        <div className="lg:grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[248px_1fr]">
          <Nav leagues={session.leagues} activeId={session.active?.id ?? null} />
          <main className="min-h-screen">{children}</main>
        </div>
      </body>
    </html>
  );
}
