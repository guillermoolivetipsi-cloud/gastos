import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// `base` relativo: la app funciona igual servida en la raíz o en una subcarpeta
// (por ejemplo usuario.github.io/gastos/) y dentro de la app de Android.
// Dos compilaciones: la web (PWA, con service worker) y `--mode android` (Capacitor,
// sin service worker: los avisos son notificaciones programadas).
export default defineConfig(({ mode }) => ({
  base: "./",
  resolve: mode === "android" ? { alias: { "virtual:pwa-register": "/src/lib/sin-pwa.ts" } } : undefined,
  plugins: [
    react(),
    mode !== "android" && VitePWA({
      registerType: "autoUpdate",
      // Service worker propio (src/sw.ts): además de guardar la app para usarla sin
      // conexión, revisa los pendientes cuando Android la despierta y avisa.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,png,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
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
        // Mantener apretado el ícono: accesos directos.
        shortcuts: [
          { name: "Nuevo gasto", short_name: "Gasto", url: "./?accion=gasto", icons: [{ src: "icono-192.png", sizes: "192x192" }] },
          { name: "Subir resumen de tarjeta", short_name: "Resumen", url: "./?accion=resumen", icons: [{ src: "icono-192.png", sizes: "192x192" }] },
        ],
        icons: [
          { src: "icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
}));
