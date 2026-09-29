import type { Cuenta, Movimiento } from "../tipos";
import { aTexto, diaLocal, nombreMes, periodoDe, sumarMeses } from "./fecha";

/* Recordatorios. Viven como tareas en "Para revisar" y no se van hasta que las
   hacés; cuando haya notificaciones, estas mismas tareas son las que avisan. */

export interface Recordatorios {
  diario: { activo: boolean; hora: string };
  resumen: { activo: boolean; dia: number };
  exportar: { activo: boolean; dia: number };
}

export const RECORDATORIOS: Recordatorios = {
  diario: { activo: true, hora: "21:00" },
  resumen: { activo: true, dia: 1 },
  exportar: { activo: true, dia: 1 },
};

export type Tarea =
  | { tipo: "diario"; clave: string; titulo: string; detalle: string }
  | { tipo: "resumen"; clave: string; titulo: string; detalle: string; cuenta: Cuenta; periodo: string }
  | { tipo: "exportar"; clave: string; titulo: string; detalle: string; periodo: string };

const horaDe = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Lo pendiente en el momento `ahora` (por defecto, ya). Con otro momento sirve para
 *  saber qué avisar los próximos días. */
export function tareas(r: Recordatorios, cuentas: Cuenta[], movs: Movimiento[], resumenesCargados: Record<string, string>, ultimaExportacion: string | null, hechas: Set<string>, ahora = new Date()): Tarea[] {
  const out: Tarea[] = [];
  const h = aTexto(ahora), dia = Number(h.slice(8)), esteMes = periodoDe(h), anterior = sumarMeses(esteMes, -1);
  let primera = h;
  for (const m of movs) if (m.fecha < primera) primera = m.fecha;
  const primerMes = periodoDe(primera);

  if (r.diario.activo && horaDe(ahora) >= r.diario.hora && !movs.some(m => m.tipo === "gasto" && !m.id.startsWith("auto|") && (diaLocal(m.creado) === h || m.fecha === h))) {
    const clave = `diario|${h}`;
    if (!hechas.has(clave)) out.push({ tipo: "diario", clave, titulo: "¿Cargaste los gastos de hoy?", detalle: "Todavía no anotaste nada hoy." });
  }

  // El resumen que cerró el mes pasado: se carga a principio de este mes. Solo desde
  // que la tarjeta se registra completa (el historial de la app anterior no cuenta).
  if (r.resumen.activo && dia >= r.resumen.dia) {
    for (const c of cuentas.filter(c => c.esTarjeta && !c.archivada)) {
      const dias = movs.filter(m => m.cuentaId === c.id && periodoDe(m.fecha) === anterior).map(m => Number(m.fecha.slice(8)));
      if (dias.length < 3 || Math.min(...dias) > 10) continue;
      const clave = `resumen|${c.id}|${anterior}`;
      if (resumenesCargados[`${c.id}|${anterior}`] || hechas.has(clave)) continue;
      out.push({ tipo: "resumen", clave, cuenta: c, periodo: anterior, titulo: `Subí el resumen de ${c.nombre}`, detalle: `El que cerró en ${nombreMes(anterior, false)}. Lo comparo con lo cargado y te pregunto lo que falte.` });
    }
  }

  if (r.exportar.activo && dia >= r.exportar.dia && anterior >= primerMes) {
    const clave = `exportar|${anterior}`;
    const exportadoEsteMes = ultimaExportacion != null && diaLocal(ultimaExportacion).slice(0, 7) >= esteMes;
    const quedan = movs.some(m => !m.exportado && periodoDe(m.fecha) <= anterior);
    if (!exportadoEsteMes && quedan && !hechas.has(clave))
      out.push({ tipo: "exportar", clave, periodo: anterior, titulo: `Exportá ${nombreMes(anterior, false)} a Finanzas`, detalle: "Hay movimientos del mes pasado que todavía no mandaste." });
  }
  return out;
}
