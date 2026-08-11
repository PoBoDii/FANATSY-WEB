/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Escudos y fotos de jugadores vienen de los CDN de LaLiga.
    remotePatterns: [
      { protocol: "https", hostname: "**.llt-services.com" },
      { protocol: "https", hostname: "**.laliga.com" },
      { protocol: "https", hostname: "**.laliga.es" },
      { protocol: "https", hostname: "**.lfp.es" },
    ],
  },
};

export default nextConfig;
