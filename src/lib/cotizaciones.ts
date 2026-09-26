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

/** `memo`: caché en memoria (importaciones). Si se pasa, no se lee ni escribe la base
 *  en cada llamada: quien importa guarda el caché una vez al final. */
export async function cotizar(moneda: Moneda, fecha: string, dolar: Dolar, memo?: Cache): Promise<Cotizacion | null> {
  if (moneda === "USD") return { tasa: 1, fuente: "USD", fecha };
  const clave = `${moneda}|${moneda === "ARS" ? dolar + "|" : ""}${fecha}`;
  const c = memo ?? await cache();
  const fuente = moneda === "EUR" ? "BCE" : dolar === "blue" ? "blue" : "oficial";
  const pasada = fecha < hoy();
  if (c[clave] && pasada) return { tasa: c[clave], fuente, fecha };
  try {
    const tasa = moneda === "EUR" ? await tasaEur(fecha) : await tasaArs(fecha, dolar);
    // Días pasados: su cotización ya no cambia y se guarda. Hoy (o una fecha futura)
    // es la "última": la que se usa para estimar lo que todavía no pasó.
    if (pasada && memo) memo[clave] = tasa;
    else if (pasada) await db.transaction("rw", db.ajustes, async () => guardarAjuste("cotizaciones", { ...(await cache()), [clave]: tasa }));
    else await guardarAjuste(`ultima|${moneda}|${moneda === "ARS" ? dolar : ""}`, tasa);
    return { tasa, fuente, fecha };
  } catch {
    return null;
  }
}

/** Para importar historia: trae de una vez las series en lugar de pedir día por día. */
/** Para importar historia: trae de una vez las series en lugar de pedir día por día,
 *  y las deja en `memo` (el caché en memoria de la importación). Los días sin dato
 *  (fines de semana, feriados) toman el hábil anterior. */
export async function precargarHistoria(fechas: string[], memo: Cache) {
  const orden = [...new Set(fechas)].sort();
  if (!orden.length) return;
  // Recorre las fechas pedidas y la serie juntas, en orden: lineal.
  const completar = (serie: [string, number][], clave: (f: string) => string) => {
    serie.sort((a, b) => a[0].localeCompare(b[0]));
    let k = 0, ultimo: number | null = serie[0]?.[1] ?? null;
    for (const f of orden) {
      while (k < serie.length && serie[k][0] <= f) ultimo = serie[k++][1];
      if (ultimo != null) memo[clave(f)] = ultimo;
    }
  };
  try {
    const j = await pedir(`https://api.frankfurter.dev/v1/${orden[0]}..${orden[orden.length - 1]}?base=USD&symbols=EUR`);
    completar(Object.entries(j.rates as Record<string, { EUR: number }>).map(([d, r]) => [d, r.EUR]), f => `EUR|${f}`);
  } catch { /* se intentará por día */ }
  for (const dolar of ["blue", "oficial"] as const) {
    try {
      const serie: { fecha: string; venta: number }[] = await pedir(`https://api.argentinadatos.com/v1/cotizaciones/dolares/${dolar}`);
      completar(serie.map(x => [x.fecha, x.venta]), f => `ARS|${dolar}|${f}`);
    } catch { /* idem */ }
  }
}

/** El caché guardado, para trabajar en memoria durante una importación. */
export const leerCache = cache;
export const guardarCache = (c: Cache) => guardarAjuste("cotizaciones", c);

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
