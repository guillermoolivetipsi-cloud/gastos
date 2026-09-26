import { db } from "../db";
import type { Cuenta, Movimiento, Recurrente } from "../tipos";
import { cotizar, aUsd } from "./cotizaciones";
import { aFecha, diasDelMes, fechaEnMes, hoy, periodoDe, sumarDias, sumarMeses } from "./fecha";
import { agrupar, redondear, sinAcentos } from "./formato";

/* Un recurrente es algo que se repite: el alquiler, las expensas, un ingreso.
   Cada vez que toca es una "instancia", con su clave:
   - mensual, anual o una vez → el período "2026-10"
   - semanal → la fecha "2026-10-06"
   Los pagos son movimientos comunes con `recurrenteId` y `periodo` = esa clave,
   y puede haber varios (pagos parciales). "Una vez" sirve para un gasto que
   pagás en partes y no se repite. */

export interface Instancia {
  rec: Recurrente;
  clave: string;
  fecha: string;
}

export function instanciasDelMes(r: Recurrente, periodo: string): Instancia[] {
  if (!r.activo) return [];
  const out: Instancia[] = [];
  const dentro = (f: string) => f >= r.inicio && (!r.fin || f <= r.fin);
  if (r.frecuencia === "semanal") {
    for (let d = 1; d <= diasDelMes(periodo); d++) {
      const f = fechaEnMes(periodo, d);
      if (aFecha(f).getDay() === r.dia && dentro(f)) out.push({ rec: r, clave: f, fecha: f });
    }
  } else if (r.frecuencia === "una-vez") {
    if (periodoDe(r.inicio) === periodo) out.push({ rec: r, clave: periodo, fecha: r.inicio });
  } else {
    if (r.frecuencia === "anual" && Number(periodo.slice(5)) !== r.mes) return [];
    const f = fechaEnMes(periodo, r.dia);
    // El mes de inicio cuenta aunque el día ya haya pasado.
    if (periodo >= periodoDe(r.inicio) && (!r.fin || f <= r.fin)) out.push({ rec: r, clave: periodo, fecha: f });
  }
  return out.filter(i => !r.saltear?.includes(i.clave));
}

/** Los pagos de cada recurrente. Se arma una vez por versión de los datos: el
 *  arreglo de movimientos cambia de identidad cada vez que la base cambia. */
const indices = new WeakMap<Movimiento[], Map<string, Movimiento[]>>();
export function pagosPorRecurrente(movs: Movimiento[]) {
  let m = indices.get(movs);
  if (!m) { m = agrupar(movs.filter(x => x.recurrenteId), x => x.recurrenteId!); indices.set(movs, m); }
  return m;
}

export type Estado = "cargado" | "parcial" | "por-cargar" | "proximo";

export interface EstadoInstancia extends Instancia {
  esperado: number; // en la moneda del recurrente
  pagado: number;
  falta: number;
  estado: Estado;
  pagos: Movimiento[];
  /** Variable sin pagos: el monto es un estimado. */
  estimado: boolean;
  /** Ese mes fue 0 (lo marcaste así): resuelto sin pago. */
  cero: boolean;
}

/** Lo pagado, en la moneda del recurrente. Si pagaste desde otra moneda se pasa
 *  por USD con las cotizaciones de cada pago. */
function pagadoEn(r: Recurrente, pagos: Movimiento[], tasaRec: number | null) {
  return redondear(pagos.reduce((s, p) => {
    if (p.moneda === r.moneda) return s + p.monto;
    if (p.usd != null && tasaRec) return s + p.usd * tasaRec;
    return s;
  }, 0));
}

/** Para los variables: el promedio de las últimas 3 veces que se pagó. */
function estimado(r: Recurrente, historia: Movimiento[], clave: string, tasaRec: number | null) {
  const porClave = agrupar(historia.filter(m => m.recurrenteId === r.id && m.periodo! < clave), m => m.periodo!);
  const ultimas = [...porClave.keys()].sort().slice(-3).map(k => pagadoEn(r, porClave.get(k)!, tasaRec));
  if (!ultimas.length) return r.monto;
  return redondear(ultimas.reduce((a, b) => a + b, 0) / ultimas.length);
}

export function estadoDe(i: Instancia, movs: Movimiento[], tasaRec: number | null): EstadoInstancia {
  const r = i.rec;
  const pagos = movs.filter(m => m.recurrenteId === r.id && m.periodo === i.clave);
  if (r.enCero?.includes(i.clave) && !pagos.length)
    return { ...i, pagos, pagado: 0, esperado: 0, falta: 0, estado: "cargado", estimado: false, cero: true };
  const pagado = pagadoEn(r, pagos, tasaRec);
  const esperado = r.clase === "variable" ? estimado(r, movs, i.clave, tasaRec) : r.monto;
  let estado: Estado;
  if (pagos.length && (r.clase === "variable" || pagado >= esperado * 0.99)) estado = "cargado";
  else if (pagos.length) estado = "parcial";
  else estado = i.fecha <= hoy() ? "por-cargar" : "proximo";
  const esperadoFinal = r.clase === "variable" && pagos.length ? pagado : esperado;
  return {
    ...i, pagos, pagado, estado,
    esperado: esperadoFinal,
    falta: redondear(Math.max(0, esperadoFinal - pagado)),
    estimado: r.clase === "variable" && !pagos.length,
    cero: false,
  };
}

/** Los recurrentes en modo "se carga solo" que ya vencieron y no tienen pago.
 *  Una sola corrida a la vez (la app la dispara al abrir, al volver y al reconectar),
 *  y cada pago automático tiene id fijo: aunque dos corridas se crucen, no se duplica. */
let cargando: Promise<number> | null = null;
export function cargarAutomaticos() {
  return (cargando ??= cargarAutomaticosUnaVez().finally(() => { cargando = null; }));
}
async function cargarAutomaticosUnaVez() {
  const recs = (await db.recurrentes.toArray()).filter(r => r.activo && r.modo === "auto");
  if (!recs.length) return 0;
  const cuentas = new Map((await db.cuentas.toArray()).map(c => [c.id, c] as [string, Cuenta]));
  const h = hoy();
  let n = 0;
  for (const r of recs) {
    for (let p = periodoDe(r.inicio); p <= periodoDe(h); p = sumarMeses(p, 1)) {
      for (const i of instanciasDelMes(r, p)) {
        if (i.fecha > h || r.enCero?.includes(i.clave)) continue;
        const ya = await db.movimientos.where("[recurrenteId+periodo]").equals([r.id, i.clave]).count();
        if (ya) continue;
        const cot = await cotizar(r.moneda, i.fecha, cuentas.get(r.cuentaId)?.dolar ?? "blue");
        const ahora = new Date().toISOString();
        const id = `auto|${r.id}|${i.clave}`;
        if (await db.movimientos.get(id)) continue;
        await db.movimientos.add({
          id, tipo: r.tipo, fecha: i.fecha, monto: r.monto, moneda: r.moneda,
          usd: cot ? aUsd(r.monto, cot.tasa) : null, cotizacion: cot ?? undefined,
          cuentaId: r.cuentaId, categoriaId: r.categoriaId, etiquetas: [], comentario: r.nombre,
          recurrenteId: r.id, periodo: i.clave, creado: ahora, modificado: ahora,
        });
        n++;
      }
    }
  }
  return n;
}

/** ¿Este movimiento es el pago de un recurrente? Mismo tipo, cuenta y categoría,
 *  que caiga en una instancia todavía sin pagar y con un monto parecido (±25% si es
 *  fijo, ±50% si es variable), comparando en USD si las monedas difieren. */
export function recurrenteDe(m: Movimiento, recs: Recurrente[], movs: Movimiento[], tasa: (r: Recurrente) => number | null): { recurrenteId: string; periodo: string } | null {
  for (const r of recs) {
    if (!r.activo || r.tipo !== m.tipo || r.cuentaId !== m.cuentaId || r.categoriaId !== m.categoriaId) continue;
    const inst = instanciasDelMes(r, periodoDe(m.fecha)).find(i => r.frecuencia !== "semanal" || Math.abs(Number(i.clave.slice(8)) - Number(m.fecha.slice(8))) <= 3);
    if (!inst || movs.some(x => x.recurrenteId === r.id && x.periodo === inst.clave && x.id !== m.id)) continue;
    const t = tasa(r);
    const esperado = m.moneda === r.moneda ? r.monto : t && m.usd != null ? r.monto / t : null;
    const real = m.moneda === r.moneda ? m.monto : m.usd;
    if (esperado == null || real == null) continue;
    if (Math.abs(real - esperado) / esperado <= (r.clase === "fijo" ? 0.25 : 0.5)) return { recurrenteId: r.id, periodo: inst.clave };
  }
  return null;
}

/** El comentario del gasto nombra al recurrente ("gas", "Pago expensas"). */
export const nombraA = (m: Movimiento, r: Recurrente) => !!m.comentario && sinAcentos(m.comentario).includes(sinAcentos(r.nombre));

/** Qué tan parecido es un gasto al pago esperado de una instancia: 0 = idéntico.
 *  null si no puede ser (otro tipo, otro mes, ya vinculado, monto muy distinto). */
export function parecido(m: Movimiento, i: EstadoInstancia, tasa: number | null): number | null {
  const r = i.rec;
  if (m.tipo !== r.tipo || m.recurrenteId) return null;
  const mismoPeriodo = r.frecuencia === "semanal" ? Math.abs(aFecha(m.fecha).getTime() - aFecha(i.fecha).getTime()) <= 3 * 864e5 : periodoDe(m.fecha) === periodoDe(i.fecha);
  if (!mismoPeriodo) return null;
  const nombre = nombraA(m, r);
  if (!nombre && m.categoriaId !== r.categoriaId) return null;
  const esperado = i.estado === "parcial" ? i.falta : i.esperado;
  const real = m.moneda === r.moneda ? m.monto : tasa && m.usd != null ? m.usd * tasa : null;
  if (real == null || !esperado) return nombre ? 0.5 : null;
  const err = Math.abs(real - esperado) / esperado;
  if (!nombre && err > (r.clase === "fijo" ? 0.2 : 0.6)) return null;
  // Comparar entre monedas es aproximado (cotizaciones): pesa más que la cuenta.
  return (nombre ? 0 : 1) + err + (m.moneda === r.moneda ? 0 : 0.5) + (m.cuentaId === r.cuentaId ? 0 : 0.1);
}

/** Gastos ya cargados que podrían ser el pago de esta instancia, del más probable al menos. */
export function candidatos(i: EstadoInstancia, movs: Movimiento[], tasa: number | null): Movimiento[] {
  if (i.estado === "cargado") return [];
  return movs
    .map(m => ({ m, s: parecido(m, i, tasa) }))
    .filter((x): x is { m: Movimiento; s: number } => x.s != null)
    .sort((a, b) => a.s - b.s)
    .map(x => x.m);
}

/** Vincular sin preguntar solo si es claro: lo nombra, o misma moneda y monto a ±10%. */
export function esClaro(m: Pick<Movimiento, "monto" | "moneda" | "comentario">, i: EstadoInstancia) {
  const esperado = i.estado === "parcial" ? i.falta : i.esperado;
  return nombraA(m as Movimiento, i.rec) || (m.moneda === i.rec.moneda && esperado > 0 && Math.abs(m.monto - esperado) / esperado <= 0.1);
}

/** Empareja gastos sueltos con instancias pendientes: cada gasto va a la instancia a
 *  la que más se parece, y cada instancia recibe como mucho uno. */
export function sugerirVinculos(insts: EstadoInstancia[], movs: Movimiento[], tasa: (r: Recurrente) => number | null, descartado: (movId: string, recId: string) => boolean) {
  const pares: { inst: EstadoInstancia; mov: Movimiento; s: number }[] = [];
  const pendientes = insts.filter(i => i.estado !== "cargado");
  if (!pendientes.length) return new Map<string, Movimiento>();
  // Solo importan los gastos sueltos del mes de cada instancia (±3 días en las semanales).
  const fechas = pendientes.map(i => i.fecha).sort();
  const desde = sumarDias(`${periodoDe(fechas[0])}-01`, -3), hasta = sumarDias(fechaEnMes(periodoDe(fechas[fechas.length - 1]), 31), 3);
  const cerca = movs.filter(m => !m.recurrenteId && m.fecha >= desde && m.fecha <= hasta);
  for (const inst of pendientes) {
    for (const mov of cerca) {
      const s = parecido(mov, inst, tasa(inst.rec));
      if (s != null && !descartado(mov.id, inst.rec.id)) pares.push({ inst, mov, s });
    }
  }
  pares.sort((a, b) => a.s - b.s);
  const usadosM = new Set<string>(), usadosI = new Set<string>();
  const out = new Map<string, Movimiento>(); // clave de instancia → gasto
  for (const p of pares) {
    const ki = p.inst.rec.id + p.inst.clave;
    if (usadosM.has(p.mov.id) || usadosI.has(ki)) continue;
    usadosM.add(p.mov.id); usadosI.add(ki); out.set(ki, p.mov);
  }
  return out;
}
