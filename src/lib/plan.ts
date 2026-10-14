import type { Categoria, Clase, Movimiento, Recurrente } from "../tipos";
import { usdDe } from "./analisis";

/* El Plan: cómo se reparte lo que entra. Lo decidió Guillermo (octubre 2026):
   Vivir 40% (fijos 50 · variables 40 · libre de culpa 5 · eventuales 5 de Vivir),
   Liquidez 15%, Inversión 40% y Deuda 5%. Vivir sale de los gastos de la app; liquidez,
   inversión y deuda los manda Finanzas por el buzón (CONTRATO-FINANZAS-A-GASTOS.md). */

export const PLAN = {
  vivir: 40, liquidez: 15, inversion: 40, deuda: 5,
  vivirPartes: { fijos: 50, variables: 40, sinCulpa: 5, eventuales: 5 },
} as const;

/** Lo que manda Finanzas por mes, en USD. */
export interface Destinos { liquidez: number; inversion: number; deuda: number }

export interface PlanDelMes {
  periodo: string;
  entro: number;
  vivir: { real: number; fijos: number; variables: number; sinCulpa: number; eventuales: number };
  /** null: Finanzas todavía no mandó ese mes. */
  liquidez: number | null;
  inversion: number | null;
  /** Lo que manda Finanzas; si no mandó, lo de la categoría «Deuda» de la app. */
  deuda: number;
  /** Cuánto de lo que entró se repartió (null si falta algo de Finanzas o no entró nada). */
  repartido: number | null;
}

const nombre = (c: Categoria | undefined) => (c?.nombre ?? "").trim().toLowerCase();

export function planDelMes(periodo: string, movs: Movimiento[], cats: Categoria[], recs: Recurrente[], destinos: Destinos | undefined, clase: (c: Categoria | undefined) => Clase): PlanDelMes {
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
    else if ((recPorId.get(m.recurrenteId ?? "")?.clase ?? clase(cat)) === "fijo") vivir.fijos += u;
    else vivir.variables += u;
  }
  const deuda = destinos ? destinos.deuda : deudaApp;
  const repartido = destinos && entro > 0 ? (vivir.real + destinos.liquidez + destinos.inversion + destinos.deuda) / entro : null;
  return { periodo, entro, vivir, liquidez: destinos?.liquidez ?? null, inversion: destinos?.inversion ?? null, deuda, repartido };
}
