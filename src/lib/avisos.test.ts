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
