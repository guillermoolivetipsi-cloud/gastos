import { useMemo } from "react";
import type { Datos } from "../datos";
import type { Categoria, Moneda, Movimiento, Tipo } from "../tipos";
import { recurrentesDelMes } from "../lib/analisis";
import { hoy, periodoDe, sumarDias, sumarMeses } from "../lib/fecha";
import { nombraA, parecido, type EstadoInstancia } from "../lib/recurrentes";

/* La lógica de la pantalla de carga, separada de cómo se ve: qué categorías mostrar
   primero, qué gastos repetís, qué etiquetas sugerir y si el gasto parece el pago de
   un recurrente. Funciones puras (se prueban solas) y un hook que las memoriza. */

/** Las categorías de ese tipo, primero las que más usaste en los últimos 90 días. */
export function categoriasPorUso(movs: Movimiento[], cats: Categoria[], tipo: Tipo, seleccionada: string) {
  const desde = sumarDias(hoy(), -90);
  const uso = new Map<string, number>();
  for (const m of movs) if (m.tipo === tipo && m.fecha >= desde) uso.set(m.categoriaId, (uso.get(m.categoriaId) ?? 0) + 1);
  return cats.filter(c => c.tipo === tipo && (!c.archivada || c.id === seleccionada))
    .sort((a, b) => (uso.get(b.id) ?? 0) - (uso.get(a.id) ?? 0) || a.orden - b.orden);
}

/** Lo que repetiste al menos dos veces en 60 días (misma categoría, comentario, monto,
 *  moneda y cuenta): para cargarlo con un toque. Los 6 más frecuentes. */
export function gastosFrecuentes(movs: Movimiento[]) {
  const desde = sumarDias(hoy(), -60);
  const grupos = new Map<string, { m: Movimiento; n: number }>();
  for (const m of movs) {
    if (m.tipo !== "gasto" || m.fecha < desde || m.recurrenteId || (m.cuotas ?? 1) > 1) continue;
    const k = [m.categoriaId, (m.comentario ?? "").toLowerCase(), m.monto, m.moneda, m.cuentaId].join("|");
    const g = grupos.get(k);
    grupos.set(k, { m: !g || m.fecha > g.m.fecha ? m : g.m, n: (g?.n ?? 0) + 1 });
  }
  return [...grupos.values()].filter(g => g.n >= 2).sort((a, b) => b.n - a.n).slice(0, 6).map(g => g.m);
}

export interface Borrador {
  tipo: Tipo; fecha: string; monto: number; moneda: Moneda; usd: number | null;
  cuentaId: string; categoriaId: string; comentario: string;
}

/** El recurrente pendiente (este mes o el anterior) al que más se parece el gasto que
 *  estás cargando: lo nombra en el comentario, misma categoría, monto cercano. */
export function recurrenteParecido(b: Borrador, pendientes: EstadoInstancia[], tasa: Datos["tasaRec"]): EstadoInstancia | null {
  const m = { ...b, id: "", etiquetas: [], creado: "", modificado: "" } as Movimiento;
  let mejor: { i: EstadoInstancia; s: number } | null = null;
  for (const i of pendientes) {
    // Sin monto todavía, alcanza con la categoría o el nombre para sugerir.
    const s = b.monto > 0 ? parecido({ ...m, fecha: i.fecha }, i, tasa(i.rec))
      : nombraA(m, i.rec) ? 0 : i.rec.categoriaId === b.categoriaId && i.estado !== "proximo" ? 1 : null;
    if (s != null && (!mejor || s < mejor.s)) mejor = { i, s };
  }
  return mejor?.i ?? null;
}

/** La sugerencia de recurrente para la pantalla de carga. Lo pesado (los recurrentes
 *  sin pagar del mes) se calcula una vez por mes elegido, no en cada tecla. */
export function useRecurrenteSugerido(d: Datos, b: Borrador, activa: boolean, rechazados: string[]) {
  const periodo = periodoDe(b.fecha);
  const pendientes = useMemo(() => [periodo, sumarMeses(periodo, -1)]
    .flatMap(p => recurrentesDelMes(d.recurrentes, d.movimientos, p, d.tasaRec))
    .filter(i => i.estado !== "cargado"), [d.recurrentes, d.movimientos, d.tasaRec, periodo]);
  return useMemo(() => {
    if (!activa || (!b.categoriaId && !b.comentario.trim())) return null;
    return recurrenteParecido(b, pendientes.filter(i => !rechazados.includes(i.rec.id + i.clave)), d.tasaRec);
  }, [activa, b.tipo, b.fecha, b.monto, b.moneda, b.usd, b.cuentaId, b.categoriaId, b.comentario, pendientes, rechazados, d.tasaRec]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Categorías de cada etiqueta: las que elegiste a mano (en Etiquetas) o, si no, las
 *  categorías donde la usaste. */
export function categoriasDeEtiquetas(movs: Movimiento[], asignadas: Record<string, string[]>) {
  const usadas = new Map<string, Map<string, number>>();
  for (const m of movs) for (const e of m.etiquetas) {
    const porCat = usadas.get(e) ?? new Map<string, number>();
    porCat.set(m.categoriaId, (porCat.get(m.categoriaId) ?? 0) + 1);
    usadas.set(e, porCat);
  }
  const todas = new Set([...usadas.keys(), ...Object.keys(asignadas)]);
  const out = new Map<string, { cats: string[]; usos: number }>();
  for (const e of todas) {
    const u = usadas.get(e);
    const usos = u ? [...u.values()].reduce((a, b) => a + b, 0) : 0;
    out.set(e, { cats: asignadas[e]?.length ? asignadas[e] : u ? [...u.keys()] : [], usos });
  }
  return out;
}

/** Para la carga: las etiquetas de la categoría elegida (las más usadas primero) y el
 *  resto aparte, para "+ otras etiquetas". Sin las que dejaste de sugerir. */
export function etiquetasParaCategoria(mapa: Map<string, { cats: string[]; usos: number }>, categoriaId: string, ocultas: string[]) {
  const visibles = [...mapa.entries()].filter(([e]) => !ocultas.includes(e)).sort((a, b) => b[1].usos - a[1].usos || a[0].localeCompare(b[0]));
  return {
    propias: visibles.filter(([, v]) => v.cats.includes(categoriaId)).map(([e]) => e),
    otras: visibles.filter(([, v]) => !v.cats.includes(categoriaId)).map(([e]) => e),
  };
}
