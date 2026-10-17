import { expect, it } from "vitest";
import type { Categoria, Movimiento, Recurrente } from "../tipos";
import { PLAN, deDondeEntro, planDelMes, repartoValido, vivirPorCategoria } from "./plan";

const cat = (id: string, nombre: string, tipo: "gasto" | "ingreso", clase?: "fijo" | "variable") => ({ id, nombre, tipo, icono: "", color: "", orden: 0, clase }) as Categoria;
const cats = [cat("casa", "Casa", "gasto", "fijo"), cat("ocio", "Ocio", "gasto", "variable"), cat("culpa", "Sin culpa", "gasto", "variable"), cat("deuda", "Deuda", "gasto", "fijo"), cat("psico", "Psicología", "ingreso"), cat("alq", "Alquiler", "ingreso")];
let n = 0;
const mov = (tipo: "gasto" | "ingreso", categoriaId: string, usd: number, x: Partial<Movimiento> = {}) => ({ id: `m${n++}`, tipo, fecha: "2026-10-05", monto: usd, moneda: "USD", usd, cuentaId: "c", categoriaId, etiquetas: [], creado: "", modificado: "", ...x }) as Movimiento;

it("reparte los gastos de Vivir en fijos, variables, libre de culpa y eventuales", () => {
  const movs = [
    mov("ingreso", "alq", 1000), mov("ingreso", "psico", 2000, { origen: "finanzas" }),
    mov("gasto", "casa", 900, { recurrenteId: "alquiler" }), mov("gasto", "casa", 60), mov("gasto", "ocio", 300), mov("gasto", "culpa", 50), mov("gasto", "ocio", 80, { eventual: true }),
    mov("gasto", "deuda", 120), mov("gasto", "ocio", 999, { fecha: "2026-09-30" }),
  ];
  // Fijo es lo que se paga siempre igual (el recurrente del alquiler); lo suelto es variable, sea de la categoría que sea.
  const p = planDelMes("2026-10", movs, cats, [{ id: "alquiler", clase: "fijo" } as Recurrente], undefined);
  expect(p.entro).toBe(3000);
  expect(p.vivir).toEqual({ real: 1390, fijos: 900, variables: 360, sinCulpa: 50, eventuales: 80 });
  // Sin lo de Finanzas: liquidez e inversión no se saben; la deuda sale de la categoría Deuda.
  expect([p.liquidez, p.inversion, p.deuda, p.repartido]).toEqual([null, null, 120, null]);
});

it("sin cuenta de liquidez aparte, la liquidez es lo que quedó", () => {
  const movs = [mov("ingreso", "alq", 1000), mov("gasto", "ocio", 400)];
  const p = planDelMes("2026-10", movs, cats, [], { inversion: 400, deuda: 50 });
  expect([p.liquidez, p.liquidezCalculada, p.quedo]).toEqual([150, true, null]);
});

it("con lo de Finanzas: liquidez, inversión y deuda de allá, y cuánto se repartió", () => {
  const movs = [mov("ingreso", "alq", 1000), mov("gasto", "ocio", 400), mov("gasto", "deuda", 30)];
  const p = planDelMes("2026-10", movs, cats, [], { liquidez: 150, inversion: 400, deuda: 50 });
  expect([p.liquidez, p.inversion, p.deuda, p.liquidezCalculada, p.quedo]).toEqual([150, 400, 50, false, 0]);
  expect(p.repartido).toBeCloseTo(1);
});

it("el pago de un recurrente toma la clase del recurrente", () => {
  const rec = { id: "luz", clase: "variable" } as Recurrente;
  const p = planDelMes("2026-10", [mov("gasto", "casa", 70, { recurrenteId: "luz" })], cats, [rec], undefined);
  expect([p.vivir.fijos, p.vivir.variables]).toEqual([0, 70]);
});

it("el reparto vale solo si las partes suman 100, y las de Vivir también", () => {
  expect(repartoValido(PLAN)).toBe(true);
  expect(repartoValido({ ...PLAN, liquidez: 10 })).toBe(false);
  expect(repartoValido({ ...PLAN, vivirPartes: { ...PLAN.vivirPartes, fijos: 45 } })).toBe(false);
});

it("de dónde entró: la clínica, cada recurrente por su nombre y el resto junto", () => {
  const movs = [mov("ingreso", "psico", 3000, { origen: "finanzas" }), mov("ingreso", "alq", 470, { recurrenteId: "lomas" }), mov("ingreso", "alq", 100), mov("ingreso", "alq", 50), mov("ingreso", "alq", 999, { fecha: "2026-09-01" })];
  expect(deDondeEntro("2026-10", movs, [{ id: "lomas", nombre: "Alquiler Lomas" } as Recurrente])).toEqual([
    { nombre: "Clínica (Finanzas)", usd: 3000 }, { nombre: "Alquiler Lomas", usd: 470 }, { nombre: "Otros ingresos", usd: 150 },
  ]);
});

it("lo que más pesa en Vivir, sin la categoría Deuda", () => {
  const movs = [mov("gasto", "casa", 900), mov("gasto", "ocio", 300), mov("gasto", "ocio", 50), mov("gasto", "deuda", 500)];
  expect(vivirPorCategoria("2026-10", movs, cats).map(x => [x.cat?.id, x.usd])).toEqual([["casa", 900], ["ocio", 350]]);
});
