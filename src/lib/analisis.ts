import type { Categoria, Clase, Cuenta, Descarte, Movimiento, Recurrente } from "../tipos";
import { diasDelMes, diasEntre, fechaEnMes, hoy, periodoDe, periodoHoy, sumarDias, sumarMeses } from "./fecha";
import { agrupar, num, redondear, sinAcentos } from "./formato";
import { esDudosa, fechaCierre, resumenQueVence } from "./tarjeta";
import { estadoDe, instanciasDelMes, pagosPorRecurrente, type EstadoInstancia } from "./recurrentes";

export const usdDe = (m: Movimiento) => m.usd ?? 0;
export const suma = (ms: Movimiento[]) => redondear(ms.reduce((s, m) => s + usdDe(m), 0));

export interface PorCategoria {
  cat: Categoria;
  total: number;
  pct: number;
  n: number;
}

export function porCategoria(movs: Movimiento[], cats: Categoria[]): PorCategoria[] {
  const total = suma(movs);
  const map = agrupar(movs, m => m.categoriaId);
  const porId = new Map(cats.map(c => [c.id, c]));
  return [...map.entries()]
    .map(([id, ms]) => {
      const t = suma(ms);
      return {
        cat: porId.get(id) ?? { id, nombre: "Sin categoría", tipo: ms[0].tipo, icono: "question-mark", color: "#6B6880", orden: 999 },
        total: t, n: ms.length, pct: total ? t / total : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export const claseDe = (c: Categoria | undefined): Clase => c?.clase ?? "variable";

/** La clase confirmada o, mientras tanto, la sugerida. */
export function claseProvisoria(cats: Categoria[], movs: Movimiento[]) {
  const map = new Map(cats.map(c => [c.id, c.clase ?? sugerirClase(c, movs)?.clase ?? "variable"] as [string, Clase]));
  return (c: Categoria | undefined): Clase => (c ? map.get(c.id) : undefined) ?? "variable";
}

/** Qué tan avanzado está el mes: 1 = terminado. Para la marca de "dónde deberías ir hoy". */
export function avanceDelMes(periodo: string) {
  const ph = periodoHoy();
  if (periodo < ph) return 1;
  if (periodo > ph) return 0;
  return Number(hoy().slice(8)) / diasDelMes(periodo);
}

export interface Bloques {
  fijos: { total: number; pagado: number; falta: number };
  variables: { gastado: number; objetivo: number; queda: number; porDia: number | null; dias: number };
}

/** Los dos bloques del resumen del mes. Fijos: lo gastado en categorías fijas más
 *  lo que falta pagar de los recurrentes fijos. Variables: contra la suma de los
 *  objetivos, y cuánto te queda por día. */
export function bloques(periodo: string, gastos: Movimiento[], cats: Categoria[], recs: Recurrente[], pendientes: EstadoInstancia[], tasaUsd: (r: Recurrente) => number | null, clase: (c: Categoria | undefined) => Clase = claseDe): Bloques {
  const porId = new Map(cats.map(c => [c.id, c]));
  const recPorId = new Map(recs.map(r => [r.id, r]));
  // Un pago de un recurrente toma la clase del recurrente (el alquiler es fijo
  // aunque la categoría Casa sea variable por las expensas); el resto, la de su categoría.
  const claseMov = (m: Movimiento) => recPorId.get(m.recurrenteId ?? "")?.clase ?? clase(porId.get(m.categoriaId));
  const fijosPagado = suma(gastos.filter(m => claseMov(m) === "fijo"));
  const faltaFijos = redondear(pendientes
    .filter(e => e.rec.tipo === "gasto" && e.rec.clase === "fijo")
    .reduce((s, e) => { const t = tasaUsd(e.rec); return s + (t ? e.falta / t : 0); }, 0));
  const gastadoVar = suma(gastos.filter(m => claseMov(m) === "variable"));
  const objetivo = cats.filter(c => c.tipo === "gasto" && !c.archivada && clase(c) === "variable").reduce((s, c) => s + (c.objetivo ?? 0), 0);
  const queda = redondear(objetivo - gastadoVar);
  const ph = periodoHoy();
  const dias = periodo === ph ? diasDelMes(periodo) - Number(hoy().slice(8)) + 1 : 0;
  return {
    fijos: { total: redondear(fijosPagado + faltaFijos), pagado: fijosPagado, falta: faltaFijos },
    variables: { gastado: gastadoVar, objetivo, queda, dias, porDia: dias && objetivo ? redondear(Math.max(0, queda) / dias) : null },
  };
}

/* ── Sugerencias ─────────────────────────────────────────────────────────── */

/** Totales por mes (USD) de los últimos `n` meses cerrados. */
function mensuales(movs: Movimiento[], n: number) {
  const hasta = sumarMeses(periodoHoy(), -1);
  const meses = Array.from({ length: n }, (_, i) => sumarMeses(hasta, -i)).reverse();
  const t = new Map(meses.map(p => [p, 0]));
  for (const m of movs) {
    const p = periodoDe(m.fecha);
    if (t.has(p)) t.set(p, t.get(p)! + usdDe(m));
  }
  return meses.map(p => ({ periodo: p, total: redondear(t.get(p)!) }));
}

const cv = (xs: number[]) => {
  const media = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (!media) return 0;
  return Math.sqrt(xs.reduce((s, x) => s + (x - media) ** 2, 0) / xs.length) / media;
};

export interface SugerenciaClase { cat: Categoria; clase: Clase; porque: string }

/** Fijo si aparece casi todos los meses con casi el mismo monto. */
export function sugerirClase(cat: Categoria, movs: Movimiento[]): SugerenciaClase | null {
  const serie = mensuales(movs.filter(m => m.categoriaId === cat.id), 6);
  const con = serie.filter(s => s.total > 0);
  if (con.length < 2) return null;
  const desde = serie.findIndex(s => s.total > 0);
  const presencia = con.length / (serie.length - desde);
  const var_ = cv(con.map(s => s.total));
  const min = Math.min(...con.map(s => s.total)), max = Math.max(...con.map(s => s.total));
  if (con.length >= 3 && presencia >= 0.75 && var_ <= 0.08)
    return { cat, clase: "fijo", porque: min === max ? `Mismo monto los últimos ${con.length} meses` : `Casi el mismo monto los últimos ${con.length} meses (${num(min)}–${num(max)} USD)` };
  return { cat, clase: "variable", porque: `Entre ${num(min)} y ${num(max)} USD por mes` };
}

export interface SugerenciaObjetivo { cat: Categoria; objetivo: number; promedio: number }

/** 10% menos que tu promedio de los últimos 3 meses, redondeado. */
export function sugerirObjetivo(cat: Categoria, movs: Movimiento[]): SugerenciaObjetivo | null {
  const serie = mensuales(movs.filter(m => m.categoriaId === cat.id), 3).filter(s => s.total > 0);
  if (serie.length < 2) return null;
  const promedio = serie.reduce((s, x) => s + x.total, 0) / serie.length;
  const paso = promedio < 100 ? 5 : 10;
  return { cat, promedio: redondear(promedio, 0), objetivo: Math.max(paso, Math.round((promedio * 0.9) / paso) * paso) };
}

export interface SugerenciaRecurrente {
  clave: string;
  nombre: string;
  tipo: Movimiento["tipo"];
  categoriaId: string;
  cuentaId: string;
  monto: number;
  moneda: Movimiento["moneda"];
  clase: Clase;
  dia: number;
  meses: string[];
}

const normal = sinAcentos;

/** Lo que cargaste en al menos 3 de los últimos 4 meses, una vez por mes,
 *  con el mismo comentario o etiqueta (o que es lo único de su categoría). */
export function detectarRecurrentes(movs: Movimiento[], cats: Categoria[], recs: Recurrente[], descartes: Set<string>): SugerenciaRecurrente[] {
  const desde = sumarMeses(periodoHoy(), -4);
  const recientes = movs.filter(m => !m.recurrenteId && periodoDe(m.fecha) >= desde && periodoDe(m.fecha) < periodoHoy());
  const grupos = agrupar(recientes, m => `${m.tipo}|${m.categoriaId}|${normal(m.comentario || m.etiquetas[0] || "")}`);
  const yaHay = new Set(recs.map(r => `${r.categoriaId}|${normal(r.nombre)}`));
  const catNombre = new Map(cats.map(c => [c.id, c.nombre]));
  const out: SugerenciaRecurrente[] = [];
  for (const [k, ms] of grupos) {
    if (descartes.has(`rec|${k}`)) continue;
    const porMes = agrupar(ms, m => periodoDe(m.fecha));
    if (porMes.size < 3 || [...porMes.values()].some(x => x.length > 1)) continue;
    const [, catId, texto] = k.split("|");
    const nombre = texto ? (ms[0].comentario || ms[0].etiquetas[0])! : catNombre.get(catId) ?? "Recurrente";
    if (yaHay.has(`${catId}|${normal(nombre)}`)) continue;
    const orden = ms.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const ultimo = orden[orden.length - 1];
    const dias = orden.map(m => Number(m.fecha.slice(8))).sort((a, b) => a - b);
    out.push({
      clave: k, nombre, tipo: ultimo.tipo, categoriaId: catId, cuentaId: ultimo.cuentaId,
      monto: ultimo.monto, moneda: ultimo.moneda,
      clase: cv(orden.map(m => m.monto)) <= 0.03 ? "fijo" : "variable",
      dia: dias[Math.floor(dias.length / 2)],
      meses: [...porMes.keys()].sort(),
    });
  }
  return out;
}

export interface CambioPrecio { rec: Recurrente; antes: number; ahora: number; clave: string }

/** Un fijo que cambió de monto entre las dos últimas veces. */
export function cambiosDePrecio(recs: Recurrente[], movs: Movimiento[], descartes: Set<string>): CambioPrecio[] {
  const out: CambioPrecio[] = [];
  for (const r of recs.filter(r => r.activo && r.clase === "fijo")) {
    const pagos = (pagosPorRecurrente(movs).get(r.id) ?? []).filter(m => m.moneda === r.moneda);
    const porClave = new Map<string, number>();
    for (const p of pagos) porClave.set(p.periodo!, (porClave.get(p.periodo!) ?? 0) + p.monto);
    const claves = [...porClave.keys()].sort();
    if (claves.length < 2) continue;
    const antes = porClave.get(claves[claves.length - 2])!, ahora = porClave.get(claves[claves.length - 1])!;
    const clave = `precio|${r.id}|${claves[claves.length - 1]}`;
    if (Math.abs(ahora - antes) / antes > 0.01 && !descartes.has(clave)) out.push({ rec: r, antes, ahora, clave });
  }
  return out;
}

export interface CierreDudoso { cuenta: Cuenta; periodo: string; compras: number }

/** Tarjetas con compras entre el 5 y el 10 de un mes cuyo cierre no confirmaste. */
export function cierresDudosos(cuentas: Cuenta[], movs: Movimiento[]): CierreDudoso[] {
  const out: CierreDudoso[] = [];
  // Solo este mes y el anterior: los cierres de meses viejos ya no cambian nada.
  const desde = `${sumarMeses(periodoHoy(), -1)}-01`;
  movs = movs.filter(m => m.fecha >= desde);
  for (const c of cuentas.filter(c => c.esTarjeta && !c.archivada)) {
    const porMes = new Map<string, number>();
    for (const m of movs) if (m.cuentaId === c.id && esDudosa(c, m.fecha) && m.fecha <= hoy())
      porMes.set(periodoDe(m.fecha), (porMes.get(periodoDe(m.fecha)) ?? 0) + 1);
    for (const [periodo, compras] of porMes)
      if (diasEntre(fechaEnMes(periodo, c.cierreDesde ?? 5), hoy()) >= 0) out.push({ cuenta: c, periodo, compras });
  }
  return out;
}

/** Todas las instancias de recurrentes del mes, con su estado. */
export function recurrentesDelMes(recs: Recurrente[], movs: Movimiento[], periodo: string, tasa: (r: Recurrente) => number | null) {
  // Cada instancia mira solo los pagos de su recurrente, no todos los movimientos.
  const pagos = pagosPorRecurrente(movs);
  return recs
    .flatMap(r => instanciasDelMes(r, periodo))
    .map(i => estadoDe(i, pagos.get(i.rec.id) ?? [], tasa(i.rec)))
    // Un pago en partes ya completo solo se muestra en su mes.
    .filter(i => i.rec.frecuencia !== "una-vez" || i.clave === periodo || i.estado !== "cargado")
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export const descartesSet = (ds: Descarte[]) => new Set(ds.map(d => d.clave));

/** Lo que se paga de una tarjeta en `periodo`: el resumen que vence ese mes y, mientras
 *  sea estimado, los recurrentes de esa tarjeta que todavía no se cobraron pero caen
 *  en ese resumen. Única fuente para "Lo que viene" y "Cómo venís". */
export function aPagarTarjeta(c: Cuenta, movs: Movimiento[], recs: Recurrente[], periodo: string, tasa: (r: Recurrente) => number | null) {
  const r = resumenQueVence(c, movs, periodo);
  const desde = sumarDias(fechaCierre(c, sumarMeses(r.periodo, -1)), 1);
  const propios = recs.filter(x => x.cuentaId === c.id && x.tipo === "gasto");
  const insts = [sumarMeses(r.periodo, -1), r.periodo]
    .flatMap(q => recurrentesDelMes(propios, movs, q, tasa))
    .filter(i => i.fecha >= desde && i.fecha <= r.cierre);
  const previsto = redondear(insts.filter(i => i.estado !== "cargado").reduce((s, i) => { const t = tasa(i.rec); return s + (t ? i.esperado / t : 0); }, 0));
  return { resumen: r, desde, insts, previsto, total: redondear(r.total + (r.confirmado ? 0 : previsto)) };
}

/** Los recurrentes de gasto que se pagan desde una cuenta (no tarjeta) y faltan
 *  cargar ese mes, y cuáles ya vencieron. Una sola cuenta para Resumen y Lo que viene. */
export function porCargarDelMes(insts: EstadoInstancia[], cuentas: Cuenta[]) {
  const tarjetas = new Set(cuentas.filter(c => c.esTarjeta).map(c => c.id));
  const todos = insts.filter(i => i.rec.tipo === "gasto" && !tarjetas.has(i.rec.cuentaId) && i.estado !== "cargado");
  const vencidos = todos.filter(i => i.fecha <= hoy());
  return { todos, vencidos };
}
