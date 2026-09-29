import { expect, it } from "vitest";
import type { Categoria, Cuenta, Movimiento } from "../tipos";
import { armarEnvio, interpretar, mesesAMandar, normalizarDireccion } from "./finanzas";

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

it("los meses: el anterior y el que corre", () => {
  expect(mesesAMandar("2026-01")).toEqual(["2025-12", "2026-01"]);
});

it("la dirección de la Mac, como la escribas", () => {
  expect(["192.168.1.17", "http://192.168.1.17:3005/", " 192.168.1.17:4000 ", ""].map(normalizarDireccion)).toEqual(["192.168.1.17:3005", "192.168.1.17:3005", "192.168.1.17:4000", ""]);
});

it("lee lo que contesta Finanzas", () => {
  const vista = { ok: true, avisos: [{ nivel: "atencion", texto: "Bizum: esa cuenta no existe" }, { nivel: "info", texto: "x" }], desde: "2026-08", hasta: "2026-09", leidos: 85, nuevos: 24, cambian: 3, iguales: 58, sinCuenta: ["Bizum"], porMes: [{ periodo: "2026-08", nuevos: 6, cambian: 3, iguales: 40 }] };
  expect(interpretar({ status: 200, data: { ok: true, vista, nuevos: 24, corregidos: 3, iguales: 58 } }, "d", false))
    .toEqual({ tipo: "listo", nuevos: 24, corregidos: 3, iguales: 58, porMes: vista.porMes, avisos: [vista.avisos[0]] });
  expect(interpretar({ status: 200, data: { ok: true, vista } }, "d", true).tipo).toBe("revisado");
  expect(interpretar({ status: 401, data: { ok: false, mensaje: "clave equivocada" } }, "d", false)).toEqual({ tipo: "clave" });
  expect(interpretar(null, "192.168.1.17:3005", false)).toEqual({ tipo: "sin-respuesta", direccion: "192.168.1.17:3005" });
  const rechazo = { ok: false, mensaje: "un id repetido", vista: { ...vista, ok: false, avisos: [{ nivel: "error", texto: "el id a está repetido" }] } };
  expect(interpretar({ status: 400, data: rechazo }, "d", false)).toEqual({ tipo: "rechazado", mensaje: "el id a está repetido" });
});
