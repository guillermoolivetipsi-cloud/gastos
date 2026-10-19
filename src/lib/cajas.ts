import type { Movimiento, Recurrente } from "../tipos";
import { instanciasDelMes, nombraA } from "./recurrentes";
import type { SugerenciaRecurrente } from "./analisis";
import { sinAcentos } from "./formato";

/* Lo que hay adentro de las cajas de Gastos (Recurrentes y No recurrentes), para verlo y
   corregirlo (regla de las cajas). Funciones puras. */

/** Los gastos no recurrentes que parecen recurrentes: los que se repitieron todos los meses
 *  (una sugerencia de «Recurrentes que encontré») o nombran a un recurrente que ya tenés.
 *  Para cada uno, el recurrente al que se parece (o null si es algo nuevo que se repite). */
export function pareceRecurrente(movs: Movimiento[], sugerencias: SugerenciaRecurrente[], recs: Recurrente[]) {
  const claves = new Set(sugerencias.map(s => s.clave));
  const activos = recs.filter(r => r.activo && r.tipo === "gasto");
  const out = new Map<string, Recurrente | null>();
  for (const m of movs) {
    const r = activos.find(x => nombraA(m, x));
    if (r) out.set(m.id, r);
    else if (claves.has(`${m.tipo}|${m.categoriaId}|${sinAcentos(m.comentario || m.etiquetas[0] || "")}`)) out.set(m.id, null);
  }
  return out;
}

/** A qué vez de un recurrente corresponde un gasto de esa fecha: la del mes (o, en los
 *  semanales, la de la fecha más cercana). */
export function claveDe(r: Recurrente, fecha: string) {
  const insts = instanciasDelMes(r, fecha.slice(0, 7));
  if (!insts.length) return fecha.slice(0, 7);
  const dist = (f: string) => Math.abs(new Date(f).getTime() - new Date(fecha).getTime());
  return [...insts].sort((a, b) => dist(a.fecha) - dist(b.fecha))[0].clave;
}
