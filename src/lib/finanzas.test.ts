import { expect, it } from "vitest";
import type { Categoria, Cuenta, Movimiento, Proyeccion } from "../tipos";
import { armarDesdeFinanzas, armarEnvio, cambioDeEtapa, interpretar, mesesAMandar, nombreDeEnvio, validarDesdeFinanzas } from "./finanzas";

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
  expect([e.app, e.contrato, e.desde, e.hasta, e.generado]).toEqual(["gastos", "1.1", "2026-08", "2026-09", "2026-09-29T12:00:00.000Z"]);
  expect(e.movimientos.map(m => m.id)).toEqual(["b", "a", "alq"]);
  expect(e.movimientos[0]).toEqual({ id: "b", tipo: "gasto", fecha: "2026-08-31", monto: 68000, moneda: "ARS", cuenta: "Visa", categoria: "Ocio", etiquetas: ["Vacaciones"], comentario: undefined, cuotas: 3 });
  expect(e.movimientos[1]).toMatchObject({ monto: 28.7, moneda: "EUR", cuenta: "Revolut", comentario: "Cena", cuotas: undefined });
  expect(JSON.stringify(e)).not.toContain("33.1"); // nunca en dólares convertidos
});

it("lo pactado a futuro va como compromiso: solo lo de varios meses y seguro", () => {
  const p = (x: Partial<Proyeccion>): Proyeccion => ({ id: "x", nombre: "x", tipo: "ingreso", clase: "seguro", monto: 1150, moneda: "EUR", periodo: "2026-12", categoriaId: "alq", activa: true, creado: "", ...x });
  const proys = [
    p({ id: "bcn", nombre: "Alquiler depto BCN", hasta: "2027-03" }),
    p({ id: "venta", nombre: "Venta de la bici" }),                       // una sola vez: no
    p({ id: "bono", nombre: "Bono", clase: "opcional", hasta: "2027-01" }), // opcional: no
  ];
  const e = armarEnvio(["2026-10"], [], cats, cuentas, new Date(), proys);
  expect(e.compromisos).toEqual([{ id: "compromiso:bcn", tipo: "ingreso", concepto: "Alquiler depto BCN", monto: 1150, moneda: "EUR", desde: "2026-12", hasta: "2027-03", cada: "mes", comentario: undefined }]);
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
  expect(e.contrato).toBe("1.1");
});

it("lo de la cuenta «App anterior» no viaja: ya está en Finanzas", () => {
  const ctas = [...cuentas, { id: "vieja", nombre: "App anterior", moneda: "EUR", dolar: "blue", esTarjeta: false, orden: 3 } as Cuenta];
  const movs = [mov({ id: "a", cuentaId: "rev" }), mov({ id: "b", cuentaId: "vieja" })];
  const e = armarEnvio(["2026-09"], movs, cats, ctas);
  expect(e.movimientos.map(m => m.id)).toEqual(["a"]);
});

const desde = {
  app: "finanzas", contrato: "1.0", generado: "2026-10-14T21:30:02.000Z", meses: ["2026-09", "2026-10"],
  ingresos: [
    { id: "p1", fecha: "2026-10-07", monto: 85000, moneda: "ARS", usd: 54.8, categoria: "Psicología", cuenta: "Revolut", comentario: "Sesiones" },
    { id: "p2", fecha: "2026-09-20", monto: 120, moneda: "USD", usd: 120, categoria: "Psicología" },
  ],
  destinos: [{ periodo: "2026-09", liquidez: 300, inversion: 1500, deuda: 100 }, { periodo: "2026-10", liquidez: 500, inversion: 2000, deuda: 100 }],
};

it("lo que manda Finanzas: los cobros de Psicología entran como ingresos marcados, sin duplicar categorías", () => {
  const d = validarDesdeFinanzas(desde)!;
  expect(d).not.toBeNull();
  const psico = { id: "psico", nombre: "Psicología", tipo: "ingreso", icono: "", color: "", orden: 0 } as Categoria;
  const { movs, catsNuevas, cuentasNuevas, destinos } = armarDesdeFinanzas(d, [psico], cuentas);
  expect(movs.map(m => [m.id, m.tipo, m.monto, m.moneda, m.usd, m.categoriaId, m.origen])).toEqual([
    ["finanzas:p1", "ingreso", 85000, "ARS", 54.8, "psico", "finanzas"],
    ["finanzas:p2", "ingreso", 120, "USD", 120, "psico", "finanzas"],
  ]);
  expect(movs[0].cuentaId).toBe("rev");
  // Sin cuenta: va a una cuenta «Finanzas», que se crea una sola vez.
  expect(catsNuevas).toEqual([]);
  expect(cuentasNuevas.map(c => c.nombre)).toEqual(["Finanzas"]);
  expect(destinos["2026-10"]).toEqual({ liquidez: 500, inversion: 2000, deuda: 100 });
});

it("lo que manda Finanzas no se vuelve a mandar", () => {
  const { movs } = armarDesdeFinanzas(validarDesdeFinanzas(desde)!, cats, cuentas);
  const e = armarEnvio(["2026-10"], [...movs, mov({ cuentaId: "rev", fecha: "2026-10-04" })], cats, cuentas);
  expect(e.movimientos.every(m => !m.id.startsWith("finanzas:"))).toBe(true);
  expect(e.movimientos).toHaveLength(1);
});

it("si no cumple el contrato, no se aplica nada", () => {
  expect(validarDesdeFinanzas({ ...desde, contrato: "2.0" })).toBeNull();
  // Sin liquidez (todavía no hay cuenta aparte), con etapa y proyección: vale.
  expect(validarDesdeFinanzas({ ...desde, destinos: [{ periodo: "2026-10", inversion: 2000, deuda: 83 }], etapa: { nombre: "Llenar liquidez", texto: "2,1 de 3 meses" }, estimados: [{ periodo: "2026-10", usd: 3300 }] })).not.toBeNull();
  expect(validarDesdeFinanzas({ ...desde, estimados: [{ periodo: "oct", usd: 3300 }] })).toBeNull();
  expect(validarDesdeFinanzas({ ...desde, ingresos: [{ ...desde.ingresos[0], monto: -5 }] })).toBeNull();
  expect(validarDesdeFinanzas({ ...desde, ingresos: [desde.ingresos[0], desde.ingresos[0]] })).toBeNull();
  // Un ingreso de un mes que no viene en «meses» rompería el reemplazo por mes.
  expect(validarDesdeFinanzas({ ...desde, ingresos: [{ ...desde.ingresos[0], fecha: "2026-08-01" }] })).toBeNull();
});

it("avisa el cambio de etapa solo si había una y llegó otra distinta", () => {
  const e = (nombre: string) => ({ nombre, texto: "" });
  expect(cambioDeEtapa(e("Fondo de liquidez"), e("Libertad"))).toBe(true);
  expect(cambioDeEtapa(e("Fondo de liquidez"), e("fondo de liquidez "))).toBe(false);
  expect([cambioDeEtapa(null, e("Libertad")), cambioDeEtapa(e("Libertad"), null)]).toEqual([false, false]);
});
