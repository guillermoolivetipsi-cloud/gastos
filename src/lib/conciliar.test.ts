import { describe, expect, it } from "vitest";
import type { Cuenta, Movimiento } from "../tipos";
import { claveComercio, conciliar } from "./conciliar";
import { resumenQueVence } from "./tarjeta";
import type { Consumo } from "./resumen-tarjeta";

const visa: Cuenta = { id: "visa", nombre: "Visa", moneda: "ARS", dolar: "oficial", esTarjeta: true, cierreDesde: 31, cierreHasta: 31, venceDias: 10, cierres: {}, orden: 0 };
let n = 0;
const mov = (x: Partial<Movimiento>): Movimiento => ({ id: `m${n++}`, tipo: "gasto", fecha: "2026-09-10", monto: 1, moneda: "EUR", usd: 1, cuentaId: "visa", categoriaId: "cat", etiquetas: [], creado: "", modificado: "", ...x });
const consumo = (x: Partial<Consumo>): Consumo => ({ fecha: "2026-09-10", comercio: "LIDL BCN", moneda: "EUR", importe: 52.63, usd: 61.78, columna: "USD", ...x });

describe("conciliar un resumen", () => {
  it("reconoce lo cargado, lo cargado en otra cuenta y lo que falta", () => {
    const movs = [mov({ monto: 52.63, usd: 60.1 }), mov({ id: "rev", cuentaId: "revolut", monto: 35.9, usd: 41 })];
    const c = conciliar([consumo({}), consumo({ comercio: "MANSO", importe: 35.9, usd: 41.84 }), consumo({ comercio: "SQ *ORIGO BAKERY", importe: 6.2, usd: 7.28 })],
      visa, movs, { "ORIGO BAKERY": "cafe" }, "2026-09-01", "2026-09-30");
    expect(c.filas.map(f => f.tipo)).toEqual(["coincide", "otra-cuenta", "falta"]);
    expect(c.filas[2].categoriaId).toBe("cafe");
  });
  it("detecta euros cargados como dólares", () => {
    const c = conciliar([consumo({ comercio: "Booking", importe: 49, usd: 57.68 })], visa, [mov({ monto: 49, moneda: "USD", usd: 49 })], {}, "2026-09-01", "2026-09-30");
    expect(c.filas[0].tipo).toBe("moneda");
  });
  it("compara pesos con pesos y avisa lo cargado que el resumen no trae", () => {
    const c = conciliar([consumo({ columna: "ARS", moneda: "ARS", importe: 11474.49, usd: null })], visa,
      [mov({ monto: 11474.49, moneda: "ARS", usd: 7.4 }), mov({ fecha: "2026-09-20", monto: 3, usd: 3.4 })], {}, "2026-09-01", "2026-09-30");
    expect(c.filas[0].tipo).toBe("coincide");
    expect(c.sobrantes).toHaveLength(1);
  });
  it("normaliza el nombre del comercio", () => {
    expect(claveComercio("DLOCAL*SPOTIFY P")).toBe("SPOTIFY");
    expect(claveComercio("LA CONFITERIA 1912")).toBe("CONFITERIA");
  });
});

describe("lo que se paga en un mes", () => {
  it("con cierre a fin de mes, en octubre se paga todo septiembre", () => {
    const movs = [mov({ fecha: "2026-09-02", usd: 10 }), mov({ fecha: "2026-09-29", usd: 5 }), mov({ fecha: "2026-10-02", usd: 99 })];
    const r = resumenQueVence(visa, movs, "2026-10");
    expect([r.periodo, r.total, r.vence]).toEqual(["2026-09", 15, "2026-10-10"]);
  });
  it("con el cierre real del resumen, lo posterior pasa al siguiente", () => {
    const movs = [mov({ fecha: "2026-09-24", usd: 10 }), mov({ fecha: "2026-09-27", usd: 5 })];
    const r = resumenQueVence({ ...visa, cierres: { "2026-09": 25 } }, movs, "2026-10");
    expect(r.total).toBe(10);
  });
});
