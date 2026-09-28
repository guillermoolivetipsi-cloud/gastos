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
