import { expect, it } from "vitest";
import type { Categoria, Cuenta, Movimiento } from "../tipos";
import { armarEnvio, interpretar, mesesAMandar, nombreDeEnvio } from "./finanzas";

const cuentas: Cuenta[] = [
  { id: "rev", nombre: "Revolut", moneda: "EUR", dolar: "blue", esTarjeta: false, orden: 0 },
  { id: "visa", nombre: "Visa", moneda: "ARS", dolar: "oficial", esTarjeta: true, orden: 1 },
];
const cats = [
  { id: "ocio", nombre: "Ocio", tipo: "gasto" }, { id: "psi", nombre: "Psicología", tipo: "ingreso" }, { id: "alq", nombre: "Alquiler", tipo: "ingreso" },
] as Categoria[];
let n = 0;
const mov = (x: Partial<Movimiento>): Movimiento => ({ id: `m${n++}`, tipo: "gasto", fecha: "2026-09-04", monto: 28.7, moneda: "EUR", usd: 33.1, cuentaId: "rev", categoriaId: "ocio", etiquetas: ["Vacaciones"], comentario: "Cena", creado: `2026-09-04T1${n % 10}:00`, modificado: "", ...x });

it("manda los meses completos, en su moneda, con el id de la app; sin cobros de pacientes", () => {
  const movs = [
    mov({ id: "a" }), mov({ id: "b", fecha: "2026-08-31", cuentaId: "visa", moneda: "ARS", monto: 68000, usd: 44, cuotas: 3, comentario: "" }),
    mov({ id: "viejo", fecha: "2026-07-30" }), mov({ id: "psi", tipo: "ingreso", categoriaId: "psi", monto: 50000, moneda: "ARS" }),
    mov({ id: "alq", tipo: "ingreso", categoriaId: "alq", monto: 400, moneda: "USD", exportado: "2026-09-01" }),
  ];
  const e = armarEnvio(["2026-08", "2026-09"], movs, cats, cuentas, new Date("2026-09-29T12:00:00Z"));
  expect([e.app, e.contrato, e.desde, e.hasta, e.generado]).toEqual(["gastos", "1.0", "2026-08", "2026-09", "2026-09-29T12:00:00.000Z"]);
  expect(e.movimientos.map(m => m.id)).toEqual(["b", "a", "alq"]);
  expect(e.movimientos[0]).toEqual({ id: "b", tipo: "gasto", fecha: "2026-08-31", monto: 68000, moneda: "ARS", cuenta: "Visa", categoria: "Ocio", etiquetas: ["Vacaciones"], comentario: undefined, cuotas: 3 });
  expect(e.movimientos[1]).toMatchObject({ monto: 28.7, moneda: "EUR", cuenta: "Revolut", comentario: "Cena", cuotas: undefined });
  expect(JSON.stringify(e)).not.toContain("33.1"); // nunca en dólares convertidos
});

it("los meses: los últimos 6, el que corre incluido", () => {
  expect(mesesAMandar("2026-03")).toEqual(["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"]);
});

it("el nombre del archivo del envío", () => {
  expect(nombreDeEnvio(new Date("2026-09-29T12:40:05.123Z"))).toBe("2026-09-29T12-40-05Z.json");
});

it("lee la respuesta de Finanzas", () => {
  const resp = { app: "finanzas", respondido: "2026-09-29T21:30:02.000Z", envio: "x.json", ok: true, mensaje: "24 nuevos", nuevos: 24, corregidos: 3, iguales: 58,
    avisos: [{ nivel: "atencion", texto: "Bizum: esa cuenta no existe" }, { nivel: "info", texto: "x" }], porMes: [{ periodo: "2026-09", nuevos: 18, cambian: 0, iguales: 40 }] };
  expect(interpretar(resp)).toEqual({ tipo: "listo", nuevos: 24, corregidos: 3, iguales: 58, porMes: resp.porMes, avisos: [resp.avisos[0]] });
  expect(interpretar({ ok: false, mensaje: "un id repetido", avisos: [{ nivel: "error", texto: "el id a está repetido" }] })).toEqual({ tipo: "rechazado", mensaje: "el id a está repetido" });
  expect(interpretar({ ok: false, mensaje: "contrato desconocido" })).toEqual({ tipo: "rechazado", mensaje: "contrato desconocido" });
});

it("cada movimiento lleva con qué se pagó; las tarjetas se llaman Visa y Mastercard", () => {
  const ctas = [...cuentas, { id: "mc", nombre: "Mastercard", moneda: "ARS", dolar: "oficial", esTarjeta: true, orden: 2 } as Cuenta];
  const movs = [mov({ cuentaId: "rev" }), mov({ cuentaId: "visa" }), mov({ cuentaId: "mc" }), mov({ cuentaId: "borrada" })];
  const e = armarEnvio(["2026-09"], movs, cats, ctas);
  expect(e.movimientos.map(m => m.cuenta)).toEqual(["Revolut", "Visa", "Mastercard", undefined]);
  // Sin cuenta conocida no se inventa: el campo no viaja.
  expect(JSON.parse(JSON.stringify(e.movimientos[3]))).not.toHaveProperty("cuenta");
  expect(e.contrato).toBe("1.0");
});
