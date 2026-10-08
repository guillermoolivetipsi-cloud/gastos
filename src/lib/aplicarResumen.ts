import { db, guardarAjuste, leerAjuste, nuevoId } from "../db";
import type { Datos } from "../datos";
import type { Categoria, Cuenta, Movimiento, Recurrente } from "../tipos";
import { aprender, type Fila } from "./conciliar";
import { aUsd, cotizar } from "./cotizaciones";
import { periodoDe } from "./fecha";
import { redondear } from "./formato";
import { recurrenteDe } from "./recurrentes";

/* Guardar un resumen de tarjeta ya revisado: agrega lo que faltaba, corrige cuenta o
   moneda de lo que estaba mal cargado, vincula cobros con sus recurrentes, aprende
   los comercios y registra el cierre real. Primero lo que necesita la red, después
   todo en una sola transacción: o entra el resumen entero, o nada. */

export interface ParaAplicar {
  filas: Fila[];
  aplicar: Record<number, boolean>;
  /** Categoría elegida para cada fila que faltaba. */
  cats: Record<number, string>;
  tarjeta: Cuenta;
  cierre: string;
  vence: string;
  datos: Pick<Datos, "movimientos" | "recurrentes" | "categorias" | "tasaRec">;
}

/** Una compra en otra moneda (euros) que ya estaba cargada: toma los dólares que
 *  cobró el banco, que son los que salen de verdad. No cambia monto ni moneda (lo que
 *  viaja a Finanzas), así que no la marca como modificada. */
function cambioDelBanco(f: Fila): Partial<Movimiento> {
  const c = f.consumo, m = f.mov;
  if (!m || c.columna !== "USD" || !c.usd || m.moneda === "USD" || m.moneda !== c.moneda) return {};
  if (m.usd === c.usd && m.cotizacion?.fuente === "resumen") return {};
  return { usd: c.usd, cotizacion: { tasa: redondear(c.importe / c.usd, 6), fuente: "resumen", fecha: c.fecha } };
}

export async function aplicarResumen({ filas, aplicar, cats, tarjeta, cierre, vence, datos: d }: ParaAplicar) {
  const ahora = new Date().toISOString();
  // Lo anterior al primer movimiento de la app ya lo tiene Finanzas (venía de la
  // app anterior): se agrega marcado como exportado para no duplicarlo allá.
  let primera = "9999";
  for (const m of d.movimientos) if (m.fecha < primera) primera = m.fecha;
  const tasaRec: (r: Recurrente) => number | null = d.tasaRec;
  // 1) Primero lo que necesita la red (cotizaciones de los consumos en pesos)…
  const cots = new Map<number, Awaited<ReturnType<typeof cotizar>>>();
  for (const [i, f] of filas.entries())
    if (aplicar[i] && (f.tipo === "falta" || f.tipo === "credito") && f.consumo.columna === "ARS") cots.set(i, await cotizar("ARS", f.consumo.fecha, tarjeta.dolar));
  // Las devoluciones entran como ingreso de la tarjeta, en "Otros ingresos".
  const catsIngreso = d.categorias.filter(c => c.tipo === "ingreso" && !c.archivada);
  const catDevolucion = catsIngreso.find(c => c.nombre === "Otros ingresos") ?? catsIngreso[0];

  // 2) …después se arma todo en memoria…
  const agregados: Movimiento[] = [];
  const cambios: { id: string; changes: Partial<Movimiento> }[] = [];
  for (const [i, f] of filas.entries()) {
    // Un cobro que ya estaba en esta tarjeta y coincide con un recurrente (una suscripción, el gimnasio…) queda como su pago.
    if (f.tipo === "coincide" && f.mov) {
      const ch: Partial<Movimiento> = { ...(f.mov.recurrenteId || f.mov.tipo !== "gasto" ? {} : recurrenteDe(f.mov, d.recurrentes, [...d.movimientos, ...agregados], tasaRec) ?? {}), ...cambioDelBanco(f) };
      if (Object.keys(ch).length) cambios.push({ id: f.mov.id, changes: ch });
    }
    if (!aplicar[i]) continue;
    if (f.tipo === "credito") {
      const c = f.consumo, esArs = c.columna === "ARS";
      const cot = cots.get(i) ?? null;
      const mov: Movimiento = {
        id: nuevoId(), tipo: "ingreso", fecha: c.fecha, monto: Math.abs(c.importe), moneda: esArs ? "ARS" : (c.moneda as Movimiento["moneda"]),
        usd: esArs ? (cot ? aUsd(Math.abs(c.importe), cot.tasa) : null) : c.usd != null ? Math.abs(c.usd) : null,
        cotizacion: esArs ? cot ?? undefined : { tasa: c.usd ? redondear(c.importe / c.usd, 6) : 1, fuente: "resumen", fecha: c.fecha },
        cuentaId: tarjeta.id, categoriaId: catDevolucion?.id ?? "", etiquetas: [], comentario: c.comercio, creado: ahora, modificado: ahora,
        exportado: c.fecha < primera ? ahora : undefined,
      };
      if (!["USD", "EUR", "ARS"].includes(mov.moneda)) { mov.moneda = "USD"; mov.monto = Math.abs(c.usd ?? c.importe); }
      agregados.push(mov);
      continue;
    }
    if (f.tipo === "falta") {
      const c = f.consumo;
      const esArs = c.columna === "ARS";
      const cot = cots.get(i) ?? null;
      const mov: Movimiento = {
        id: nuevoId(), tipo: "gasto", fecha: c.fecha, monto: c.importe, moneda: esArs ? "ARS" : (c.moneda as Movimiento["moneda"]),
        usd: esArs ? (cot ? aUsd(c.importe, cot.tasa) : null) : c.usd,
        cotizacion: esArs ? cot ?? undefined : { tasa: c.usd ? redondear(c.importe / c.usd, 6) : 1, fuente: "resumen", fecha: c.fecha },
        cuentaId: tarjeta.id, categoriaId: cats[i], etiquetas: [], comentario: c.comercio, creado: ahora, modificado: ahora,
        exportado: c.fecha < primera ? ahora : undefined,
      };
      if (!["USD", "EUR", "ARS"].includes(mov.moneda)) { mov.moneda = "USD"; mov.monto = c.usd ?? c.importe; }
      Object.assign(mov, recurrenteDe(mov, d.recurrentes, [...d.movimientos, ...agregados], tasaRec) ?? {});
      agregados.push(mov);
    } else if (f.mov && (f.tipo === "otra-cuenta" || f.tipo === "moneda")) {
      const ch: Partial<Movimiento> = { cuentaId: tarjeta.id, modificado: ahora, ...(f.tipo === "otra-cuenta" ? cambioDelBanco(f) : {}) };
      if (f.tipo === "moneda") Object.assign(ch, { moneda: f.consumo.moneda, usd: f.consumo.usd, cotizacion: { tasa: redondear(f.consumo.importe / (f.consumo.usd ?? f.consumo.importe), 6), fuente: "resumen", fecha: f.consumo.fecha } });
      if (!f.mov.recurrenteId) Object.assign(ch, recurrenteDe({ ...f.mov, cuentaId: tarjeta.id }, d.recurrentes, [...d.movimientos, ...agregados], tasaRec) ?? {});
      cambios.push({ id: f.mov.id, changes: ch });
    }
  }

  // 3) …y se guarda todo junto.
  const p = cierre ? periodoDe(cierre) : null;
  const venceDias = cierre && vence ? Math.max(1, Math.round((new Date(vence).getTime() - new Date(cierre).getTime()) / 864e5)) : tarjeta.venceDias;
  await db.transaction("rw", [db.movimientos, db.cuentas, db.ajustes], async () => {
    await db.movimientos.bulkAdd(agregados);
    await db.movimientos.bulkUpdate(cambios.map(x => ({ key: x.id, changes: x.changes })));
    // Aprende los comercios: los que coincidieron y los que categorizaste.
    const reglas = await leerAjuste<Record<string, string>>("reglasComercio", {});
    await guardarAjuste("reglasComercio", aprender(reglas, filas.map((f, i) => ({ consumo: f.consumo, categoriaId: f.mov?.categoriaId ?? cats[i] })), d.categorias as Categoria[]));
    // El cierre real ordena en qué resumen cae cada compra, y el vencimiento, cuándo se paga.
    if (p) {
      await db.cuentas.where("id").equals(tarjeta.id).modify(c => { c.cierres = { ...(c.cierres ?? {}), [p]: Number(cierre.slice(8)) }; c.venceDias = venceDias; });
      const hechos = await leerAjuste<Record<string, string>>("resumenesCargados", {});
      await guardarAjuste("resumenesCargados", { ...hechos, [`${tarjeta.id}|${p}`]: ahora });
    }
  });
  return { nuevos: agregados.length, corregidos: cambios.filter(x => "cuentaId" in x.changes).length };
}
