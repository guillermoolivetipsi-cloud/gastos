import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// `base` relativo: la app funciona igual servida en la raíz o en una subcarpeta
// (por ejemplo usuario.github.io/gastos/).
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      manifest: {
        name: "Gastos",
        short_name: "Gastos",
        description: "Anotar gastos e ingresos y ver cómo venís en el mes",
        lang: "es",
        start_url: ".",
        scope: ".",
        display: "standalone",
        orientation: "portrait",
        background_color: "#07070B",
        theme_color: "#07070B",
        icons: [
          { src: "icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
});
