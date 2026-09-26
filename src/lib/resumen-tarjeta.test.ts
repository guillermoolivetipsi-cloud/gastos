import { expect, it } from "vitest";
import { leerResumen } from "./resumen-tarjeta";

// Renglones de ejemplo del lector de Finanzas; los comercios son inventados.
const EXTERIOR_MC = "01-Ago-26 PADEL CLUB(ESP,EUR,  16,99) 00988  19,63";
const EXTERIOR_VISA = "02-08-26 F SUPER BCN    EUR   54,46 341111 63,52";
const PESOS = "25-08-26 TIENDA ONLINE 123456 68.000,00";

it("lee los tres formatos de renglón y deja afuera pagos e impuestos", () => {
  const r = leerResumen(["MASTERCARD", EXTERIOR_MC, EXTERIOR_VISA, PESOS, "05-08-26 SU PAGO EN PESOS 000123 50.000,00", "TOTAL CONSUMOS DEL MES 68.000,00 83,15"].join("\n"));
  expect(r.consumos.map(c => [c.fecha, c.comercio, c.importe, c.usd])).toEqual([
    ["2026-08-01", "PADEL CLUB", 16.99, 19.63], ["2026-08-02", "SUPER BCN", 54.46, 63.52], ["2026-08-25", "TIENDA ONLINE", 68000, null],
  ]);
  expect(r.cuadra).toBe(true);
});

it("lee las fechas de cierre y vencimiento en los formatos habituales", () => {
  expect(leerResumen("CIERRE ACTUAL 25-Sep-26  VENCIMIENTO ACTUAL 06-Oct-26").cierre).toBe("2026-09-25");
  expect(leerResumen("CIERRE ACTUAL 25-Sep-26  VENCIMIENTO ACTUAL 06-Oct-26").vencimiento).toBe("2026-10-06");
  expect(leerResumen("Cierre actual: 25/09/2026\nVencimiento actual: 06/10/2026").cierre).toBe("2026-09-25");
  expect(leerResumen(PESOS).cierre).toBeNull();
});
