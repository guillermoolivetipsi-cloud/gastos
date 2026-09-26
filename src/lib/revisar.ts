import { useLiveQuery } from "dexie-react-hooks";
import type { useDatos } from "../datos";
import { leerAjuste } from "../db";
import { RECORDATORIOS, tareas, type Recordatorios, type Tarea } from "./recordatorios";
import { cambiosDePrecio, cierresDudosos, descartesSet, detectarRecurrentes, sugerirClase, sugerirObjetivo, type CambioPrecio, type CierreDudoso, type SugerenciaClase, type SugerenciaObjetivo, type SugerenciaRecurrente } from "./analisis";
import { diasEntre, hoy } from "./fecha";

/* La bandeja "Para revisar": todo lo que la app te propone, en un solo lugar.
   Nada de esto se aplica solo; vos confirmás o cambiás. */

export interface Pendientes {
  clases: SugerenciaClase[];
  recurrentes: SugerenciaRecurrente[];
  objetivos: SugerenciaObjetivo[];
  precios: CambioPrecio[];
  cierres: CierreDudoso[];
  respaldo: boolean;
  tareas: Tarea[];
  total: number;
}

export interface Extras {
  ultimoRespaldo: string | null;
  recordatorios: Recordatorios;
  resumenesCargados: Record<string, string>;
  ultimaExportacion: string | null;
}

/** Los ajustes que necesita la bandeja. undefined mientras cargan. */
export function useExtras(): Extras | undefined {
  return useLiveQuery(async () => ({
    ultimoRespaldo: await leerAjuste<string | null>("ultimoRespaldo", null),
    recordatorios: await leerAjuste<Recordatorios>("recordatorios", RECORDATORIOS),
    resumenesCargados: await leerAjuste<Record<string, string>>("resumenesCargados", {}),
    ultimaExportacion: await leerAjuste<string | null>("ultimaExportacion", null),
  }), []);
}

export function pendientes(d: ReturnType<typeof useDatos>, x: Extras): Pendientes {
  const ultimoRespaldo = x.ultimoRespaldo;
  const ds = descartesSet(d.descartes);
  const activas = d.categorias.filter(c => !c.archivada);
  const clases = activas
    .filter(c => c.tipo === "gasto" && !c.claseConfirmada)
    .map(c => sugerirClase(c, d.movimientos))
    .filter((s): s is SugerenciaClase => !!s);
  const recurrentes = detectarRecurrentes(d.movimientos, d.categorias, d.recurrentes, ds);
  // El objetivo se sugiere para variables sin objetivo (las fijas ya tienen su monto).
  const objetivos = activas
    .filter(c => c.tipo === "gasto" && c.objetivo == null && (c.clase ?? "variable") === "variable" && !ds.has(`obj|${c.id}`))
    .map(c => sugerirObjetivo(c, d.movimientos))
    .filter((s): s is SugerenciaObjetivo => !!s);
  const precios = cambiosDePrecio(d.recurrentes, d.movimientos, ds);
  const cierres = cierresDudosos(d.cuentas, d.movimientos);
  const hayDatos = d.movimientos.length >= 20;
  const respaldo = hayDatos && (!ultimoRespaldo || diasEntre(ultimoRespaldo.slice(0, 10), hoy()) >= 7);
  const ts = tareas(x.recordatorios, d.cuentas, d.movimientos, x.resumenesCargados, x.ultimaExportacion, ds);
  return {
    clases, recurrentes, objetivos, precios, cierres, respaldo, tareas: ts,
    total: ts.length + clases.length + recurrentes.length + objetivos.length + precios.length + cierres.length + (respaldo ? 1 : 0),
  };
}
