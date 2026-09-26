import { db, leerAjuste, guardarAjuste } from "../db";
import { descartesSet } from "./analisis";
import { RECORDATORIOS, tareas, type Recordatorios, type Tarea } from "./recordatorios";

/* Qué avisar cuando Android despierta la app. Son las mismas tareas de "Para
   revisar". El aviso del día sale una vez por día; los mensuales (resumen,
   exportar) se repiten cada 3 días mientras sigan pendientes. */

const REPETIR_CADA = 3 * 24 * 60 * 60 * 1000;

export function aAvisar(ts: Tarea[], avisados: Record<string, string>, ahora = Date.now()): Tarea[] {
  return ts.filter(t => {
    const ultimo = avisados[t.clave];
    if (!ultimo) return true;
    return t.tipo !== "diario" && ahora - new Date(ultimo).getTime() >= REPETIR_CADA;
  });
}

/** Lee la base, decide y devuelve lo que hay que avisar (y lo marca como avisado). */
export async function avisosPendientes(): Promise<Tarea[]> {
  if (!(await leerAjuste<boolean>("notificaciones", false))) return [];
  const [cuentas, movimientos, descartes] = await Promise.all([db.cuentas.toArray(), db.movimientos.toArray(), db.descartes.toArray()]);
  const ts = tareas(
    await leerAjuste<Recordatorios>("recordatorios", RECORDATORIOS),
    cuentas, movimientos,
    await leerAjuste<Record<string, string>>("resumenesCargados", {}),
    await leerAjuste<string | null>("ultimaExportacion", null),
    descartesSet(descartes),
  );
  const avisados = await leerAjuste<Record<string, string>>("avisados", {});
  const nuevos = aAvisar(ts, avisados);
  if (nuevos.length) {
    const ahora = new Date().toISOString();
    // Se guardan solo los últimos 60 para que no crezca sin fin.
    const todos = { ...avisados, ...Object.fromEntries(nuevos.map(t => [t.clave, ahora])) };
    await guardarAjuste("avisados", Object.fromEntries(Object.entries(todos).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 60)));
  }
  return nuevos;
}
