import { beforeEach, expect, it, vi } from "vitest";
import type { Movimiento, Proyeccion, Recurrente } from "../tipos";
import { mesProyectado, proyectadoPorCategoria, promedioGasto, usdDeProyeccion } from "./proyecciones";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 8, 29, 12)); });

let n = 0;
const mov = (x: Partial<Movimiento>): Movimiento => ({ id: `m${n++}`, tipo: "gasto", fecha: "2026-10-02", monto: 100, moneda: "USD", usd: 100, cuentaId: "rev", categoriaId: "super", etiquetas: [], creado: "", modificado: "", ...x });
const proy = (x: Partial<Proyeccion>): Proyeccion => ({ id: `p${n++}`, nombre: "x", clase: "seguro", monto: 100, moneda: "USD", periodo: "2026-10", categoriaId: "ropa", activa: false, creado: "", ...x });
const tasa = (m: string) => (m === "EUR" ? 0.8 : m === "ARS" ? 1500 : 1);

it("un rango suma el medio y muestra de cuánto a cuánto", () => {
  expect(usdDeProyeccion(proy({ monto: 150, montoMax: 250 }), tasa)).toEqual({ min: 150, max: 250, medio: 200 });
  expect(usdDeProyeccion(proy({ monto: 80, moneda: "EUR" }), tasa)).toEqual({ min: 100, max: 100, medio: 100 });
});

it("el mes: lo gastado, los recurrentes que faltan, los seguros y solo los caprichos prendidos", () => {
  const luz: Recurrente = { id: "luz", nombre: "Luz", tipo: "gasto", categoriaId: "casa", cuentaId: "rev", monto: 30, moneda: "USD", clase: "fijo", frecuencia: "mensual", dia: 9, inicio: "2026-09-01", modo: "avisar", activo: true };
  const ps = [proy({ monto: 300 }), proy({ clase: "capricho", monto: 150, montoMax: 250, activa: true }), proy({ clase: "capricho", monto: 500 }), proy({ periodo: "2026-11", monto: 999 })];
  const m = mesProyectado("2026-10", [mov({})], [luz], ps, () => 1, tasa);
  expect(m).toEqual({ periodo: "2026-10", base: 130, seguros: 300, caprichos: 200, caprichosTodos: 700, total: 630, min: 580, max: 680 });
  expect(proyectadoPorCategoria("2026-10", ps, tasa).get("ropa")).toBe(500);
});

it("el promedio: los 3 meses completos anteriores con datos", () => {
  expect(promedioGasto([mov({ fecha: "2026-08-10", usd: 300 }), mov({ fecha: "2026-07-10", usd: 100 }), mov({ fecha: "2026-09-10", usd: 999 })])).toBe(200);
});
