import "fake-indexeddb/auto";
import Dexie from "dexie";
import { expect, it } from "vitest";

it("pasar a la versión con proyecciones no toca lo que ya había", async () => {
  const vieja = new Dexie("gastos");
  vieja.version(1).stores({
    cuentas: "id, orden", categorias: "id, tipo, orden",
    movimientos: "id, fecha, tipo, cuentaId, categoriaId, recurrenteId, [recurrenteId+periodo], exportado",
    recurrentes: "id, activo", descartes: "clave", ajustes: "clave",
  });
  await vieja.table("movimientos").add({ id: "m1", fecha: "2026-09-01", tipo: "gasto", monto: 5 });
  await vieja.table("recurrentes").add({ id: "r1", activo: true });
  await vieja.table("ajustes").add({ clave: "x", valor: 1 });
  vieja.close();

  const { db } = await import("../db");
  expect([await db.movimientos.count(), await db.recurrentes.count(), await db.ajustes.count(), await db.proyecciones.count()]).toEqual([1, 1, 1, 0]);
});

it("v3: los caprichos pasan a opcionales, los seguros quedan prendidos y todo es gasto", async () => {
  const { db } = await import("../db");
  db.close();
  await Dexie.delete("gastos");
  const v2 = new Dexie("gastos");
  v2.version(1).stores({ cuentas: "id, orden", categorias: "id, tipo, orden", movimientos: "id, fecha", recurrentes: "id, activo", descartes: "clave", ajustes: "clave" });
  v2.version(2).stores({ proyecciones: "id, periodo" });
  await v2.table("proyecciones").bulkAdd([{ id: "a", clase: "capricho", activa: true }, { id: "b", clase: "seguro", activa: false }]);
  v2.close();
  await db.open();
  const ps = await db.proyecciones.orderBy("id").toArray();
  expect(ps.map(p => [p.clase, p.activa, p.tipo])).toEqual([["opcional", true, "gasto"], ["seguro", true, "gasto"]]);
});

it("v4: suma las cuentas de Finanzas y los ingresos Ventas, Licencias y Alquiler sin duplicar ni pisar", async () => {
  const { db } = await import("../db");
  db.close();
  await Dexie.delete("gastos");
  const v3 = new Dexie("gastos");
  v3.version(1).stores({ cuentas: "id, orden", categorias: "id, tipo, orden", movimientos: "id, fecha", recurrentes: "id, activo", descartes: "clave", ajustes: "clave" });
  v3.version(2).stores({ proyecciones: "id, periodo" });
  v3.version(3).stores({});
  await v3.table("cuentas").bulkAdd([{ id: "rev", nombre: "Revolut", orden: 0 }, { id: "cocos", nombre: "cocos", orden: 1, archivada: true }]);
  await v3.table("categorias").bulkAdd([
    { id: "venta", nombre: "Venta", tipo: "ingreso", orden: 0, archivada: true },
    { id: "alq", nombre: "Alquiler", tipo: "ingreso", orden: 1 },
    { id: "alq-g", nombre: "Alquiler", tipo: "gasto", orden: 2 },
  ]);
  v3.close();
  await db.open();
  const cuentas = await db.cuentas.toArray();
  expect(cuentas.map(c => c.nombre).sort()).toEqual(["ARQ", "Invertir Online", "Nexo", "Revolut", "cocos"]);
  expect(cuentas.find(c => c.id === "cocos")!.archivada).toBe(false);
  const ingresos = (await db.categorias.where("tipo").equals("ingreso").toArray()).map(c => [c.nombre, !!c.archivada]).sort();
  expect(ingresos).toEqual([["Alquiler", false], ["Licencias", false], ["Venta", false]]);
});
