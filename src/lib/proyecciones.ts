import type { Moneda, Movimiento, Proyeccion, Tipo } from "../tipos";
import { periodoDe, periodoHoy, sumarMeses } from "./fecha";
import { redondear } from "./formato";

/* Proyecciones: gastos o ingresos que todavía no pasaron. Cada una se prende o se
   apaga; las prendidas suman al mes. Un rango ("entre 150 y 250") suma el medio y
   dibuja una franja del mínimo al máximo. Todo en USD con la cotización de hoy.

   El "normal" de cada mes es tu promedio de los últimos 3 meses completos; el mes
   en curso usa lo real si ya lo pasó. */

export type TasaMoneda = (m: Moneda) => number | null;
export type Vista = Tipo | "queda";

export interface EnUsd { min: number; max: number; medio: number }

export function usdDeProyeccion(p: Proyeccion, tasa: TasaMoneda): EnUsd {
  const t = tasa(p.moneda);
  if (!t) return { min: 0, max: 0, medio: 0 };
  const min = p.monto / t, max = (p.montoMax && p.montoMax > p.monto ? p.montoMax : p.monto) / t;
  return { min: redondear(min), max: redondear(max), medio: redondear((min + max) / 2) };
}

const totalDelMes = (movs: Movimiento[], tipo: Tipo, periodo: string) =>
  movs.reduce((s, m) => s + (m.tipo === tipo && periodoDe(m.fecha) === periodo ? m.usd ?? 0 : 0), 0);

/** El promedio de los últimos 3 meses completos (solo los que tienen datos). */
export function promedio(movs: Movimiento[], tipo: Tipo) {
  const meses = [1, 2, 3].map(k => totalDelMes(movs, tipo, sumarMeses(periodoHoy(), -k))).filter(x => x > 0);
  return meses.length ? redondear(meses.reduce((a, b) => a + b, 0) / meses.length) : 0;
}

export interface PuntoMes { periodo: string; normal: number; min: number; medio: number; max: number }

/** Una serie por mes: el normal y con las proyecciones prendidas de ese tipo. */
function serieDe(meses: string[], movs: Movimiento[], proys: Proyeccion[], tasa: TasaMoneda, tipo: Tipo): PuntoMes[] {
  const prom = promedio(movs, tipo);
  return meses.map(periodo => {
    const normal = redondear(periodo === periodoHoy() ? Math.max(prom, totalDelMes(movs, tipo, periodo)) : prom);
    let min = 0, medio = 0, max = 0;
    for (const p of proys) if (p.activa && p.tipo === tipo && p.periodo === periodo) {
      const u = usdDeProyeccion(p, tasa);
      min += u.min; medio += u.medio; max += u.max;
    }
    return { periodo, normal, min: redondear(normal + min), medio: redondear(normal + medio), max: redondear(normal + max) };
  });
}

/** Los puntos del gráfico. "Lo que queda" = ingresos − gastos: su peor caso es el
 *  mínimo de ingresos menos el máximo de gastos. */
export function serie(vista: Vista, meses: string[], movs: Movimiento[], proys: Proyeccion[], tasa: TasaMoneda): PuntoMes[] {
  if (vista !== "queda") return serieDe(meses, movs, proys, tasa, vista);
  const g = serieDe(meses, movs, proys, tasa, "gasto"), i = serieDe(meses, movs, proys, tasa, "ingreso");
  return meses.map((periodo, k) => ({
    periodo,
    normal: redondear(i[k].normal - g[k].normal),
    min: redondear(i[k].min - g[k].max),
    medio: redondear(i[k].medio - g[k].medio),
    max: redondear(i[k].max - g[k].min),
  }));
}

/** Lo proyectado (prendido) de cada categoría ese mes, separado en seguro y opcional. */
export function proyectadoPorCategoria(periodo: string, tipo: Tipo, proys: Proyeccion[], tasa: TasaMoneda) {
  const out = new Map<string, { seguro: number; opcional: number }>();
  for (const p of proys) {
    if (!p.activa || p.tipo !== tipo || p.periodo !== periodo) continue;
    const x = out.get(p.categoriaId) ?? { seguro: 0, opcional: 0 };
    x[p.clase] = redondear(x[p.clase] + usdDeProyeccion(p, tasa).medio);
    out.set(p.categoriaId, x);
  }
  return out;
}
