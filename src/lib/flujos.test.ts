import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, leerAjuste } from "../db";
import type { Categoria, Cuenta, Movimiento, Recurrente } from "../tipos";

/* Flujos completos contra la base (IndexedDB en memoria). */

const visa: Cuenta = { id: "visa", nombre: "Visa", moneda: "ARS", dolar: "oficial", esTarjeta: true, cierreDesde: 31, cierreHasta: 31, venceDias: 10, cierres: {}, orden: 0 };
const revolut: Cuenta = { id: "rev", nombre: "Revolut", moneda: "EUR", dolar: "blue", esTarjeta: false, orden: 1 };
const cats: Categoria[] = [
  { id: "sus", nombre: "Suscripciones", tipo: "gasto", icono: "", color: "", orden: 0, clase: "fijo", claseConfirmada: true },
  { id: "super", nombre: "Super", tipo: "gasto", icono: "", color: "", orden: 1 },
  { id: "casa", nombre: "Casa", tipo: "gasto", icono: "", color: "", orden: 2, clase: "fijo", claseConfirmada: true },
];
let n = 0;
const mov = (x: Partial<Movimiento>): Movimiento => ({ id: `m${n++}`, tipo: "gasto", fecha: "2026-09-10", monto: 10, moneda: "USD", usd: 10, cuentaId: "rev", categoriaId: "super", etiquetas: [], creado: "2026-09-10T10:00:00Z", modificado: "2026-09-10T10:00:00Z", ...x });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 8, 26, 12));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ venta: 1500, rates: { EUR: 0.9 } }) })));
  for (const t of db.tables) await t.clear();
  await db.cuentas.bulkAdd([visa, revolut]);
  await db.categorias.bulkAdd(cats);
});

describe("editar un gasto", () => {
  it("conserva creado, exportado y la cotización si no cambia fecha, moneda ni cuenta", async () => {
    const { guardarMovimiento } = await import("./acciones");
    const orig = mov({ id: "e", moneda: "EUR", monto: 20, usd: 22, cotizacion: { tasa: 0.9, fuente: "BCE", fecha: "2026-09-10" }, exportado: "2026-09-12T00:00:00Z" });
    await db.movimientos.add(orig);
    await guardarMovimiento({ id: "e", tipo: "gasto", fecha: "2026-09-10", monto: 30, moneda: "EUR", cuentaId: "rev", categoriaId: "super", etiquetas: ["x"] }, revolut);
    const m = (await db.movimientos.get("e"))!;
    expect([m.creado, m.exportado, m.cotizacion?.tasa, m.usd, m.etiquetas]).toEqual([orig.creado, orig.exportado, 0.9, 33.33, ["x"]]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("bloques del resumen", () => {
  it("fijos (por categoría o por recurrente fijo) y variables contra el objetivo", async () => {
    const { bloques } = await import("./analisis");
    const alquiler: Recurrente = { id: "alq", nombre: "Alquiler", tipo: "gasto", categoriaId: "super", cuentaId: "rev", monto: 400, moneda: "USD", clase: "fijo", frecuencia: "mensual", dia: 1, inicio: "2026-09-01", modo: "avisar", activo: true };
    const gastos = [mov({ categoriaId: "sus", usd: 100 }), mov({ usd: 50 }), mov({ usd: 400, recurrenteId: "alq", periodo: "2026-09" })];
    const conObjetivo = cats.map(c => (c.id === "super" ? { ...c, objetivo: 200 } : c));
    const b = bloques("2026-09", gastos, conObjetivo, [alquiler], [], () => 1);
    expect([b.fijos.pagado, b.variables.gastado, b.variables.objetivo, b.variables.queda]).toEqual([500, 50, 200, 150]);
  });
});

describe("guardar un resumen de tarjeta", () => {
  it("agrega lo que falta, corrige, vincula recurrentes, aprende comercios y guarda el cierre", async () => {
    const { conciliar } = await import("./conciliar");
    const { aplicarResumen } = await import("./aplicarResumen");
    const claude: Recurrente = { id: "cl", nombre: "Claude", tipo: "gasto", categoriaId: "sus", cuentaId: "visa", monto: 100, moneda: "USD", clase: "fijo", frecuencia: "mensual", dia: 21, inicio: "2026-09-01", modo: "avisar", activo: true };
    await db.recurrentes.add(claude);
    const yaCargados = [
      mov({ id: "cl9", cuentaId: "visa", categoriaId: "sus", monto: 100, usd: 100, fecha: "2026-09-21" }), // coincide → se vincula a Claude
      mov({ id: "lidl", cuentaId: "rev", monto: 52.63, moneda: "EUR", usd: 60.1, fecha: "2026-09-01" }), // en otra cuenta → pasa a Visa
      mov({ id: "book", cuentaId: "rev", monto: 49, moneda: "USD", usd: 49, fecha: "2026-09-10" }), // eran euros → corrige moneda
    ];
    await db.movimientos.bulkAdd(yaCargados);
    const consumos = [
      { fecha: "2026-09-21", comercio: "ANTHROPIC* CLAUDE", moneda: "USD", importe: 100, usd: 100, columna: "USD" as const },
      { fecha: "2026-09-01", comercio: "LIDL BCN", moneda: "EUR", importe: 52.63, usd: 61.78, columna: "USD" as const },
      { fecha: "2026-09-10", comercio: "Flights by Booking", moneda: "EUR", importe: 49, usd: 57.68, columna: "USD" as const },
      { fecha: "2026-09-19", comercio: "DLOCAL*SPOTIFY P", moneda: "ARS", importe: 11474.49, usd: null, columna: "ARS" as const },
    ];
    const { filas } = conciliar(consumos, visa, yaCargados, {}, "2026-08-29", "2026-09-28");
    expect(filas.map(f => f.tipo)).toEqual(["coincide", "otra-cuenta", "moneda", "falta"]);
    const aplicar = Object.fromEntries(filas.map((f, i) => [i, f.tipo !== "coincide"]));
    const datos = { movimientos: yaCargados, recurrentes: [claude], categorias: cats, tasaRec: () => 1 };
    const r = await aplicarResumen({ filas, aplicar, cats: { 3: "sus" }, tarjeta: visa, cierre: "2026-09-25", vence: "2026-10-06", datos });
    expect(r).toEqual({ nuevos: 1, corregidos: 2 });
    const todo = new Map((await db.movimientos.toArray()).map(m => [m.id, m]));
    expect(todo.get("cl9")!.recurrenteId).toBe("cl");
    expect(todo.get("lidl")!.cuentaId).toBe("visa");
    expect([todo.get("book")!.moneda, todo.get("book")!.usd]).toEqual(["EUR", 57.68]);
    const spotify = [...todo.values()].find(m => m.comentario === "DLOCAL*SPOTIFY P")!;
    expect([spotify.cuentaId, spotify.moneda, spotify.usd, spotify.categoriaId]).toEqual(["visa", "ARS", 7.65, "sus"]);
    const cuenta = (await db.cuentas.get("visa"))!;
    expect([cuenta.cierres, cuenta.venceDias]).toEqual([{ "2026-09": 25 }, 11]);
    expect((await leerAjuste<Record<string, string>>("reglasComercio", {})).SPOTIFY).toBe("sus");
    expect(Object.keys(await leerAjuste<Record<string, string>>("resumenesCargados", {}))).toEqual(["visa|2026-09"]);
  });
});

describe("sumar un paquete", () => {
  it("dos veces seguidas no duplica nada", async () => {
    const { sumarPaquete } = await import("./archivos");
    await db.movimientos.add(mov({ id: "pago", categoriaId: "casa", monto: 420, moneda: "EUR", fecha: "2026-09-24" }));
    const paquete = {
      app: "gastos-paquete",
      categorias: [{ nombre: "Ventas", tipo: "ingreso", icono: "store", color: "#000" }],
      recurrentes: [{ id: "alq", nombre: "Alquiler", tipo: "gasto", categoria: "Casa", cuenta: "Revolut", monto: 420, moneda: "EUR", clase: "fijo", frecuencia: "mensual", dia: 24, inicio: "2026-09-01", modo: "avisar", activo: true, pagos: ["pago"] }],
      movimientos: [{ id: "ago1", tipo: "gasto", fecha: "2026-08-30", monto: 23.16, moneda: "USD", usd: 23.16, cuenta: "Visa", categoria: "Super", yaEnFinanzas: true }],
      cuentas: [{ nombre: "Visa", cambios: { cierres: { "2026-08": 26 } } }],
    };
    const f = () => new File([JSON.stringify(paquete)], "p.json");
    const r1 = await sumarPaquete(f());
    const r2 = await sumarPaquete(f());
    expect([r1.categorias, r1.recurrentes, r1.pagos, r1.movimientos]).toEqual([1, 1, 1, 1]);
    expect([r2.categorias, r2.recurrentes, r2.pagos, r2.movimientos]).toEqual([0, 0, 0, 0]);
    expect([await db.movimientos.count(), await db.recurrentes.count(), (await db.cuentas.get("visa"))!.cierres]).toEqual([2, 1, { "2026-08": 26 }]);
  });
});

describe("historial de cotizaciones", () => {
  it("un fin de semana toma la cotización del viernes", async () => {
    const { precargarHistoria } = await import("./cotizaciones");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes("frankfurter") ? { rates: { "2026-09-11": { EUR: 0.86 }, "2026-09-14": { EUR: 0.87 } } } : [{ fecha: "2026-09-11", venta: 1500 }]),
    })));
    const memo: Record<string, number> = {};
    await precargarHistoria(["2026-09-13", "2026-09-11", "2026-09-14"], memo);
    expect([memo["EUR|2026-09-13"], memo["EUR|2026-09-14"], memo["ARS|blue|2026-09-13"]]).toEqual([0.86, 0.87, 1500]);
  });
});
