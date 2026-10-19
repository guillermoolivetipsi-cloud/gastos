import { expect, it } from "vitest";
import type { Movimiento, Recurrente } from "../tipos";
import { claveDe, pareceRecurrente } from "./cajas";

const mov = (id: string, x: Partial<Movimiento>): Movimiento => ({ id, tipo: "gasto", fecha: "2026-10-15", monto: 45, moneda: "EUR", usd: 50, cuentaId: "rev", categoriaId: "dep", etiquetas: [], creado: "", modificado: "", ...x });
const rec = (x: Partial<Recurrente>): Recurrente => ({ id: "r", nombre: "Spotify", tipo: "gasto", categoriaId: "sus", cuentaId: "visa", monto: 12, moneda: "EUR", clase: "fijo", frecuencia: "mensual", dia: 12, inicio: "2026-01-01", modo: "avisar", activo: true, ...x });

it("parece recurrente: lo que se repitió todos los meses, o lo que nombra a un recurrente que ya tenés", () => {
  const movs = [mov("gym", { comentario: "Gimnasio" }), mov("spo", { comentario: "Spotify octubre", categoriaId: "sus" }), mov("cafe", { comentario: "Café", categoriaId: "cafe" })];
  const sug = [{ clave: "gasto|dep|gimnasio" }] as never;
  const p = pareceRecurrente(movs, sug, [rec({})]);
  expect([...p.entries()].map(([id, r]) => [id, r?.nombre ?? null])).toEqual([["gym", null], ["spo", "Spotify"]]);
});

it("la vez de un recurrente que le toca a un gasto: la del mes, o la semana más cercana", () => {
  expect(claveDe(rec({}), "2026-10-15")).toBe("2026-10");
  expect(claveDe(rec({ frecuencia: "semanal", dia: 1 }), "2026-10-14")).toBe("2026-10-12");
});
