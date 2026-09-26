import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { ProveedorNav } from "./nav";
import { ProveedorToast } from "./ui/piezas";
import "./estilos.css";

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ProveedorNav>
      <ProveedorToast>
        <App />
      </ProveedorToast>
    </ProveedorNav>
  </StrictMode>,
);
