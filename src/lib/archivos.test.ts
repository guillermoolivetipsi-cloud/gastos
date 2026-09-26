import "fake-indexeddb/auto";
import { describe, expect, it, vi, beforeAll } from "vitest";
import * as XLSX from "xlsx";
import { db, sembrar } from "../db";

/* El Excel exportado tiene que leerse igual que lo lee Finanzas (lib/importar.ts):
   hojas Gastos/Ingresos, datos desde la fila 3, fecha en la columna 1, categoría
   en la 2, cuenta en la 3, importe y moneda de la transacción en la 6 y la 7. */

let archivo: Blob | null = null;
beforeAll(async () => {
  globalThis.URL.createObjectURL = (b: Blob) => { archivo = b; return "blob:x"; };
  globalThis.URL.revokeObjectURL = () => {};
  vi.stubGlobal("document", { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } });
  await sembrar();
});

describe("exportar a Finanzas", () => {
  it("usa el formato que Finanzas importa y marca lo exportado", async () => {
    const { exportar } = await import("./archivos");
    const cat = (await db.categorias.toArray()).find(c => c.nombre === "Café")!;
    const cta = (await db.cuentas.toArray()).find(c => c.nombre === "Revolut")!;
    const base = { tipo: "gasto" as const, moneda: "EUR" as const, usd: 2.73, cuentaId: cta.id, categoriaId: cat.id, etiquetas: ["Padel"], modificado: "x" };
    await db.movimientos.bulkAdd([
      { ...base, id: "b", fecha: "2026-09-20", monto: 2.4, comentario: "cortado", creado: "2026-09-20T10:00" },
      { ...base, id: "a", fecha: "2026-09-20", monto: 2.4, comentario: "cortado", creado: "2026-09-20T09:00" },
      { ...base, id: "c", fecha: "2026-08-02", monto: 5, creado: "2026-08-02T09:00" },
    ]);
    const n = await exportar(["2026-09"]);
    expect(n).toBe(2);
    const wb = XLSX.read(await archivo!.arrayBuffer());
    expect(wb.SheetNames).toEqual(["Gastos", "Ingresos"]);
    const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Gastos, { header: 1 });
    expect(filas.slice(2)).toEqual([
      ["2026-09-20", "Café", "Revolut", 2.4, "EUR", 2.4, "EUR", "Padel", "cortado", "a"],
      ["2026-09-20", "Café", "Revolut", 2.4, "EUR", 2.4, "EUR", "Padel", "cortado", "b"],
    ]);
    expect((await db.movimientos.get("a"))!.exportado).toBeTruthy();
    expect((await db.movimientos.get("c"))!.exportado).toBeFalsy();
  });
});

describe("importar", () => {
  it("dos gastos idénticos el mismo día son dos, y reimportar no duplica", async () => {
    const { importarXlsx } = await import("./archivos");
    const cab = ["Fecha", "Categoría", "Cuenta", "Importe", "Moneda", "Importe tx", "Moneda tx", "Etiquetas", "Comentario"];
    const fila = ["2025-03-10", "Café", "Revolut", 3, "USD", 3, "USD", "", ""];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["x"], cab, fila, fila]), "Gastos");
    const archivo = new File([XLSX.write(wb, { type: "array", bookType: "xlsx" })], "h.xlsx");
    const r1 = await importarXlsx(archivo);
    const r2 = await importarXlsx(archivo);
    expect([r1.nuevos, r2.nuevos, r2.repetidos]).toEqual([2, 0, 2]);
  });
});
