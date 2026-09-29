import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Cuenta, Movimiento, Recurrente } from "../tipos";
import { cuotasDe, esDudosa, resumen, resumenDe, vencimiento } from "./tarjeta";
import { candidatos, esClaro, estadoDe, instanciasDelMes, recurrenteDe, sugerirVinculos } from "./recurrentes";
import { detectarRecurrentes, sugerirClase, sugerirObjetivo } from "./analisis";
import { fechaEnMes, rango, sumarMeses } from "./fecha";
import { leerNumero } from "./formato";

const visa: Cuenta = { id: "v", nombre: "Visa", moneda: "ARS", dolar: "oficial", esTarjeta: true, cierreDesde: 5, cierreHasta: 10, venceDias: 10, cierres: {}, orden: 0 };

let n = 0;
const mov = (x: Partial<Movimiento>): Movimiento => ({
  id: `m${n++}`, tipo: "gasto", fecha: "2026-09-20", monto: 100, moneda: "USD", usd: 100,
  cuentaId: "c", categoriaId: "cat", etiquetas: [], creado: "2026-01-01", modificado: "2026-01-01", ...x,
});

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 26, 15, 0)); });
afterEach(() => vi.useRealTimers());

describe("tarjeta", () => {
  it("una compra después del cierre va al resumen del mes siguiente", () => {
    expect(resumenDe(visa, "2026-09-20")).toBe("2026-10");
    expect(resumenDe(visa, "2026-09-03")).toBe("2026-09");
  });
  it("sin confirmar, cierra el último día posible; confirmado, el día real", () => {
    expect(resumenDe(visa, "2026-10-09")).toBe("2026-10");
    const confirmada = { ...visa, cierres: { "2026-10": 7 } };
    expect(resumenDe(confirmada, "2026-10-09")).toBe("2026-11");
    expect(vencimiento(confirmada, "2026-10")).toBe("2026-10-17");
  });
  it("marca como dudosas solo las compras entre el 5 y el 10 sin cierre confirmado", () => {
    expect(esDudosa(visa, "2026-10-05")).toBe(false);
    expect(esDudosa(visa, "2026-10-07")).toBe(true);
    expect(esDudosa(visa, "2026-10-11")).toBe(false);
    expect(esDudosa({ ...visa, cierres: { "2026-10": 8 } }, "2026-10-07")).toBe(false);
  });
  it("reparte las cuotas en resúmenes consecutivos", () => {
    const q = cuotasDe(visa, mov({ cuentaId: "v", usd: 360, monto: 360, cuotas: 3 }));
    expect(q.map(x => [x.periodo, x.usd])).toEqual([["2026-10", 120], ["2026-11", 120], ["2026-12", 120]]);
  });
  it("el resumen suma cuotas y compras de un pago", () => {
    const ms = [
      mov({ cuentaId: "v", usd: 360, cuotas: 3, fecha: "2026-08-20" }), // cuota 2 en octubre
      mov({ cuentaId: "v", usd: 50, fecha: "2026-09-20" }),
      mov({ cuentaId: "otra", usd: 999, fecha: "2026-09-20" }),
    ];
    const r = resumen(visa, ms, "2026-10");
    expect(r.total).toBe(170);
    expect(r.enCuotas).toBe(120);
  });
});

describe("recurrentes", () => {
  const alquiler: Recurrente = { id: "r", nombre: "Alquiler", tipo: "gasto", categoriaId: "casa", cuentaId: "c", monto: 400, moneda: "EUR", clase: "fijo", frecuencia: "mensual", dia: 31, inicio: "2026-01-01", modo: "avisar", activo: true };

  it("el día 31 cae el último día en meses cortos", () => {
    expect(instanciasDelMes(alquiler, "2026-09")[0].fecha).toBe("2026-09-30");
    expect(fechaEnMes("2026-02", 31)).toBe("2026-02-28");
  });
  it("semanal: una instancia por cada martes", () => {
    const psico = { ...alquiler, frecuencia: "semanal" as const, dia: 2 };
    expect(instanciasDelMes(psico, "2026-09").map(i => i.clave)).toEqual(["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"]);
  });
  it("respeta los meses salteados y la fecha de fin", () => {
    expect(instanciasDelMes({ ...alquiler, saltear: ["2026-09"] }, "2026-09")).toEqual([]);
    expect(instanciasDelMes({ ...alquiler, fin: "2026-08-31" }, "2026-09")).toEqual([]);
  });
  it("pagos parciales: pagaste una parte y falta el resto", () => {
    const i = instanciasDelMes(alquiler, "2026-09")[0];
    const pagos = [mov({ recurrenteId: "r", periodo: "2026-09", monto: 200, moneda: "EUR", fecha: "2026-09-15" })];
    const e = estadoDe(i, pagos, 0.88);
    expect(e.estado).toBe("parcial");
    expect(e.falta).toBe(200);
    const completo = estadoDe(i, [...pagos, mov({ recurrenteId: "r", periodo: "2026-09", monto: 200, moneda: "EUR", fecha: "2026-09-25" })], 0.88);
    expect(completo.estado).toBe("cargado");
  });
  it("un pago en otra moneda se compara pasándolo por USD", () => {
    const i = instanciasDelMes(alquiler, "2026-09")[0];
    const e = estadoDe(i, [mov({ recurrenteId: "r", periodo: "2026-09", monto: 250, moneda: "USD", usd: 250 })], 0.84);
    expect(e.pagado).toBe(210);
    expect(e.estado).toBe("parcial");
  });
  it("variable: estima con el promedio de las últimas 3 veces", () => {
    const expensas = { ...alquiler, id: "e", clase: "variable" as const, monto: 50, moneda: "ARS" as const, dia: 10 };
    const hist = [["2026-06", 90000], ["2026-07", 100000], ["2026-08", 110000]].map(([p, m]) =>
      mov({ recurrenteId: "e", periodo: p as string, monto: m as number, moneda: "ARS" }));
    const e = estadoDe(instanciasDelMes(expensas, "2026-09")[0], hist, 1500);
    expect(e.estimado).toBe(true);
    expect(e.esperado).toBe(100000);
    expect(e.estado).toBe("por-cargar");
  });
});

describe("sugerencias", () => {
  const casa = { id: "casa", nombre: "Casa", tipo: "gasto" as const, icono: "home", color: "#000", orden: 0 };
  const meses = [1, 2, 3, 4, 5, 6].map(i => sumarMeses("2026-09", -i));

  it("propone fijo si el monto se repite todos los meses", () => {
    const ms = meses.map(p => mov({ categoriaId: "casa", fecha: `${p}-01`, usd: 478 }));
    expect(sugerirClase(casa, ms)?.clase).toBe("fijo");
  });
  it("propone variable si el monto cambia", () => {
    const ms = meses.map((p, i) => mov({ categoriaId: "casa", fecha: `${p}-05`, usd: 90 + i * 45 }));
    const s = sugerirClase(casa, ms)!;
    expect(s.clase).toBe("variable");
    expect(s.porque).toContain("Entre");
  });
  it("objetivo sugerido: 10% menos que el promedio, redondeado", () => {
    const ms = meses.slice(0, 3).map(p => mov({ categoriaId: "casa", fecha: `${p}-05`, usd: 505 }));
    expect(sugerirObjetivo(casa, ms)?.objetivo).toBe(450);
  });
  it("detecta lo que cargaste una vez por mes con el mismo comentario", () => {
    const ms = meses.slice(0, 3).map((p, i) => mov({ categoriaId: "casa", fecha: `${p}-10`, comentario: "Expensas", monto: 90000 + i * 5000, moneda: "ARS" }));
    const [s] = detectarRecurrentes(ms, [casa], [], new Set());
    expect(s.nombre).toBe("Expensas");
    expect(s.clase).toBe("variable");
    expect(s.dia).toBe(10);
  });
});

describe("fechas y números", () => {
  it("la semana arranca el lunes", () => {
    expect(rango("semana", "2026-09-26")).toEqual(["2026-09-21", "2026-09-27"]);
  });
  it("lee montos con coma o punto", () => {
    expect(leerNumero("1.234,56")).toBe(1234.56);
    expect(leerNumero("2,40")).toBe(2.4);
    expect(leerNumero("18500")).toBe(18500);
    expect(leerNumero("12.5")).toBe(12.5);
    expect(leerNumero("18.500")).toBe(18500);
    expect(leerNumero("1.234.567")).toBe(1234567);
    expect(leerNumero("1.234.567,5")).toBe(1234567.5);
  });
});

describe("vincular un cobro con su recurrente", () => {
  const nube: Recurrente = { id: "cl", nombre: "Nube", tipo: "gasto", categoriaId: "sus", cuentaId: "mc", monto: 100, moneda: "USD", clase: "fijo", frecuencia: "mensual", dia: 21, inicio: "2026-09-01", modo: "avisar", activo: true };
  const gym: Recurrente = { ...nube, id: "gy", nombre: "Gym", categoriaId: "dep", monto: 30, moneda: "EUR", dia: 8 };
  it("mismo mes, cuenta y categoría, con monto parecido; compara en USD si la moneda difiere", () => {
    expect(recurrenteDe(mov({ cuentaId: "mc", categoriaId: "sus", monto: 100, moneda: "USD", usd: 100, fecha: "2026-10-21" }), [nube, gym], [], () => 1)).toEqual({ recurrenteId: "cl", periodo: "2026-10" });
    expect(recurrenteDe(mov({ cuentaId: "mc", categoriaId: "dep", monto: 34.88, moneda: "USD", usd: 34.88, fecha: "2026-10-08" }), [nube, gym], [], () => 0.86)).toEqual({ recurrenteId: "gy", periodo: "2026-10" });
  });
  it("no vincula si esa instancia ya está pagada o si el monto no se parece", () => {
    const pagado = mov({ id: "ya", recurrenteId: "cl", periodo: "2026-10" });
    expect(recurrenteDe(mov({ cuentaId: "mc", categoriaId: "sus", monto: 100, moneda: "USD", usd: 100, fecha: "2026-10-21" }), [nube], [pagado], () => 1)).toBeNull();
    expect(recurrenteDe(mov({ cuentaId: "mc", categoriaId: "sus", monto: 20, moneda: "USD", usd: 20, fecha: "2026-10-21" }), [nube], [], () => 1)).toBeNull();
  });
});

describe("un recurrente cargado como gasto común", () => {
  const base: Recurrente = { id: "gas", nombre: "Gas", tipo: "gasto", categoriaId: "casa", cuentaId: "galicia", monto: 20000, moneda: "ARS", clase: "variable", frecuencia: "mensual", dia: 9, inicio: "2026-09-01", modo: "avisar", activo: true };
  const luz: Recurrente = { ...base, id: "luz", nombre: "Luz", monto: 30000, dia: 8 };
  const insts = [base, luz].map(r => estadoDe(instanciasDelMes(r, "2026-10")[0], [], 1545));

  it("sugiere cada gasto para el recurrente al que más se parece, uno por recurrente", () => {
    const gas = mov({ id: "g", categoriaId: "casa", cuentaId: "revolut", monto: 21000, moneda: "ARS", usd: 13.6, fecha: "2026-10-09" });
    const luzPago = mov({ id: "l", categoriaId: "casa", cuentaId: "galicia", monto: 29500, moneda: "ARS", usd: 19, fecha: "2026-10-08" });
    const s = sugerirVinculos(insts, [gas, luzPago], () => 1545, () => false);
    expect([s.get("gas2026-10")?.id, s.get("luz2026-10")?.id]).toEqual(["g", "l"]);
  });
  it("si el comentario lo nombra, lo reconoce aunque esté en otra categoría", () => {
    const m = mov({ categoriaId: "otros", comentario: "pago gas", monto: 25000, moneda: "ARS", usd: 16, fecha: "2026-10-10" });
    expect(candidatos(insts[0], [m], 1545)).toHaveLength(1);
    expect(esClaro(m, insts[0])).toBe(true);
  });
  it("no sugiere gastos de otro mes, ya vinculados o descartados", () => {
    const otroMes = mov({ categoriaId: "casa", monto: 20000, moneda: "ARS", fecha: "2026-11-09" });
    const vinculado = mov({ categoriaId: "casa", monto: 20000, moneda: "ARS", fecha: "2026-10-09", recurrenteId: "x" });
    const libre = mov({ id: "d", categoriaId: "casa", monto: 20000, moneda: "ARS", fecha: "2026-10-09" });
    expect(sugerirVinculos(insts, [otroMes, vinculado, libre], () => 1545, (m, r) => m === "d" && r === "gas").get("gas2026-10")).toBeUndefined();
  });
});

it("prefiere la misma moneda aunque la cuenta sea otra", () => {
  const gas: Recurrente = { id: "gas", nombre: "Gas", tipo: "gasto", categoriaId: "casa", cuentaId: "galicia", monto: 20000, moneda: "ARS", clase: "variable", frecuencia: "mensual", dia: 9, inicio: "2026-09-01", modo: "avisar", activo: true };
  const celular: Recurrente = { ...gas, id: "cel", nombre: "Celular", cuentaId: "revolut", monto: 10, moneda: "EUR", clase: "fijo", dia: 7 };
  const tasas: Record<string, number> = { gas: 1545, cel: 0.878 };
  const insts = [gas, celular].map(r => estadoDe(instanciasDelMes(r, "2026-10")[0], [], tasas[r.id]));
  const m = mov({ id: "x", categoriaId: "casa", cuentaId: "revolut", monto: 21000, moneda: "ARS", usd: 13.6, fecha: "2026-10-09" });
  const s = sugerirVinculos(insts, [m], r => tasas[r.id], () => false);
  expect([s.get("gas2026-10")?.id, s.get("cel2026-10")]).toEqual(["x", undefined]);
});

it("un mes marcado en 0 queda resuelto sin pago", () => {
  const r: Recurrente = { id: "exp", nombre: "Expensas", tipo: "gasto", categoriaId: "casa", cuentaId: "galicia", monto: 150000, moneda: "ARS", clase: "variable", frecuencia: "mensual", dia: 9, inicio: "2026-09-01", modo: "avisar", activo: true, enCero: ["2026-10"] };
  const e = estadoDe(instanciasDelMes(r, "2026-10")[0], [], 1545);
  expect([e.estado, e.cero, e.esperado, e.falta]).toEqual(["cargado", true, 0, 0]);
  expect(candidatos(e, [mov({ categoriaId: "casa", monto: 150000, moneda: "ARS", fecha: "2026-10-09" })], 1545)).toEqual([]);
});

it("recurrentes por mes en USD: fijo, variable con estimado, semanal y anual", async () => {
  const { mensualEnUsd } = await import("./recurrentes");
  const base: Recurrente = { id: "a", nombre: "Alquiler", tipo: "gasto", categoriaId: "casa", cuentaId: "rev", monto: 400, moneda: "EUR", clase: "fijo", frecuencia: "mensual", dia: 24, inicio: "2026-01-01", modo: "avisar", activo: true };
  expect(mensualEnUsd(base, [], 0.8)).toBe(500);
  expect(mensualEnUsd({ ...base, frecuencia: "anual", mes: 3 }, [], 0.8)).toBe(41.67);
  expect(mensualEnUsd({ ...base, frecuencia: "semanal", dia: 2, monto: 12 }, [], 1)).toBe(52);
  const exp = { ...base, id: "e", clase: "variable" as const, moneda: "ARS" as const, monto: 1 };
  const pagos = ["2026-06", "2026-07", "2026-08"].map((p, i) => mov({ recurrenteId: "e", periodo: p, monto: 150000 + i * 15000, moneda: "ARS" }));
  expect(mensualEnUsd(exp, pagos, 1500)).toBe(110);
  expect(mensualEnUsd({ ...base, frecuencia: "una-vez" }, [], 1)).toBeNull();
});
