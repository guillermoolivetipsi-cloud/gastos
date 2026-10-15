import type { Moneda, Movimiento, Proyeccion, Tipo } from "../tipos";
import { periodoDe, periodoHoy, sumarMeses } from "./fecha";
import { num, redondear } from "./formato";

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

/** Si la proyección cae en ese mes (las de varios meses, del primero al último). */
export const cubre = (p: Proyeccion, periodo: string) => p.periodo <= periodo && periodo <= (p.hasta ?? p.periodo);
/** Cuántos meses le quedan a una proyección. */
export const mesesQueQuedan = (p: Proyeccion) => {
  let n = 0;
  for (let m = p.periodo; m <= (p.hasta ?? p.periodo); m = sumarMeses(m, 1)) n++;
  return n;
};

const totalDelMes = (movs: Movimiento[], tipo: Tipo, periodo: string) =>
  movs.reduce((s, m) => s + (m.tipo === tipo && periodoDe(m.fecha) === periodo ? m.usd ?? 0 : 0), 0);

/** El promedio de los últimos 3 meses completos (solo los que tienen datos). */
export function promedio(movs: Movimiento[], tipo: Tipo) {
  const meses = [1, 2, 3].map(k => totalDelMes(movs, tipo, sumarMeses(periodoHoy(), -k))).filter(x => x > 0);
  return meses.length ? redondear(meses.reduce((a, b) => a + b, 0) / meses.length) : 0;
}

export interface PuntoMes { periodo: string; normal: number; min: number; medio: number; max: number }

/** Una serie por mes: el normal y con las proyecciones prendidas de ese tipo.
 *  En los ingresos, la clínica (lo que llega de Finanzas) va aparte: con la agenda que
 *  manda Finanzas para ese mes (`estimados`, USD) y, si no hay, con su propio promedio.
 *  El resto de los ingresos, con su promedio. */
function serieDe(meses: string[], movs: Movimiento[], proys: Proyeccion[], tasa: TasaMoneda, tipo: Tipo, estimados: Record<string, number> = {}): PuntoMes[] {
  const hoy = periodoHoy();
  const parte = (ms: Movimiento[], periodo: string, prom: number) => (periodo === hoy ? Math.max(prom, totalDelMes(ms, tipo, periodo)) : prom);
  const app = tipo === "ingreso" ? movs.filter(m => m.origen !== "finanzas") : movs;
  const clinica = tipo === "ingreso" ? movs.filter(m => m.origen === "finanzas") : [];
  const promApp = promedio(app, tipo), promClinica = promedio(clinica, tipo);
  return meses.map(periodo => {
    const deClinica = clinica.length || estimados[periodo] != null ? parte(clinica, periodo, estimados[periodo] ?? promClinica) : 0;
    const normal = redondear(parte(app, periodo, promApp) + deClinica);
    let min = 0, medio = 0, max = 0;
    for (const p of proys) if (p.activa && p.tipo === tipo && cubre(p, periodo)) {
      const u = usdDeProyeccion(p, tasa);
      min += u.min; medio += u.medio; max += u.max;
    }
    return { periodo, normal, min: redondear(normal + min), medio: redondear(normal + medio), max: redondear(normal + max) };
  });
}

/** Los puntos del gráfico. "Lo que queda" = ingresos − gastos: su peor caso es el
 *  mínimo de ingresos menos el máximo de gastos. */
export function serie(vista: Vista, meses: string[], movs: Movimiento[], proys: Proyeccion[], tasa: TasaMoneda, estimados: Record<string, number> = {}): PuntoMes[] {
  if (vista !== "queda") return serieDe(meses, movs, proys, tasa, vista, estimados);
  const g = serieDe(meses, movs, proys, tasa, "gasto"), i = serieDe(meses, movs, proys, tasa, "ingreso", estimados);
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
    if (!p.activa || p.tipo !== tipo || !cubre(p, periodo)) continue;
    const x = out.get(p.categoriaId) ?? { seguro: 0, opcional: 0 };
    x[p.clase] = redondear(x[p.clase] + usdDeProyeccion(p, tasa).medio);
    out.set(p.categoriaId, x);
  }
  return out;
}

/** De dónde sale lo que se espera que entre cada mes (la vista Ingresos de Proyecciones):
 *  la clínica (agenda de Finanzas, o su promedio), el resto de los ingresos (su promedio)
 *  y las proyecciones de ingreso prendidas. Suma lo mismo que la línea «con proyecciones». */
export interface DesgloseMes {
  periodo: string; total: number;
  clinica: number; fuenteClinica: "agenda" | "promedio" | null;
  otros: number; proyecciones: { nombre: string; usd: number; sinTasa?: string }[];
}
export function desgloseIngresos(meses: string[], movs: Movimiento[], proys: Proyeccion[], tasa: TasaMoneda, estimados: Record<string, number> = {}): DesgloseMes[] {
  const hoy = periodoHoy();
  const app = movs.filter(m => m.origen !== "finanzas"), clin = movs.filter(m => m.origen === "finanzas");
  const promApp = promedio(app, "ingreso"), promClin = promedio(clin, "ingreso");
  const parte = (ms: Movimiento[], periodo: string, prom: number) => (periodo === hoy ? Math.max(prom, totalDelMes(ms, "ingreso", periodo)) : prom);
  return meses.map(periodo => {
    const hayClinica = clin.length > 0 || estimados[periodo] != null;
    const clinica = hayClinica ? redondear(parte(clin, periodo, estimados[periodo] ?? promClin)) : 0;
    const otros = redondear(parte(app, periodo, promApp));
    const proyecciones = proys.filter(p => p.activa && p.tipo === "ingreso" && cubre(p, periodo)).map(p => ({ nombre: p.nombre, usd: usdDeProyeccion(p, tasa).medio, sinTasa: p.moneda !== "USD" && !tasa(p.moneda) ? `${num(p.monto, 0)} ${p.moneda}` : undefined }));
    const total = redondear(clinica + otros + proyecciones.reduce((s, p) => s + p.usd, 0));
    return { periodo, total, clinica, fuenteClinica: !hayClinica ? null : estimados[periodo] != null ? "agenda" : "promedio", otros, proyecciones };
  });
}
