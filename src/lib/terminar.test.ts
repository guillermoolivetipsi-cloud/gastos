import "fake-indexeddb/auto";
import { beforeEach, expect, it, vi } from "vitest";
import { db } from "../db";
import { terminarRecurrente, reactivarRecurrente } from "./acciones";
import { estadoDe, instanciasDelMes } from "./recurrentes";
import type { Recurrente } from "../tipos";

const base: Recurrente = { id: "exp", nombre: "Expensas", tipo: "gasto", categoriaId: "casa", cuentaId: "g", monto: 100, moneda: "ARS", clase: "variable", frecuencia: "mensual", dia: 9, inicio: "2026-08-01", modo: "avisar", activo: true };
beforeEach(async () => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 15)); await db.recurrentes.clear(); await db.movimientos.clear(); });

it("dejar de pedirlo conserva el historial y no pide más desde este mes", async () => {
  await db.recurrentes.add(base);
  await db.movimientos.add({ id: "ago", tipo: "gasto", fecha: "2026-08-09", monto: 100, moneda: "ARS", usd: 1, cuentaId: "g", categoriaId: "casa", etiquetas: [], recurrenteId: "exp", periodo: "2026-08", creado: "", modificado: "" });
  await terminarRecurrente(base);
  const r = (await db.recurrentes.get("exp"))!;
  expect(r.fin).toBe("2026-09-30");
  expect(instanciasDelMes(r, "2026-10")).toEqual([]);
  expect(estadoDe(instanciasDelMes(r, "2026-08")[0], await db.movimientos.toArray(), 1).estado).toBe("cargado");
  await reactivarRecurrente(r);
  expect((await db.recurrentes.get("exp"))!.fin).toBeUndefined();
});

it("si este mes ya estaba pagado, termina a fin de mes", async () => {
  await db.recurrentes.add(base);
  await db.movimientos.add({ id: "oct", tipo: "gasto", fecha: "2026-10-09", monto: 100, moneda: "ARS", usd: 1, cuentaId: "g", categoriaId: "casa", etiquetas: [], recurrenteId: "exp", periodo: "2026-10", creado: "", modificado: "" });
  await terminarRecurrente(base);
  expect((await db.recurrentes.get("exp"))!.fin).toBe("2026-10-31");
});
