import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base` relativo: la misma compilación sirve dentro de la app de Android (Capacitor)
// y en el navegador, para probar con `npm run dev`.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
