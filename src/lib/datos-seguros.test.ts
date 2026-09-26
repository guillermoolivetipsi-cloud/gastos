import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, leerAjuste } from "../db";
import type { Recurrente } from "../tipos";

const netflix: Recurrente = { id: "nf", nombre: "Netflix", tipo: "gasto", categoriaId: "sus", cuentaId: "rev", monto: 10, moneda: "USD", clase: "fijo", frecuencia: "mensual", dia: 3, inicio: "2026-08-01", modo: "auto", activo: true };

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 8, 26, 12));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => (String(url).includes("frankfurter") ? { rates: { EUR: 0.9 } } : { venta: 1500 }) })));
  for (const t of db.tables) await t.clear();
});

describe("recurrentes automáticos", () => {
  it("dos corridas a la vez no duplican", async () => {
    const { cargarAutomaticos } = await import("./recurrentes");
    await db.recurrentes.add(netflix);
    await Promise.all([cargarAutomaticos(), cargarAutomaticos(), cargarAutomaticos()]);
    expect((await db.movimientos.toArray()).map(m => m.periodo).sort()).toEqual(["2026-08", "2026-09"]);
  });
  it("si borrás un pago automático, no vuelve a aparecer (y deshacer lo trae)", async () => {
    const { cargarAutomaticos } = await import("./recurrentes");
    const { eliminarMovimiento } = await import("./acciones");
    await db.recurrentes.add(netflix);
    await cargarAutomaticos();
    const deshacer = await eliminarMovimiento("auto|nf|2026-09");
    await cargarAutomaticos();
    expect(await db.movimientos.get("auto|nf|2026-09")).toBeUndefined();
    await deshacer();
    expect(await db.movimientos.get("auto|nf|2026-09")).toBeDefined();
    expect((await db.recurrentes.get("nf"))!.saltear).toEqual([]);
  });
});

describe("cotizaciones", () => {
  it("una cotización vieja no pisa la de hoy", async () => {
    const { cotizar } = await import("./cotizaciones");
    await cotizar("EUR", "2026-09-26", "blue");
    const hoy = await leerAjuste<number>("ultima|EUR|", 0);
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => ({ ok: true, json: async () => ({ rates: { EUR: 0.7 } }) }));
    await cotizar("EUR", "2024-05-10", "blue");
    expect(await leerAjuste<number>("ultima|EUR|", 0)).toBe(hoy);
    expect((await leerAjuste<Record<string, number>>("cotizaciones", {}))["EUR|2024-05-10"]).toBe(0.7);
  });
});

describe("restaurar", () => {
  it("un archivo dañado no borra nada", async () => {
    const { restaurar } = await import("./archivos");
    await db.movimientos.add({ id: "x", tipo: "gasto", fecha: "2026-09-01", monto: 1, moneda: "USD", usd: 1, cuentaId: "c", categoriaId: "k", etiquetas: [], creado: "", modificado: "" });
    const roto = new File([JSON.stringify({ app: "gastos", cuentas: [], categorias: [], recurrentes: [], movimientos: [{ id: 1 }] })], "r.json");
    await expect(restaurar(roto)).rejects.toThrow(/dañada/);
    expect(await db.movimientos.count()).toBe(1);
  });
});
