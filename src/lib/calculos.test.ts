import { beforeEach, expect, it, vi } from "vitest";
import type { Categoria, Cuenta, Movimiento, Recurrente } from "../tipos";
import { aPagarTarjeta, bloques, cambiosDePrecio, recurrentesDelMes } from "./analisis";
import { calcularInsights } from "./insights";
import { mensualEnUsd, montoHabitual } from "./recurrentes";

/* Una prueba por cada error de cálculo que encontró la revisión de octubre de 2026. */

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 8, 12)); });

let n = 0;
const mov = (x: Partial<Movimiento>): Movimiento => ({ id: `m${n++}`, tipo: "gasto", fecha: "2026-10-03", monto: 10, moneda: "USD", usd: 10, cuentaId: "rev", categoriaId: "super", etiquetas: [], creado: "", modificado: "", ...x });
const visa: Cuenta = { id: "visa", nombre: "Visa", moneda: "ARS", dolar: "oficial", esTarjeta: true, cierreDesde: 31, cierreHasta: 31, venceDias: 10, cierres: {}, orden: 0 };
const rev: Cuenta = { id: "rev", nombre: "Revolut", moneda: "EUR", dolar: "blue", esTarjeta: false, orden: 1 };
const cats = [
  { id: "super", nombre: "Super", tipo: "gasto", icono: "", color: "", orden: 0, clase: "variable", objetivo: 1000 },
  { id: "sus", nombre: "Suscripciones", tipo: "gasto", icono: "", color: "", orden: 1 },
  { id: "casa", nombre: "Casa", tipo: "gasto", icono: "", color: "", orden: 2, clase: "variable", objetivo: 500 },
  { id: "ocio", nombre: "Ocio", tipo: "gasto", icono: "", color: "", orden: 3, clase: "variable" },
] as Categoria[];
const rec = (x: Partial<Recurrente>): Recurrente => ({ id: "r", nombre: "Netflix", tipo: "gasto", categoriaId: "sus", cuentaId: "visa", monto: 10, moneda: "USD", clase: "fijo", frecuencia: "mensual", dia: 5, inicio: "2026-01-01", modo: "avisar", activo: true, ...x });
const uno = () => 1;

it("tarjeta: un recurrente pagado en parte no se cuenta dos veces", () => {
  const net = rec({});
  const parcial = mov({ cuentaId: "visa", categoriaId: "sus", usd: 9, monto: 9, fecha: "2026-10-05", recurrenteId: "r", periodo: "2026-10" });
  const ap = aPagarTarjeta(visa, [parcial], [net], "2026-11", uno);
  expect([ap.resumen.total, ap.previsto, ap.total]).toEqual([9, 1, 10]);
});

it("tarjeta: confirmar el cierre a mano no borra lo previsto; subir el resumen sí lo deja en el real", () => {
  const net = rec({});
  const conCierre = { ...visa, cierres: { "2026-10": 31 } };
  expect(aPagarTarjeta(conCierre, [], [net], "2026-11", uno).total).toBe(10);
  const subido = aPagarTarjeta(conCierre, [], [net], "2026-11", uno, { "visa|2026-10": "x" });
  expect([subido.real, subido.total]).toEqual([true, 0]);
});

it("cómo venís: el mes en curso se compara hasta el mismo día, con los meses que tienen datos", () => {
  const movs = [
    ...["2026-07", "2026-08", "2026-09"].flatMap(p => [mov({ fecha: `${p}-05`, usd: 150 }), mov({ fecha: `${p}-25`, usd: 450 })]),
    mov({ fecha: "2026-10-05", usd: 150 }),
  ];
  const x = calcularInsights("2026-10", movs, cats, [rev, visa], [], uno, () => null);
  expect(x.cambios.find(c => c.cat.id === "super")).toBeUndefined(); // 150 contra 150 a esta altura: no cambió
  const solo = calcularInsights("2026-10", [mov({ fecha: "2026-09-02", categoriaId: "ocio", usd: 300 })], cats, [rev], [], uno, () => null);
  expect(solo.cambios.find(c => c.cat.id === "ocio")?.promedio).toBe(300); // un solo mes con datos: no se divide por 3
});

it("cómo venís: la tarjeta contra el mes anterior a la misma altura", () => {
  const sep = [1, 2, 3, 4, 5].map(d => mov({ cuentaId: "visa", fecha: `2026-09-0${d}`, usd: 10 })).concat(mov({ cuentaId: "visa", fecha: "2026-09-20", usd: 1000 }));
  const x = calcularInsights("2026-10", [...sep, mov({ cuentaId: "visa", fecha: "2026-10-02", usd: 60 })], cats, [rev, visa], [], uno, () => null);
  expect(x.tarjeta.anterior).toBe(50); // hasta el 8 de septiembre, no los 1.050 del mes entero
});

it("suscripciones por año: una anual cuenta una vez, no × 12", () => {
  const mensual = rec({ id: "net", monto: 10 });
  const anual = rec({ id: "dom", nombre: "Dominio", monto: 120, frecuencia: "anual", mes: 10, dia: 20 });
  const x = calcularInsights("2026-10", [], cats, [rev, visa], [mensual, anual], uno, () => null);
  expect(x.suscripciones.anual).toBe(240);
});

it("cómo venís: lo comprometido usa lo que falta de un pago en partes", () => {
  const partes = rec({ id: "curso", nombre: "Curso", categoriaId: "ocio", cuentaId: "rev", monto: 900, frecuencia: "una-vez", inicio: "2026-09-10" });
  const pago = mov({ cuentaId: "rev", categoriaId: "ocio", usd: 300, monto: 300, fecha: "2026-09-10", recurrenteId: "curso", periodo: "2026-09" });
  const x = calcularInsights("2026-10", [pago], cats, [rev, visa], [partes], uno, () => null);
  expect(x.comprometido.recurrentes).toBe(600);
});

it("recurrentes: un 'Fue 0' de este mes no hace que el promedio sea 0", () => {
  const luz = rec({ id: "luz", nombre: "Luz", categoriaId: "casa", cuentaId: "rev", clase: "variable", monto: 50, enCero: ["2026-10"] });
  const pagos = ["2026-07", "2026-08", "2026-09"].map(p => mov({ recurrenteId: "luz", periodo: p, monto: 80, usd: 80, fecha: `${p}-05` }));
  expect([montoHabitual(luz, pagos, 1), mensualEnUsd(luz, pagos, 1)]).toEqual([80, 80]);
});

it("para revisar: un pago en partes de este mes no es un cambio de precio; una suba sí", () => {
  const alq = rec({ id: "alq", nombre: "Alquiler", cuentaId: "rev", monto: 1000 });
  const sep = mov({ recurrenteId: "alq", periodo: "2026-09", monto: 1000 });
  expect(cambiosDePrecio([alq], [sep, mov({ recurrenteId: "alq", periodo: "2026-10", monto: 500 })], new Set())).toEqual([]);
  expect(cambiosDePrecio([alq], [sep, mov({ recurrenteId: "alq", periodo: "2026-10", monto: 1100 })], new Set())).toHaveLength(1);
});

it("variables: descuenta lo que falta de los recurrentes variables y no mezcla categorías sin objetivo", () => {
  const luz = rec({ id: "luz", nombre: "Luz", categoriaId: "casa", cuentaId: "rev", clase: "variable", monto: 80, dia: 20 });
  const pend = recurrentesDelMes([luz], [], "2026-10", uno).filter(i => i.estado !== "cargado");
  const gastos = [mov({ categoriaId: "super", usd: 400 }), mov({ categoriaId: "ocio", usd: 300 })];
  const b = bloques("2026-10", gastos, cats, [luz], pend, uno);
  expect([b.variables.objetivo, b.variables.gastado, b.variables.queda]).toEqual([1500, 400, 1020]);
});
