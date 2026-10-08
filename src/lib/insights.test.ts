import { expect, it } from "vitest";
import type { Categoria, Cuenta, Movimiento, Recurrente } from "../tipos";
import { calcularInsights } from "./insights";

const cats: Categoria[] = [
  { id: "ocio", nombre: "Ocio", tipo: "gasto", icono: "", color: "", orden: 0 },
  { id: "sus", nombre: "Suscripciones", tipo: "gasto", icono: "", color: "", orden: 1 },
];
const cuentas: Cuenta[] = [
  { id: "rev", nombre: "Revolut", moneda: "EUR", dolar: "blue", esTarjeta: false, orden: 0 },
  { id: "visa", nombre: "Visa", moneda: "ARS", dolar: "oficial", esTarjeta: true, cierreDesde: 31, cierreHasta: 31, venceDias: 10, cierres: {}, orden: 1 },
];
let n = 0;
const mov = (x: Partial<Movimiento>): Movimiento => ({ id: `m${n++}`, tipo: "gasto", fecha: "2026-09-10", monto: 10, moneda: "USD", usd: 10, cuentaId: "rev", categoriaId: "ocio", etiquetas: [], creado: "", modificado: "", ...x });

it("tarjeta, lo comprometido, suscripciones y cambios", () => {
  const movs = [
    ...["2026-06", "2026-07", "2026-08"].map(p => mov({ fecha: `${p}-10`, usd: 100 })),
    mov({ usd: 300 }), // ocio en septiembre: +200 contra el promedio
    mov({ cuentaId: "visa", usd: 100, categoriaId: "sus", comentario: "Nube", fecha: "2026-09-21" }),
    mov({ cuentaId: "visa", usd: 50, fecha: "2026-09-02" }),
  ];
  const x = calcularInsights("2026-09", movs, cats, cuentas, [], () => 1, () => null);
  expect([x.tarjeta.total, x.tarjeta.pct, x.tarjeta.anterior]).toEqual([150, 33, null]);
  expect(x.comprometido.tarjetas).toBe(150); // septiembre con tarjeta se paga en octubre
  expect(x.suscripciones.total).toBe(100);
  expect(x.cambios.map(c => [c.cat.nombre, c.dif])).toEqual([["Ocio", 250], ["Suscripciones", 100]]);
});

it("suscripciones: las cobradas y las que vienen este mes (previstas)", () => {
  const base: Recurrente = { id: "mus", nombre: "Música", tipo: "gasto", categoriaId: "sus", cuentaId: "visa", monto: 8, moneda: "USD", clase: "fijo", frecuencia: "mensual", dia: 19, inicio: "2026-01-01", modo: "avisar", activo: true };
  const nube: Recurrente = { ...base, id: "nube", nombre: "Nube", monto: 100, dia: 21 };
  const otra: Recurrente = { ...base, id: "gym", nombre: "Gym", categoriaId: "ocio", monto: 40 };
  const cobrada = mov({ cuentaId: "visa", categoriaId: "sus", usd: 8, monto: 8, fecha: "2026-10-03", recurrenteId: "mus", periodo: "2026-10" });
  const x = calcularInsights("2026-10", [cobrada], cats, cuentas, [base, nube, otra], () => 1, () => null);
  expect(x.suscripciones.total).toBe(108);
  expect(x.suscripciones.items.map(i => [i.nombre, i.usd, i.previsto])).toEqual([["Nube", 100, true], ["Música", 8, false]]);
});
