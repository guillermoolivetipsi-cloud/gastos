import { beforeEach, expect, it, vi } from "vitest";
import type { Movimiento, Proyeccion } from "../tipos";
import { promedio, proyectadoPorCategoria, serie, usdDeProyeccion } from "./proyecciones";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 8, 29, 12)); });

let n = 0;
const mov = (x: Partial<Movimiento>): Movimiento => ({ id: `m${n++}`, tipo: "gasto", fecha: "2026-08-02", monto: 100, moneda: "USD", usd: 100, cuentaId: "rev", categoriaId: "super", etiquetas: [], creado: "", modificado: "", ...x });
const proy = (x: Partial<Proyeccion>): Proyeccion => ({ id: `p${n++}`, nombre: "x", tipo: "gasto", clase: "seguro", monto: 100, moneda: "USD", periodo: "2026-10", categoriaId: "ropa", activa: true, creado: "", ...x });
const tasa = (m: string) => (m === "EUR" ? 0.8 : m === "ARS" ? 1500 : 1);

it("un rango: el medio y de cuánto a cuánto", () => {
  expect(usdDeProyeccion(proy({ monto: 150, montoMax: 250 }), tasa)).toEqual({ min: 150, max: 250, medio: 200 });
  expect(usdDeProyeccion(proy({ monto: 80, moneda: "EUR" }), tasa)).toEqual({ min: 100, max: 100, medio: 100 });
});

it("el promedio: los 3 meses completos anteriores con datos", () => {
  expect(promedio([mov({ usd: 300 }), mov({ fecha: "2026-07-10", usd: 100 }), mov({ fecha: "2026-09-10", usd: 999 })], "gasto")).toBe(200);
});

it("normal = promedio (este mes, lo real si ya lo pasó) + solo lo prendido del tipo", () => {
  const movs = [mov({ usd: 1000 }), mov({ fecha: "2026-09-05", usd: 1200 }), mov({ tipo: "ingreso", usd: 3000 })];
  const ps = [proy({ monto: 150, montoMax: 250, clase: "opcional" }), proy({ monto: 500, activa: false }), proy({ tipo: "ingreso", monto: 1000, periodo: "2026-11" })];
  const g = serie("gasto", ["2026-09", "2026-10", "2026-11"], movs, ps, tasa);
  expect(g.map(p => [p.normal, p.min, p.medio, p.max])).toEqual([[1200, 1200, 1200, 1200], [1000, 1150, 1200, 1250], [1000, 1000, 1000, 1000]]);
  const q = serie("queda", ["2026-10", "2026-11"], movs, ps, tasa);
  expect(q.map(p => [p.normal, p.min, p.medio, p.max])).toEqual([[2000, 1750, 1800, 1850], [2000, 3000, 3000, 3000]]);
});

it("por categoría: seguro y opcional por separado, solo lo prendido", () => {
  const ps = [proy({ monto: 300 }), proy({ clase: "opcional", monto: 200 }), proy({ clase: "opcional", monto: 999, activa: false })];
  expect(proyectadoPorCategoria("2026-10", "gasto", ps, tasa).get("ropa")).toEqual({ seguro: 300, opcional: 200 });
});
