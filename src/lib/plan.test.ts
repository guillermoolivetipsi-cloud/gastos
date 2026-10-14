import { expect, it } from "vitest";
import type { Categoria, Movimiento, Recurrente } from "../tipos";
import { planDelMes } from "./plan";
import { claseDe } from "./analisis";

const cat = (id: string, nombre: string, tipo: "gasto" | "ingreso", clase?: "fijo" | "variable") => ({ id, nombre, tipo, icono: "", color: "", orden: 0, clase }) as Categoria;
const cats = [cat("casa", "Casa", "gasto", "fijo"), cat("ocio", "Ocio", "gasto", "variable"), cat("culpa", "Sin culpa", "gasto", "variable"), cat("deuda", "Deuda", "gasto", "fijo"), cat("psico", "Psicología", "ingreso"), cat("alq", "Alquiler", "ingreso")];
let n = 0;
const mov = (tipo: "gasto" | "ingreso", categoriaId: string, usd: number, x: Partial<Movimiento> = {}) => ({ id: `m${n++}`, tipo, fecha: "2026-10-05", monto: usd, moneda: "USD", usd, cuentaId: "c", categoriaId, etiquetas: [], creado: "", modificado: "", ...x }) as Movimiento;

it("reparte los gastos de Vivir en fijos, variables, libre de culpa y eventuales", () => {
  const movs = [
    mov("ingreso", "alq", 1000), mov("ingreso", "psico", 2000, { origen: "finanzas" }),
    mov("gasto", "casa", 900), mov("gasto", "ocio", 300), mov("gasto", "culpa", 50), mov("gasto", "ocio", 80, { eventual: true }),
    mov("gasto", "deuda", 120), mov("gasto", "ocio", 999, { fecha: "2026-09-30" }),
  ];
  const p = planDelMes("2026-10", movs, cats, [], undefined, claseDe);
  expect(p.entro).toBe(3000);
  expect(p.vivir).toEqual({ real: 1330, fijos: 900, variables: 300, sinCulpa: 50, eventuales: 80 });
  // Sin lo de Finanzas: liquidez e inversión no se saben; la deuda sale de la categoría Deuda.
  expect([p.liquidez, p.inversion, p.deuda, p.repartido]).toEqual([null, null, 120, null]);
});

it("con lo de Finanzas: liquidez, inversión y deuda de allá, y cuánto se repartió", () => {
  const movs = [mov("ingreso", "alq", 1000), mov("gasto", "ocio", 400), mov("gasto", "deuda", 30)];
  const p = planDelMes("2026-10", movs, cats, [], { liquidez: 150, inversion: 400, deuda: 50 }, claseDe);
  expect([p.liquidez, p.inversion, p.deuda]).toEqual([150, 400, 50]);
  expect(p.repartido).toBeCloseTo(1);
});

it("el pago de un recurrente toma la clase del recurrente", () => {
  const rec = { id: "luz", clase: "variable" } as Recurrente;
  const p = planDelMes("2026-10", [mov("gasto", "casa", 70, { recurrenteId: "luz" })], cats, [rec], undefined, claseDe);
  expect([p.vivir.fijos, p.vivir.variables]).toEqual([0, 70]);
});
