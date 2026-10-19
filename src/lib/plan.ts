import type { Categoria, Movimiento, Recurrente } from "../tipos";
import { esRecurrente, usdDe } from "./analisis";
import { leerAjuste } from "../db";

/* El Plan: cómo se reparte lo que entra. Lo decidió Guillermo (octubre 2026):
   Vivir 40% (fijos 50 · variables 40 · libre de culpa 5 · eventuales 5 de Vivir),
   Liquidez 15%, Inversión 40% y Deuda 5%. Vivir sale de los gastos de la app; liquidez,
   inversión y deuda los manda Finanzas por el buzón (CONTRATO-FINANZAS-A-GASTOS.md). */

export interface Reparto {
  vivir: number; liquidez: number; inversion: number; deuda: number;
  vivirPartes: { fijos: number; variables: number; sinCulpa: number; eventuales: number };
}
/** El reparto de arranque; se cambia en Más → Ordenar → Plan (ajuste «plan»). */
export const PLAN: Reparto = {
  vivir: 40, liquidez: 15, inversion: 40, deuda: 5,
  vivirPartes: { fijos: 50, variables: 40, sinCulpa: 5, eventuales: 5 },
};
export const leerReparto = () => leerAjuste<Reparto>("plan", PLAN);
/** Las cuatro partes suman 100, y las cuatro de Vivir también. */
export const repartoValido = (r: Reparto) =>
  r.vivir + r.liquidez + r.inversion + r.deuda === 100 && Object.values(r.vivirPartes).reduce((a, b) => a + b, 0) === 100;

/** Lo que manda Finanzas por mes, en USD. `liquidez` solo cuando haya una cuenta aparte
 *  para eso; mientras tanto la liquidez es lo que quedó. */
export interface Destinos { liquidez?: number; inversion: number; deuda: number }

export interface PlanDelMes {
  periodo: string;
  entro: number;
  vivir: { real: number; fijos: number; variables: number; sinCulpa: number; eventuales: number };
  /** null: Finanzas todavía no mandó ese mes. Si Finanzas no manda liquidez, es lo que
   *  quedó: lo que entró − Vivir − Inversión − Deuda (`liquidezCalculada`). */
  liquidez: number | null;
  liquidezCalculada: boolean;
  /** Con una cuenta de liquidez aparte: lo que quedó suelto en las cuentas. */
  quedo: number | null;
  inversion: number | null;
  /** Lo que manda Finanzas; si no mandó, lo de la categoría «Deuda» de la app. */
  deuda: number;
  /** Cuánto de lo que entró se repartió (null si falta algo de Finanzas o no entró nada). */
  repartido: number | null;
}

const nombre = (c: Categoria | undefined) => (c?.nombre ?? "").trim().toLowerCase();

export function planDelMes(periodo: string, movs: Movimiento[], cats: Categoria[], recs: Recurrente[], destinos: Destinos | undefined): PlanDelMes {
  const porId = new Map(cats.map(c => [c.id, c]));
  const recPorId = new Map(recs.map(r => [r.id, r]));
  const delMes = movs.filter(m => m.fecha.slice(0, 7) === periodo);
  const entro = delMes.filter(m => m.tipo === "ingreso").reduce((s, m) => s + usdDe(m), 0);
  const vivir = { real: 0, fijos: 0, variables: 0, sinCulpa: 0, eventuales: 0 };
  let deudaApp = 0;
  for (const m of delMes) {
    if (m.tipo !== "gasto") continue;
    const cat = porId.get(m.categoriaId), u = usdDe(m);
    // Lo de la categoría «Deuda» es pagar deuda, no vivir.
    if (nombre(cat) === "deuda") { deudaApp += u; continue; }
    vivir.real += u;
    if (m.eventual) vivir.eventuales += u;
    else if (nombre(cat) === "sin culpa") vivir.sinCulpa += u;
    // `fijos` y `variables` guardan recurrentes y no recurrentes (los nombres quedan por el
    // reparto guardado en el ajuste `plan`, que usa esas claves).
    else if (esRecurrente(m, recPorId)) vivir.fijos += u;
    else vivir.variables += u;
  }
  const deuda = destinos ? destinos.deuda : deudaApp;
  const sobra = destinos ? entro - vivir.real - destinos.inversion - destinos.deuda : null;
  const explicita = destinos?.liquidez != null;
  const liquidez = !destinos ? null : explicita ? destinos.liquidez! : sobra;
  const quedo = explicita ? sobra! - destinos!.liquidez! : null;
  const repartido = explicita && entro > 0 ? (vivir.real + destinos!.liquidez! + destinos!.inversion + destinos!.deuda) / entro : null;
  return { periodo, entro, vivir, liquidez, liquidezCalculada: !!destinos && !explicita, quedo, inversion: destinos?.inversion ?? null, deuda, repartido };
}

/** De dónde vino lo que entró ese mes (al tocar «entraron» en el Plan): la clínica (lo que
 *  manda Finanzas), cada recurrente de ingreso por su nombre, y el resto como «Otros
 *  ingresos». Lo más grande primero. */
export function deDondeEntro(periodo: string, movs: Movimiento[], recs: Recurrente[]) {
  const rec = new Map(recs.map(r => [r.id, r.nombre]));
  const t = new Map<string, number>();
  for (const m of movs) {
    if (m.tipo !== "ingreso" || m.fecha.slice(0, 7) !== periodo) continue;
    const n = m.origen === "finanzas" ? "Clínica (Finanzas)" : rec.get(m.recurrenteId ?? "") ?? "Otros ingresos";
    t.set(n, (t.get(n) ?? 0) + usdDe(m));
  }
  return [...t.entries()].map(([nombre, usd]) => ({ nombre, usd })).sort((a, b) => b.usd - a.usd);
}

/** Las categorías que más pesan en Vivir ese mes (sin «Deuda», que no es vivir). */
export function vivirPorCategoria(periodo: string, movs: Movimiento[], cats: Categoria[], cuantas = 4) {
  const porId = new Map(cats.map(c => [c.id, c]));
  const t = new Map<string, number>();
  for (const m of movs) {
    if (m.tipo !== "gasto" || m.fecha.slice(0, 7) !== periodo || nombre(porId.get(m.categoriaId)) === "deuda") continue;
    t.set(m.categoriaId, (t.get(m.categoriaId) ?? 0) + usdDe(m));
  }
  return [...t.entries()].map(([id, usd]) => ({ cat: porId.get(id), usd })).sort((a, b) => b.usd - a.usd).slice(0, cuantas);
}
