import { beforeEach, expect, it, vi } from "vitest";
import type { Categoria, Movimiento, Recurrente } from "../tipos";
import { categoriasDeEtiquetas, categoriasPorUso, etiquetasParaCategoria, gastosFrecuentes, recurrenteParecido } from "./editorLogica";
import { estadoDe, instanciasDelMes } from "../lib/recurrentes";

let n = 0;
const mov = (x: Partial<Movimiento>): Movimiento => ({ id: `m${n++}`, tipo: "gasto", fecha: "2026-09-20", monto: 2.4, moneda: "EUR", usd: 2.7, cuentaId: "rev", categoriaId: "cafe", etiquetas: [], creado: "", modificado: "", ...x });
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 8, 26, 12)); });

it("repetir: lo que cargaste al menos dos veces, lo más frecuente primero", () => {
  const f = gastosFrecuentes([mov({}), mov({}), mov({}), mov({ categoriaId: "super", monto: 7.98 }), mov({ categoriaId: "super", monto: 7.98 }), mov({ monto: 3 }), mov({ fecha: "2026-06-01" }), mov({ recurrenteId: "x" })]);
  expect(f.map(m => [m.categoriaId, m.monto])).toEqual([["cafe", 2.4], ["super", 7.98]]);
});

it("categorías: primero las más usadas; las archivadas no, salvo la elegida", () => {
  const cats = ["a", "b", "c"].map((id, i) => ({ id, nombre: id, tipo: "gasto", icono: "", color: "", orden: i, archivada: id === "c" }) as Categoria);
  const movs = [mov({ categoriaId: "b" }), mov({ categoriaId: "b" }), mov({ categoriaId: "a" })];
  expect(categoriasPorUso(movs, cats, "gasto", "").map(c => c.id)).toEqual(["b", "a"]);
  expect(categoriasPorUso(movs, cats, "gasto", "c").map(c => c.id)).toEqual(["b", "a", "c"]);
});

it("etiquetas: las de la categoría elegida primero, el resto aparte; las asignadas a mano mandan", () => {
  const movs = [mov({ categoriaId: "dep", etiquetas: ["Padel", "Gym"] }), mov({ categoriaId: "dep", etiquetas: ["Padel"] }), mov({ categoriaId: "super", etiquetas: ["Verduleria"] }), mov({ categoriaId: "super", etiquetas: ["Viejo"] })];
  const mapa = categoriasDeEtiquetas(movs, { Mallorca: ["trip", "ocio"], Gym: ["dep", "salud"] });
  expect(etiquetasParaCategoria(mapa, "dep", ["Viejo"])).toEqual({ propias: ["Padel", "Gym"], otras: ["Verduleria", "Mallorca"] });
  expect(etiquetasParaCategoria(mapa, "ocio", []).propias).toEqual(["Mallorca"]);
  expect(etiquetasParaCategoria(mapa, "salud", []).propias).toEqual(["Gym"]);
});

it("sugiere el recurrente pendiente más parecido", () => {
  const gas: Recurrente = { id: "gas", nombre: "Gas", tipo: "gasto", categoriaId: "casa", cuentaId: "gal", monto: 20972, moneda: "ARS", clase: "variable", frecuencia: "mensual", dia: 9, inicio: "2026-09-01", modo: "avisar", activo: true };
  const luz: Recurrente = { ...gas, id: "luz", nombre: "Luz", monto: 28716 };
  const pend = [gas, luz].map(r => estadoDe(instanciasDelMes(r, "2026-10")[0], [], 1545));
  const b = { tipo: "gasto" as const, fecha: "2026-10-09", monto: 29000, moneda: "ARS" as const, usd: 18.8, cuentaId: "gal", categoriaId: "casa", comentario: "" };
  expect(recurrenteParecido(b, pend, () => 1545)?.rec.id).toBe("luz");
  expect(recurrenteParecido({ ...b, monto: 0, comentario: "pago gas" }, pend, () => 1545)?.rec.id).toBe("gas");
  expect(recurrenteParecido({ ...b, categoriaId: "otra", comentario: "" }, pend, () => 1545)).toBeNull();
});
