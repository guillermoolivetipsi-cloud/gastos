import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ProveedorNav } from "./nav";
import { ProveedorDatos } from "./datos";
import { ProveedorToast } from "./ui/piezas";
import "./estilos.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ProveedorNav>
      <ProveedorToast>
        <ProveedorDatos>
          <App />
        </ProveedorDatos>
      </ProveedorToast>
    </ProveedorNav>
  </StrictMode>,
);
