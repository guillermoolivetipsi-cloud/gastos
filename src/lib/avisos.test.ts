import { expect, it } from "vitest";
import { aAvisar } from "./avisos";
import type { Tarea } from "./recordatorios";

const diario = { tipo: "diario", clave: "diario|2026-09-26", titulo: "", detalle: "" } as Tarea;
const exportar = { tipo: "exportar", clave: "exportar|2026-09", titulo: "", detalle: "", periodo: "2026-09" } as Tarea;
const ahora = new Date("2026-10-05T12:00:00").getTime();

it("el aviso del día sale una sola vez; los mensuales se repiten cada 3 días", () => {
  expect(aAvisar([diario, exportar], {}, ahora)).toHaveLength(2);
  const hace1 = new Date(ahora - 864e5).toISOString(), hace4 = new Date(ahora - 4 * 864e5).toISOString();
  expect(aAvisar([diario, exportar], { [diario.clave]: hace4, [exportar.clave]: hace1 }, ahora)).toEqual([]);
  expect(aAvisar([exportar], { [exportar.clave]: hace4 }, ahora)).toEqual([exportar]);
});

it("no pide el resumen de un mes sin la tarjeta completa (historial viejo)", async () => {
  const { tareas, RECORDATORIOS } = await import("./recordatorios");
  const visa = { id: "v", nombre: "Visa", moneda: "ARS", dolar: "oficial", esTarjeta: true, orden: 0 } as const;
  const m = (fecha: string, cuentaId = "v") => ({ id: fecha + cuentaId, tipo: "gasto", fecha, monto: 1, moneda: "USD", usd: 1, cuentaId, categoriaId: "c", etiquetas: [], creado: "2026-01-01", modificado: "", exportado: "x" }) as never;
  const hist = [m("2025-01-10", "otra"), m("2026-08-27"), m("2026-08-29"), m("2026-08-30")];
  const hoy = new Date(); // la prueba corre con la fecha real: armamos "el mes pasado" relativo
  const ant = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const p = `${ant.getFullYear()}-${String(ant.getMonth() + 1).padStart(2, "0")}`;
  const tardio = [m(`${p}-27`), m(`${p}-28`), m(`${p}-29`)];
  const completo = [m(`${p}-02`), m(`${p}-12`), m(`${p}-20`)];
  expect(tareas(RECORDATORIOS, [visa], [...hist, ...tardio], {}, null, new Set()).filter(t => t.tipo === "resumen")).toHaveLength(0);
  expect(tareas(RECORDATORIOS, [visa], [...hist, ...completo], {}, null, new Set()).filter(t => t.tipo === "resumen")).toHaveLength(1);
});

it("app de Android: programa 14 días; hoy no avisa lo que ya cargaste; resumen y exportar desde el día 1, cada 3 días", async () => {
  const { planificar } = await import("./avisos");
  const { RECORDATORIOS } = await import("./recordatorios");
  const visa = { id: "v", nombre: "Visa", moneda: "ARS", dolar: "oficial", esTarjeta: true, orden: 0 } as const;
  const m = (fecha: string, creado = `${fecha}T12:00:00`) => ({ id: fecha, tipo: "gasto", fecha, monto: 1, moneda: "USD", usd: 1, cuentaId: "v", categoriaId: "c", etiquetas: [], creado, modificado: "" }) as never;
  const movs = [m("2026-09-02"), m("2026-09-12"), m("2026-09-20"), m("2026-09-29", new Date(2026, 8, 29, 11).toISOString())];
  const ahora = new Date(2026, 8, 29, 12);
  const a = planificar(RECORDATORIOS, [visa], movs, {}, null, new Set(), ahora);
  const diarios = a.filter(x => x.accion === "gasto").map(x => x.cuando.getDate());
  expect(diarios[0]).toBe(30); // hoy ya cargaste algo
  expect(diarios).toHaveLength(13);
  const res = a.filter(x => x.accion === "resumen");
  expect([res[0].cuando.getMonth(), res[0].cuando.getDate(), res[0].cuando.getHours(), res[0].cuentaId]).toEqual([9, 1, 10, "v"]);
  expect(res.length).toBeGreaterThan(2);
  expect(res.length).toBeLessThan(7);
  expect(a.filter(x => x.accion === "exportar")[0].cuando.getDate()).toBe(1);
  expect(new Set(a.map(x => x.id)).size).toBe(a.length);
  // Ya subido: no se avisa.
  expect(planificar(RECORDATORIOS, [visa], movs, { "v|2026-09": "x" }, null, new Set(), ahora).some(x => x.accion === "resumen")).toBe(false);
});
