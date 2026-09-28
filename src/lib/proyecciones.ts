import type { Moneda, Movimiento, Proyeccion, Recurrente } from "../tipos";
import { recurrentesDelMes, suma } from "./analisis";
import { periodoDe, periodoHoy, sumarMeses } from "./fecha";
import { redondear } from "./formato";

/* Proyecciones: gastos que todavía no pasaron. Los "seguros" siempre suman; los
   "caprichos", solo si están prendidos. Un rango ("entre 150 y 250") suma el medio
   en los totales y muestra de cuánto a cuánto. Todo en USD con la cotización de hoy. */

export type TasaMoneda = (m: Moneda) => number | null;

export interface EnUsd { min: number; max: number; medio: number }

export function usdDeProyeccion(p: Proyeccion, tasa: TasaMoneda): EnUsd {
  const t = tasa(p.moneda);
  if (!t) return { min: 0, max: 0, medio: 0 };
  const min = p.monto / t, max = (p.montoMax && p.montoMax > p.monto ? p.montoMax : p.monto) / t;
  return { min: redondear(min), max: redondear(max), medio: redondear((min + max) / 2) };
}

/** Si suma en la proyección: los seguros siempre; los caprichos, prendidos. */
export const cuenta = (p: Proyeccion) => p.clase === "seguro" || p.activa;

export interface MesProyectado {
  periodo: string;
  /** Lo gastado ese mes y los recurrentes de gasto que faltan. */
  base: number;
  seguros: number;
  /** Caprichos prendidos. */
  caprichos: number;
  /** Todos los caprichos, prendidos o no. */
  caprichosTodos: number;
  total: number;
  /** De cuánto a cuánto, si hay rangos. */
  min: number;
  max: number;
}

export function mesProyectado(periodo: string, movs: Movimiento[], recs: Recurrente[], proys: Proyeccion[], tasaRec: (r: Recurrente) => number | null, tasa: TasaMoneda): MesProyectado {
  const gastado = suma(movs.filter(m => m.tipo === "gasto" && periodoDe(m.fecha) === periodo));
  const faltan = recurrentesDelMes(recs, movs, periodo, tasaRec)
    .filter(i => i.rec.tipo === "gasto" && i.estado !== "cargado")
    .reduce((s, i) => { const t = tasaRec(i.rec); return s + (t ? i.falta / t : 0); }, 0);
  const base = redondear(gastado + faltan);
  const delMes = proys.filter(p => p.periodo === periodo);
  const sumar = (ps: Proyeccion[], k: keyof EnUsd) => ps.reduce((s, p) => s + usdDeProyeccion(p, tasa)[k], 0);
  const seguros = delMes.filter(p => p.clase === "seguro");
  const prendidos = delMes.filter(p => p.clase === "capricho" && p.activa);
  const suman = [...seguros, ...prendidos];
  return {
    periodo, base,
    seguros: redondear(sumar(seguros, "medio")),
    caprichos: redondear(sumar(prendidos, "medio")),
    caprichosTodos: redondear(sumar(delMes.filter(p => p.clase === "capricho"), "medio")),
    total: redondear(base + sumar(suman, "medio")),
    min: redondear(base + sumar(suman, "min")),
    max: redondear(base + sumar(suman, "max")),
  };
}

/** Lo que suma cada categoría ese mes por las proyecciones que cuentan (USD). */
export function proyectadoPorCategoria(periodo: string, proys: Proyeccion[], tasa: TasaMoneda) {
  const out = new Map<string, number>();
  for (const p of proys) if (p.periodo === periodo && cuenta(p)) out.set(p.categoriaId, redondear((out.get(p.categoriaId) ?? 0) + usdDeProyeccion(p, tasa).medio));
  return out;
}

/** El promedio de gasto de los últimos 3 meses completos (con datos). */
export function promedioGasto(movs: Movimiento[]) {
  const meses = [1, 2, 3].map(k => sumarMeses(periodoHoy(), -k)).map(p => suma(movs.filter(m => m.tipo === "gasto" && periodoDe(m.fecha) === p))).filter(x => x > 0);
  return meses.length ? redondear(meses.reduce((a, b) => a + b, 0) / meses.length) : null;
}
