import { db, leerAjuste, guardarAjuste } from "../db";
import type { Cotizacion, Dolar, Moneda, Movimiento } from "../tipos";
import { hoy } from "./fecha";
import { redondear } from "./formato";

/* Cuántas unidades de cada moneda hacen 1 USD, del día del gasto.
   - EUR: el Banco Central Europeo (frankfurter).
   - ARS: blue u oficial, venta (argentinadatos para días pasados, dolarapi para hoy).
   Sin conexión se guarda sin convertir y se completa después. */

type Cache = Record<string, number>; // "EUR|2026-09-12" → 0.86

async function cache(): Promise<Cache> {
  return leerAjuste<Cache>("cotizaciones", {});
}

async function pedir(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function tasaEur(fecha: string): Promise<number> {
  const cuando = fecha >= hoy() ? "latest" : fecha;
  const j = await pedir(`https://api.frankfurter.dev/v1/${cuando}?base=USD&symbols=EUR`);
  return j.rates.EUR;
}

async function tasaArs(fecha: string, dolar: Dolar): Promise<number> {
  if (fecha >= hoy()) {
    const j = await pedir(`https://dolarapi.com/v1/dolares/${dolar}`);
    return j.venta;
  }
  const [a, m, d] = fecha.split("-");
  // Fin de semana o feriado no hay cotización: se busca el último día hábil.
  for (let i = 0; i < 6; i++) {
    const f = new Date(Number(a), Number(m) - 1, Number(d) - i);
    const ruta = `${f.getFullYear()}/${String(f.getMonth() + 1).padStart(2, "0")}/${String(f.getDate()).padStart(2, "0")}`;
    try {
      const j = await pedir(`https://api.argentinadatos.com/v1/cotizaciones/dolares/${dolar}/${ruta}`);
      if (j?.venta) return j.venta;
    } catch { /* probar el día anterior */ }
  }
  throw new Error("sin cotización");
}

export async function cotizar(moneda: Moneda, fecha: string, dolar: Dolar): Promise<Cotizacion | null> {
  if (moneda === "USD") return { tasa: 1, fuente: "USD", fecha };
  const clave = `${moneda}|${moneda === "ARS" ? dolar + "|" : ""}${fecha}`;
  const c = await cache();
  const fuente = moneda === "EUR" ? "BCE" : dolar === "blue" ? "blue" : "oficial";
  const pasada = fecha < hoy();
  if (c[clave] && pasada) return { tasa: c[clave], fuente, fecha };
  try {
    const tasa = moneda === "EUR" ? await tasaEur(fecha) : await tasaArs(fecha, dolar);
    // Días pasados: su cotización ya no cambia y se guarda. Hoy (o una fecha futura)
    // es la "última": la que se usa para estimar lo que todavía no pasó.
    if (pasada) await db.transaction("rw", db.ajustes, async () => guardarAjuste("cotizaciones", { ...(await cache()), [clave]: tasa }));
    else await guardarAjuste(`ultima|${moneda}|${moneda === "ARS" ? dolar : ""}`, tasa);
    return { tasa, fuente, fecha };
  } catch {
    return null;
  }
}

/** Para importar historia: trae de una vez las series en lugar de pedir día por día. */
export async function precargarHistoria(fechas: string[]) {
  if (!fechas.length) return;
  const orden = [...fechas].sort();
  const c = await cache();
  try {
    const j = await pedir(`https://api.frankfurter.dev/v1/${orden[0]}..${orden[orden.length - 1]}?base=USD&symbols=EUR`);
    const dias = Object.keys(j.rates).sort();
    // Los días sin dato (fines de semana) toman el hábil anterior.
    for (const f of orden) {
      const previo = dias.filter(d => d <= f).pop() ?? dias[0];
      if (previo) c[`EUR|${f}`] = j.rates[previo].EUR;
    }
  } catch { /* se intentará por día */ }
  for (const dolar of ["blue", "oficial"] as const) {
    try {
      const serie: { fecha: string; venta: number }[] = await pedir(`https://api.argentinadatos.com/v1/cotizaciones/dolares/${dolar}`);
      const porFecha = new Map(serie.map(s => [s.fecha, s.venta]));
      const dias = [...porFecha.keys()].sort();
      for (const f of orden) {
        const previo = dias.filter(d => d <= f).pop();
        if (previo) c[`ARS|${dolar}|${f}`] = porFecha.get(previo)!;
      }
    } catch { /* idem */ }
  }
  await guardarAjuste("cotizaciones", c);
}

/** La última que se consiguió, para mostrar el "≈" mientras escribís sin conexión. */
export async function ultimaTasa(moneda: Moneda, dolar: Dolar): Promise<number | null> {
  if (moneda === "USD") return 1;
  return leerAjuste<number | null>(`ultima|${moneda}|${moneda === "ARS" ? dolar : ""}`, null);
}

export const aUsd = (monto: number, tasa: number) => redondear(monto / tasa);

/** Completa los movimientos que se guardaron sin conexión. */
export async function completarPendientes() {
  const sin = await db.movimientos.filter(m => m.usd == null).toArray();
  if (!sin.length) return 0;
  const cuentas = new Map((await db.cuentas.toArray()).map(c => [c.id, c]));
  let n = 0;
  for (const m of sin) {
    const cot = await cotizar(m.moneda, m.fecha, cuentas.get(m.cuentaId)?.dolar ?? "blue");
    if (!cot) break;
    await db.movimientos.update(m.id, { usd: aUsd(m.monto, cot.tasa), cotizacion: cot } as Partial<Movimiento>);
    n++;
  }
  return n;
}
