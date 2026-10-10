import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Moneda, Tipo } from "./tipos";
import type { Vista } from "./lib/fecha";

/* Navegación mínima: cuatro solapas (Gastos · Ingresos · Proyecciones · Más) y una pila de pantallas encima. Cada pantalla
   que se abre agrega una entrada al historial, así el botón "atrás" de Android
   cierra la pantalla en lugar de salir de la app. */

export type Solapa = "gastos" | "ingresos" | "proyecciones" | "mas";

export type Pantalla =
  | { p: "editor"; id?: string; tipo?: Tipo; recurrenteId?: string; periodo?: string; monto?: number; fecha?: string; cuentaId?: string; categoriaId?: string; comentario?: string; proyeccionId?: string; moneda?: Moneda }
  | { p: "categorias" }
  | { p: "categoria"; id?: string; tipo?: Tipo }
  | { p: "cuentas" }
  | { p: "cuenta"; id?: string }
  | { p: "tarjeta"; id: string; periodo?: string }
  | { p: "recurrentes" }
  | { p: "recurrente"; id?: string; desdeSugerencia?: string; tipo?: Tipo }
  | { p: "instancia"; id: string; clave: string }
  | { p: "revisar" }
  | { p: "exportar" }
  | { p: "respaldo" }
  | { p: "ajustes" }
  | { p: "subir-resumen"; cuentaId?: string }
  | { p: "etiquetas" }
  | { p: "como-venis"; periodo: string }
  | { p: "movimientos"; tipo?: Tipo; buscar?: boolean }
  | { p: "viene"; periodo?: string }
  | { p: "detalle-categoria"; id: string; desde: string; hasta: string; vista: Vista }
  | { p: "clases" }
  | { p: "proyeccion"; id?: string; periodo?: string }
  | { p: "finanzas-conectar" }
  | { p: "finanzas-mandar" }
  | { p: "finanzas-respuesta"; nombre: string };

type Nav = {
  solapa: Solapa;
  irA: (s: Solapa) => void;
  abrir: (p: Pantalla) => void;
  volver: () => void;
  pila: Pantalla[];
};

const Ctx = createContext<Nav>(null!);
export const useNav = () => useContext(Ctx);

export function ProveedorNav({ children }: { children: ReactNode }) {
  const [solapa, setSolapa] = useState<Solapa>("gastos");
  const [pila, setPila] = useState<Pantalla[]>([]);

  useEffect(() => {
    const alVolver = () => setPila(p => p.slice(0, -1));
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, []);

  const abrir = (p: Pantalla) => {
    history.pushState({ n: pila.length + 1 }, "");
    setPila(x => [...x, p]);
    window.scrollTo(0, 0);
  };
  const volver = () => history.back();
  const irA = (s: Solapa) => { setSolapa(s); window.scrollTo(0, 0); };

  return <Ctx.Provider value={{ solapa, irA, abrir, volver, pila }}>{children}</Ctx.Provider>;
}
