import type { useDatos } from "../datos";
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
  total: number;
}

export function pendientes(d: ReturnType<typeof useDatos>, ultimoRespaldo: string | null): Pendientes {
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
  return {
    clases, recurrentes, objetivos, precios, cierres, respaldo,
    total: clases.length + recurrentes.length + objetivos.length + precios.length + cierres.length + (respaldo ? 1 : 0),
  };
}
