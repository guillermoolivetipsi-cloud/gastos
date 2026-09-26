import { expect, it } from "vitest";
import type { Categoria, Cuenta, Movimiento } from "../tipos";
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
    mov({ cuentaId: "visa", usd: 100, categoriaId: "sus", comentario: "Claude", fecha: "2026-09-21" }),
    mov({ cuentaId: "visa", usd: 50, fecha: "2026-09-02" }),
  ];
  const x = calcularInsights("2026-09", movs, cats, cuentas, [], () => 1, () => null);
  expect([x.tarjeta.total, x.tarjeta.pct, x.tarjeta.anterior]).toEqual([150, 33, null]);
  expect(x.comprometido.tarjetas).toBe(150); // septiembre con tarjeta se paga en octubre
  expect(x.suscripciones.total).toBe(100);
  expect(x.cambios.map(c => [c.cat.nombre, c.dif])).toEqual([["Ocio", 250], ["Suscripciones", 100]]);
});
